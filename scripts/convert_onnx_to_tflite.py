#!/usr/bin/env python3

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path


def find_generated_tflite(work_root: Path, quantization: str) -> Path | None:
    candidates = []
    if quantization == "none":
        candidates = ["_float32.tflite"]
    elif quantization == "fp16":
        candidates = ["_float16.tflite"]
    elif quantization == "dynamic":
        candidates = ["_dynamic_range_quant.tflite"]
    elif quantization == "int8":
        candidates = ["_integer_quant.tflite", "_full_integer_quant.tflite"]

    generated_files = sorted(work_root.rglob("*.tflite"))
    for suffix in candidates:
        for generated_file in generated_files:
            if generated_file.name.endswith(suffix):
                return generated_file
    return generated_files[0] if generated_files else None


def parse_overwrite_input_shapes(
    overwrite_args: list[str],
) -> dict[str, list[int]]:
    overrides: dict[str, list[int]] = {}
    for override_arg in overwrite_args:
        name, separator, raw_shape = override_arg.partition(":")
        if not separator or not name or not raw_shape:
            raise ValueError(
                f"Invalid --overwrite-input-shape value: {override_arg!r}"
            )
        dims = [int(dim.strip()) for dim in raw_shape.split(",") if dim.strip()]
        if not dims:
            raise ValueError(
                f"Invalid --overwrite-input-shape value: {override_arg!r}"
            )
        overrides[name] = dims
    return overrides


def apply_static_input_shape_overrides(
    model_path: Path, overwrite_args: list[str], work_root: Path
) -> tuple[Path, dict[str, list[int]]]:
    if not overwrite_args:
        return model_path, {}

    try:
        import onnx
    except Exception as exc:
        raise RuntimeError(
            f"Failed to import onnx while applying input shape overrides: {exc}"
        ) from exc

    overrides = parse_overwrite_input_shapes(overwrite_args)
    rewritten_model_path = work_root / "static_input_shape.onnx"
    onnx_model = onnx.load(str(model_path))
    initializer_names = {initializer.name for initializer in onnx_model.graph.initializer}

    applied_inputs: dict[str, list[int]] = {}
    for value in onnx_model.graph.input:
        if value.name in initializer_names or value.name not in overrides:
            continue

        dims = value.type.tensor_type.shape.dim
        override_shape = overrides[value.name]
        if len(dims) != len(override_shape):
            raise ValueError(
                "Input shape rank mismatch for "
                f"{value.name!r}: model rank {len(dims)}, override rank {len(override_shape)}"
            )

        for dim_proto, dim_value in zip(dims, override_shape):
            dim_proto.ClearField("dim_param")
            dim_proto.dim_value = int(dim_value)
        applied_inputs[value.name] = list(override_shape)

    missing_inputs = sorted(set(overrides.keys()) - set(applied_inputs.keys()))
    if missing_inputs:
        raise ValueError(
            "Unable to apply --overwrite-input-shape for input(s): "
            + ", ".join(missing_inputs)
        )

    onnx.save(onnx_model, str(rewritten_model_path))
    return rewritten_model_path, applied_inputs


def collect_value_shapes(onnx_model) -> dict[str, list[int | None]]:
    shape_map: dict[str, list[int | None]] = {}
    value_infos = (
        list(onnx_model.graph.input)
        + list(onnx_model.graph.value_info)
        + list(onnx_model.graph.output)
    )
    for value_info in value_infos:
        tensor_type = getattr(value_info.type, "tensor_type", None)
        if tensor_type is None:
            continue
        dims: list[int | None] = []
        for dim in tensor_type.shape.dim:
            dims.append(int(dim.dim_value) if dim.HasField("dim_value") else None)
        shape_map[value_info.name] = dims
    return shape_map


def collect_graph_input_shapes(model_path: Path) -> list[dict[str, list[int | None]]]:
    try:
        import onnx
    except Exception:
        return []

    onnx_model = onnx.load(str(model_path))
    initializer_names = {initializer.name for initializer in onnx_model.graph.initializer}
    inputs: list[dict[str, list[int | None]]] = []
    for value in onnx_model.graph.input:
        if value.name in initializer_names:
            continue
        tensor_type = getattr(value.type, "tensor_type", None)
        if tensor_type is None:
            continue
        dims: list[int | None] = []
        for dim in tensor_type.shape.dim:
            dims.append(int(dim.dim_value) if dim.HasField("dim_value") else None)
        inputs.append({"name": value.name, "shape": dims})
    return inputs


def build_add_channel_bias_param_replacement_file(
    model_path: Path, work_root: Path
) -> tuple[Path | None, int]:
    try:
        import onnx
        from onnx import numpy_helper
    except Exception:
        return None, 0

    onnx_model = onnx.load(str(model_path))
    try:
        shape_source_model = onnx.shape_inference.infer_shapes(onnx_model)
    except Exception:
        shape_source_model = onnx_model

    shape_map = collect_value_shapes(shape_source_model)
    initializers = {
        initializer.name: numpy_helper.to_array(initializer)
        for initializer in onnx_model.graph.initializer
    }

    operations = []
    for node in onnx_model.graph.node:
        if node.op_type != "Add" or len(node.input) != 2 or not node.name:
            continue

        initializer_inputs = [name for name in node.input if name in initializers]
        if len(initializer_inputs) != 1:
            continue

        initializer_name = initializer_inputs[0]
        other_input_name = next(name for name in node.input if name != initializer_name)
        initializer_value = initializers[initializer_name]
        other_input_shape = shape_map.get(other_input_name)

        if initializer_value.ndim != 4:
            continue
        if initializer_value.shape[0] != 1 or initializer_value.shape[2:] != (1, 1):
            continue
        if other_input_shape is None or len(other_input_shape) != 4:
            continue

        channel_dim = other_input_shape[1]
        if channel_dim is None or int(channel_dim) != int(initializer_value.shape[1]):
            continue

        operations.append(
            {
                "op_name": node.name,
                "param_target": "inputs",
                "param_name": initializer_name,
                # Feed the bias back to onnx2tf as 1D channel values so its
                # NHWC-side broadcast logic can reshape it to the last axis.
                "values": initializer_value.reshape(-1).astype("float32").tolist(),
            }
        )

    if not operations:
        return None, 0

    replacement_path = work_root / "param_replacement.json"
    replacement_path.write_text(
        json.dumps({"operations": operations}, indent=2), encoding="utf-8"
    )
    return replacement_path, len(operations)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert an ONNX model to TFLite with onnx2tf."
    )
    parser.add_argument("model_path", help="Path to the input ONNX model")
    parser.add_argument("output_path", help="Path to the output TFLite file")
    parser.add_argument(
        "--quantization",
        default="none",
        choices=["none", "fp16", "int8", "dynamic"],
        help="Quantization mode",
    )
    parser.add_argument(
        "--not-use-onnxsim",
        action="store_true",
        help="Disable the onnxsim optimization pass inside onnx2tf",
    )
    parser.add_argument(
        "--overwrite-input-shape",
        action="append",
        default=[],
        help='Override a dynamic input shape, e.g. "x:1,3,160,160"',
    )
    args = parser.parse_args()

    try:
        from onnx2tf import convert
    except Exception as exc:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": f"Failed to import onnx2tf: {exc}",
                }
            )
        )
        return 1

    output_path = Path(args.output_path).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    work_root = Path(
        tempfile.mkdtemp(prefix=".tflite-work-", dir=str(output_path.parent))
    )

    try:
        effective_model_path, applied_input_shape_overrides = (
            apply_static_input_shape_overrides(
                Path(args.model_path).resolve(), args.overwrite_input_shape, work_root
            )
        )
        param_replacement_file, param_replacement_count = (
            build_add_channel_bias_param_replacement_file(
                effective_model_path, work_root
            )
        )
        graph_inputs = collect_graph_input_shapes(effective_model_path)
        preserve_nchw_inputs = [
            input_info["name"]
            for input_info in graph_inputs
            if len(input_info["shape"]) in (3, 4, 5)
        ]
        convert_opts = {
            "input_onnx_file_path": str(effective_model_path),
            "output_folder_path": str(work_root),
            "copy_onnx_input_output_names_to_tflite": True,
            "not_use_onnxsim": args.not_use_onnxsim,
            "non_verbose": True,
        }
        if preserve_nchw_inputs:
            convert_opts["keep_ncw_or_nchw_or_ncdhw_input_names"] = preserve_nchw_inputs
            convert_opts["keep_shape_absolutely_input_names"] = preserve_nchw_inputs
        if param_replacement_file is not None:
            convert_opts["param_replacement_file"] = str(param_replacement_file)

        if args.quantization == "int8":
            convert_opts["output_integer_quantized_tflite"] = True
            convert_opts["quant_type"] = "per-channel"
        elif args.quantization == "dynamic":
            convert_opts["output_dynamic_range_quantized_tflite"] = True

        try:
            convert(**convert_opts)
        except Exception as exc:
            print(
                json.dumps(
                    {
                        "success": False,
                        "error": f"TFLite conversion failed: {exc}",
                    }
                )
            )
            return 1

        generated_tflite = find_generated_tflite(work_root, args.quantization)
        if generated_tflite is None or not generated_tflite.exists():
            print(
                json.dumps(
                    {
                        "success": False,
                        "error": f"No TFLite output was created under {work_root}",
                    }
                )
            )
            return 1

        shutil.copyfile(generated_tflite, output_path)
        output_size = output_path.stat().st_size
        print(
            json.dumps(
                {
                    "success": True,
                    "output_path": str(output_path),
                    "output_size": output_size,
                    "generated_tflite": str(generated_tflite),
                    "quantization": args.quantization,
                    "not_use_onnxsim": args.not_use_onnxsim,
                    "overwrite_input_shape": args.overwrite_input_shape,
                    "applied_input_shape_overrides": applied_input_shape_overrides,
                    "effective_model_path": str(effective_model_path),
                    "keep_nchw_inputs": preserve_nchw_inputs,
                    "param_replacement_file": str(param_replacement_file)
                    if param_replacement_file is not None
                    else None,
                    "param_replacement_count": param_replacement_count,
                    "method": "onnx2tf",
                }
            )
        )
        return 0
    finally:
        shutil.rmtree(work_root, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
