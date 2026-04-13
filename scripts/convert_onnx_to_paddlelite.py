#!/usr/bin/env python3

import argparse
import contextlib
import io
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def find_paddle_model(root: Path):
    pdmodel_files = sorted(root.rglob("*.pdmodel"))
    for pdmodel in pdmodel_files:
        pdiparams = pdmodel.with_suffix(".pdiparams")
        if pdiparams.exists():
            return pdmodel, pdiparams

    model_files = sorted(root.rglob("__model__"))
    for model_file in model_files:
        param_file = model_file.parent / "__params__"
        if param_file.exists():
            return model_file, param_file

    return None, None


def find_nb_output(root: Path):
    nb_files = sorted(root.rglob("*.nb"))
    if nb_files:
        return nb_files[0]
    return None


def export_legacy_inference_model(onnx_model_path: Path, x2paddle_root: Path):
    code_file = x2paddle_root / "x2paddle_code.py"
    params_file = x2paddle_root / "model.pdparams"
    if not code_file.exists() or not params_file.exists():
        raise RuntimeError(
            f"Expected x2paddle_code.py and model.pdparams under {x2paddle_root}"
        )

    legacy_dir = x2paddle_root / "legacy_inference"
    legacy_dir.mkdir(parents=True, exist_ok=True)
    exporter_script = r"""
import contextlib
import importlib.util
import inspect
import sys
from pathlib import Path

import onnx
import paddle

onnx_model_path = Path(sys.argv[1]).resolve()
x2paddle_root = Path(sys.argv[2]).resolve()
legacy_dir = x2paddle_root / "legacy_inference"
legacy_dir.mkdir(parents=True, exist_ok=True)

onnx_model = onnx.load(str(onnx_model_path))
input_specs = []
for value in onnx_model.graph.input:
    tensor_type = value.type.tensor_type
    dims = []
    for dim in tensor_type.shape.dim:
        dims.append(int(dim.dim_value) if dim.HasField("dim_value") else -1)
    np_dtype = onnx.helper.tensor_dtype_to_np_dtype(tensor_type.elem_type)
    dtype_name = getattr(np_dtype, "name", str(np_dtype))
    input_specs.append(
        paddle.static.InputSpec(shape=dims, name=value.name, dtype=dtype_name)
    )

code_file = x2paddle_root / "x2paddle_code.py"
module_name = f"x2paddle_generated_{Path(str(x2paddle_root)).name}"
spec = importlib.util.spec_from_file_location(module_name, code_file)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to import generated x2paddle module: {code_file}")

module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

model_cls = None
for value in vars(module).values():
    if (
        inspect.isclass(value)
        and issubclass(value, paddle.nn.Layer)
        and value is not paddle.nn.Layer
    ):
        model_cls = value
        break

if model_cls is None:
    raise RuntimeError(f"Unable to find generated Paddle model class in {code_file}")

state_dict = paddle.load(str(x2paddle_root / "model.pdparams"))
model = model_cls()
model.set_dict(state_dict)
model.eval()

guard_factory = getattr(paddle.pir_utils, "OldIrGuard", None)
guard = guard_factory() if guard_factory is not None else contextlib.nullcontext()
with guard:
    static_model = paddle.jit.to_static(model, input_spec=input_specs, full_graph=True)
    paddle.jit.save(static_model, str(legacy_dir / "model"))
"""
    completed = subprocess.run(
        [sys.executable, "-c", exporter_script, str(onnx_model_path), str(x2paddle_root)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stdout.strip())

    legacy_model_file = legacy_dir / "model.pdmodel"
    legacy_param_file = legacy_dir / "model.pdiparams"
    if not legacy_model_file.exists() or not legacy_param_file.exists():
        raise RuntimeError(
            f"Legacy Paddle inference model was not created under {legacy_dir}"
        )
    return legacy_model_file, legacy_param_file


def run(command):
    completed = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
    )
    return completed.returncode, completed.stdout


def run_x2paddle_library(model_path: Path, save_dir: Path):
    output_buffer = io.StringIO()
    try:
        with contextlib.redirect_stdout(output_buffer), contextlib.redirect_stderr(
            output_buffer
        ):
            from x2paddle.convert import onnx2paddle

            onnx2paddle(
                str(model_path),
                str(save_dir),
                enable_onnx_checker=False,
                disable_feedback=True,
            )
        return 0, output_buffer.getvalue()
    except Exception:
        return 1, output_buffer.getvalue() + traceback_text()


def traceback_text():
    import traceback

    return traceback.format_exc()


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Convert an ONNX model to Paddle Lite naive_buffer with "
            "x2paddle (front-half) + paddle + opt (back-half)."
        )
    )
    parser.add_argument("model_path", help="Path to the input ONNX model")
    parser.add_argument("output_path", help="Path to the output Paddle Lite .nb file")
    parser.add_argument(
        "--opt",
        required=True,
        help="Path to Paddle Lite opt executable",
    )
    parser.add_argument(
        "--valid-targets",
        default="arm",
        help="Paddle Lite valid_targets value",
    )
    args = parser.parse_args()

    model_path = Path(args.model_path).resolve()
    output_path = Path(args.output_path).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    work_root = output_path.parent / f".paddlelite-work-{os.getpid()}"
    x2paddle_dir = work_root / "x2paddle_out"
    opt_out_base = work_root / "optimized_model"

    if work_root.exists():
        shutil.rmtree(work_root)
    work_root.mkdir(parents=True, exist_ok=True)

    try:
        code, output = run_x2paddle_library(model_path, x2paddle_dir)
        if code != 0:
            print(
                json.dumps(
                    {
                        "success": False,
                        "stage": "x2paddle",
                        "error": output,
                    }
                )
            )
            return code or 1

        model_file, param_file = find_paddle_model(x2paddle_dir)
        if not model_file or not param_file:
            try:
                model_file, param_file = export_legacy_inference_model(
                    model_path, x2paddle_dir
                )
            except Exception as exc:
                print(
                    json.dumps(
                        {
                            "success": False,
                            "stage": "export_legacy_inference_model",
                            "error": str(exc),
                        }
                    )
                )
                return 1

        code, output = run(
            [
                args.opt,
                f"--model_file={str(model_file)}",
                f"--param_file={str(param_file)}",
                "--optimize_out_type=naive_buffer",
                f"--optimize_out={str(opt_out_base)}",
                f"--valid_targets={args.valid_targets}",
            ]
        )
        if code != 0:
            print(
                json.dumps(
                    {
                        "success": False,
                        "stage": "paddlelite_opt",
                        "error": output,
                    }
                )
            )
            return code or 1

        nb_file = find_nb_output(work_root)
        if not nb_file:
            expected = Path(f"{opt_out_base}.nb")
            if expected.exists():
                nb_file = expected

        if not nb_file or not nb_file.exists():
            print(
                json.dumps(
                    {
                        "success": False,
                        "stage": "scan_nb",
                        "error": f"Unable to find generated .nb file under {work_root}",
                    }
                )
            )
            return 1

        shutil.copyfile(nb_file, output_path)

        print(
            json.dumps(
                {
                    "success": True,
                    "output_path": str(output_path),
                    "output_size": output_path.stat().st_size,
                    "x2paddle_dir": str(x2paddle_dir),
                    "paddle_model_file": str(model_file),
                    "paddle_param_file": str(param_file),
                    "nb_file": str(nb_file),
                    "valid_targets": args.valid_targets,
                }
            )
        )
        return 0
    finally:
        if work_root.exists():
            shutil.rmtree(work_root, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
