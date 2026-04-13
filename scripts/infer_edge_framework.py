#!/usr/bin/env python3

from __future__ import annotations

import argparse
import tempfile
import zipfile
from pathlib import Path

import numpy as np


def element_count(shape: list[int]) -> int:
    count = 1
    for dim in shape:
        if dim < 0:
            raise ValueError(f"Negative dimensions are not supported: {shape}")
        count *= dim
    return count


def read_tensor_dump(path: Path) -> list[np.ndarray]:
    tokens = path.read_text(encoding="utf-8").split()
    cursor = 0

    def next_token() -> str:
        nonlocal cursor
        if cursor >= len(tokens):
            raise ValueError(f"Unexpected EOF while parsing tensor dump: {path}")
        token = tokens[cursor]
        cursor += 1
        return token

    tensor_count = int(next_token())
    tensors: list[np.ndarray] = []

    for _ in range(tensor_count):
        dims_count = int(next_token())
        shape = [int(next_token()) for _ in range(dims_count)]
        value_count = int(next_token())
        expected = element_count(shape)
        if value_count != expected:
            raise ValueError(
                f"Tensor dump element count mismatch in {path}: expected {expected}, got {value_count}"
            )
        values = np.array([float(next_token()) for _ in range(value_count)], dtype=np.float32)
        tensors.append(values.reshape(shape if shape else ()))

    return tensors


def write_tensor_dump(path: Path, tensors: list[np.ndarray]) -> None:
    lines = [str(len(tensors))]
    for tensor in tensors:
        array = np.asarray(tensor, dtype=np.float32)
        shape = list(array.shape)
        flat = array.reshape(-1)
        lines.append(" ".join([str(len(shape)), *[str(dim) for dim in shape]]))
        lines.append(str(int(flat.size)))
        lines.append(" ".join(format(float(value), ".9g") for value in flat))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_onnx(model_path: Path, input_tensors: list[np.ndarray]) -> list[np.ndarray]:
    import onnxruntime as ort

    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    session_inputs = session.get_inputs()
    if len(session_inputs) != len(input_tensors):
        raise ValueError(
            f"ONNX input count mismatch: runtime expects {len(session_inputs)}, got {len(input_tensors)}"
        )

    feeds = {
        session_input.name: np.asarray(input_tensor, dtype=np.float32)
        for session_input, input_tensor in zip(session_inputs, input_tensors)
    }
    outputs = session.run(None, feeds)
    return [np.asarray(output, dtype=np.float32) for output in outputs]


def run_tflite(model_path: Path, input_tensors: list[np.ndarray]) -> list[np.ndarray]:
    import tensorflow as tf

    interpreter = tf.lite.Interpreter(model_path=str(model_path))
    input_details = interpreter.get_input_details()
    if len(input_details) != len(input_tensors):
        raise ValueError(
            f"TFLite input count mismatch: runtime expects {len(input_details)}, got {len(input_tensors)}"
        )

    for index, input_tensor in enumerate(input_tensors):
        interpreter.resize_tensor_input(index, list(input_tensor.shape), strict=False)

    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    for detail, input_tensor in zip(input_details, input_tensors):
        interpreter.set_tensor(detail["index"], np.asarray(input_tensor, dtype=np.float32))

    interpreter.invoke()
    return [
        np.asarray(interpreter.get_tensor(detail["index"]), dtype=np.float32)
        for detail in output_details
    ]


def run_openvino(model_path: Path, input_tensors: list[np.ndarray]) -> list[np.ndarray]:
    import openvino as ov

    compile_config = {
        "INFERENCE_PRECISION_HINT": "f32",
    }

    with tempfile.TemporaryDirectory(prefix="openvino-infer-") as temp_dir:
        temp_root = Path(temp_dir)
        with zipfile.ZipFile(model_path, "r") as archive:
            archive.extractall(temp_root)

        xml_path = temp_root / "model.xml"
        bin_path = temp_root / "model.bin"
        if not xml_path.exists() or not bin_path.exists():
            raise FileNotFoundError(
                f"Expected model.xml and model.bin inside {model_path}"
            )

        core = ov.Core()
        model = core.read_model(str(xml_path), str(bin_path))
        if len(model.inputs) != len(input_tensors):
            raise ValueError(
                "OpenVINO model input count mismatch: "
                f"runtime expects {len(model.inputs)}, got {len(input_tensors)}"
            )
        reshape_map = {
            port.any_name: list(input_tensor.shape)
            for port, input_tensor in zip(model.inputs, input_tensors)
        }
        model.reshape(reshape_map)
        compiled_model = core.compile_model(model, "CPU", compile_config)
        if len(compiled_model.inputs) != len(input_tensors):
            raise ValueError(
                "OpenVINO input count mismatch: "
                f"runtime expects {len(compiled_model.inputs)}, got {len(input_tensors)}"
            )

        request = compiled_model.create_infer_request()
        feeds = {
            port.any_name: np.asarray(input_tensor, dtype=np.float32)
            for port, input_tensor in zip(compiled_model.inputs, input_tensors)
        }
        results = request.infer(feeds)
        return [np.asarray(results[port], dtype=np.float32) for port in compiled_model.outputs]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run ONNX/TFLite/OpenVINO inference against a shared tensor dump format."
    )
    parser.add_argument(
        "--framework",
        required=True,
        choices=["onnx", "tflite", "openvino"],
        help="Inference backend to use",
    )
    parser.add_argument("model_path", help="Path to the model artifact")
    parser.add_argument("input_dump_path", help="Path to the input tensor dump")
    parser.add_argument("output_dump_path", help="Where to write the output tensor dump")
    args = parser.parse_args()

    model_path = Path(args.model_path).resolve()
    input_dump_path = Path(args.input_dump_path).resolve()
    output_dump_path = Path(args.output_dump_path).resolve()
    output_dump_path.parent.mkdir(parents=True, exist_ok=True)

    input_tensors = read_tensor_dump(input_dump_path)

    if args.framework == "onnx":
        output_tensors = run_onnx(model_path, input_tensors)
    elif args.framework == "tflite":
        output_tensors = run_tflite(model_path, input_tensors)
    else:
        output_tensors = run_openvino(model_path, input_tensors)

    write_tensor_dump(output_dump_path, output_tensors)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
