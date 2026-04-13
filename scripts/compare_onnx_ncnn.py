#!/usr/bin/env python3

from __future__ import annotations

import http.server
import json
import os
import socketserver
import struct
import subprocess
import sys
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np
import onnxruntime as ort
import ncnn


PROJECT_ROOT = Path("/Users/money/Desktop/convert")
PUBLIC_ROOT = PROJECT_ROOT / "apps/web/public"
VERIFY_ROOT = PUBLIC_ROOT / "verify/generated"
PROTO_ROOT = Path(tempfile.gettempdir()) / "onnx_ncnn_proto_runtime"


def ensure_proto_module():
    PROTO_ROOT.mkdir(parents=True, exist_ok=True)
    proto_path = PROTO_ROOT / "onnx.proto"
    py_path = PROTO_ROOT / "onnx_pb2.py"
    if not py_path.exists():
        proto_path.write_text(
            (PROJECT_ROOT / "third_party/ncnn/tools/onnx/onnx.proto").read_text()
        )
        subprocess.run(
            ["protoc", "-I", str(PROTO_ROOT), "--python_out", str(PROTO_ROOT), str(proto_path)],
            check=True,
        )
    sys.path.insert(0, str(PROTO_ROOT))
    import onnx_pb2  # type: ignore

    return onnx_pb2


onnx_pb2 = ensure_proto_module()


def float_tensor(name: str, array: np.ndarray):
    tensor = onnx_pb2.TensorProto()
    tensor.name = name
    tensor.data_type = onnx_pb2.TensorProto.FLOAT
    tensor.dims.extend(array.shape)
    tensor.raw_data = array.astype(np.float32).tobytes()
    return tensor


def value_info(name: str, shape: tuple[int, ...]):
    info = onnx_pb2.ValueInfoProto()
    info.name = name
    info.type.tensor_type.elem_type = onnx_pb2.TensorProto.FLOAT
    for dim in shape:
        info.type.tensor_type.shape.dim.add().dim_value = dim
    return info


@dataclass
class Case:
    name: str
    input_name: str
    output_name: str
    sample_inputs: list[np.ndarray]
    build_model: Callable[[Path], None]


def write_model(path: Path, build_graph: Callable[[object], None]) -> None:
    model = onnx_pb2.ModelProto()
    model.ir_version = 8
    opset = model.opset_import.add()
    opset.domain = ""
    opset.version = 12
    model.producer_name = "codex-compare"
    build_graph(model.graph)
    path.write_bytes(model.SerializeToString())


def build_relu_model(path: Path) -> None:
    def graph(g):
        g.name = "relu_model"
        node = g.node.add()
        node.op_type = "Relu"
        node.name = "relu"
        node.input.append("input")
        node.output.append("output")
        g.input.extend([value_info("input", (2, 3))])
        g.output.extend([value_info("output", (2, 3))])

    write_model(path, graph)


def build_add_model(path: Path) -> None:
    bias = np.array([[1.0, -2.0, 0.5], [0.25, 0.75, -1.25]], dtype=np.float32)

    def graph(g):
        g.name = "add_model"
        node = g.node.add()
        node.op_type = "Add"
        node.name = "add"
        node.input.extend(["input", "bias"])
        node.output.append("output")
        g.input.extend([value_info("input", (2, 3))])
        g.output.extend([value_info("output", (2, 3))])
        g.initializer.extend([float_tensor("bias", bias)])

    write_model(path, graph)


def build_gemm_model(path: Path) -> None:
    weight = np.array(
        [[1.0, -1.0], [0.5, 2.0], [-3.0, 0.25]],
        dtype=np.float32,
    )
    bias = np.array([0.75, -1.5], dtype=np.float32)

    def graph(g):
        g.name = "gemm_model"
        node = g.node.add()
        node.op_type = "Gemm"
        node.name = "gemm"
        node.input.extend(["input", "weight", "bias"])
        node.output.append("output")
        node.attribute.add(name="alpha", f=1.0, type=onnx_pb2.AttributeProto.FLOAT)
        node.attribute.add(name="beta", f=1.0, type=onnx_pb2.AttributeProto.FLOAT)
        node.attribute.add(name="transB", i=0, type=onnx_pb2.AttributeProto.INT)
        g.input.extend([value_info("input", (2, 3))])
        g.output.extend([value_info("output", (2, 2))])
        g.initializer.extend([float_tensor("weight", weight), float_tensor("bias", bias)])

    write_model(path, graph)


CASES = [
    Case(
        name="add_const",
        input_name="input",
        output_name="output",
        sample_inputs=[
            np.array([[2.0, -1.0, 3.0], [0.5, -0.5, 1.5]], dtype=np.float32),
            np.array([[0.0, 8.0, -3.0], [4.25, 2.5, -7.0]], dtype=np.float32),
            np.array([[-2.0, 3.5, 1.25], [9.0, -4.0, 0.0]], dtype=np.float32),
        ],
        build_model=build_add_model,
    ),
    Case(
        name="gemm",
        input_name="input",
        output_name="output",
        sample_inputs=[
            np.array([[1.0, -2.0, 0.5], [3.0, 1.0, -4.0]], dtype=np.float32),
            np.array([[0.25, 0.5, 1.0], [-1.5, 2.5, 3.0]], dtype=np.float32),
            np.array([[8.0, -3.0, 2.0], [0.125, -0.75, 5.5]], dtype=np.float32),
        ],
        build_model=build_gemm_model,
    ),
]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return


class ThreadedTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def start_server(root: Path):
    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(root), **kwargs)
    server = ThreadedTCPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def convert_via_browser(base_url: str, model_url_path: str, out_prefix: Path) -> tuple[Path, Path]:
    param_path = out_prefix.with_suffix(".param")
    bin_path = out_prefix.with_suffix(".bin")
    cmd = [
        "node",
        str(PROJECT_ROOT / "scripts/export-ncnn-artifacts.mjs"),
        base_url,
        model_url_path,
        str(param_path),
        str(bin_path),
    ]
    subprocess.run(cmd, check=True)
    return param_path, bin_path


def run_onnx(model_path: Path, case: Case, input_array: np.ndarray) -> np.ndarray:
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    output = session.run(None, {case.input_name: input_array.astype(np.float32)})[0]
    return np.asarray(output, dtype=np.float32)


def run_ncnn(param_path: Path, bin_path: Path, case: Case, input_array: np.ndarray) -> np.ndarray:
    net = ncnn.Net()
    net.load_param_mem(param_path.read_text())
    net.load_model_mem(bin_path.read_bytes())
    extractor = net.create_extractor()
    extractor.input(case.input_name, ncnn.Mat(input_array.astype(np.float32)))
    ret, out_mat = extractor.extract(case.output_name)
    if ret != 0:
        raise RuntimeError(f"NCNN extract failed for {case.name}: {ret}")
    return np.array(out_mat, dtype=np.float32)


def main() -> int:
    VERIFY_ROOT.mkdir(parents=True, exist_ok=True)
    server = start_server(PUBLIC_ROOT)
    base_url = f"http://127.0.0.1:{server.server_address[1]}"

    summary = []

    try:
      for case in CASES:
        model_path = VERIFY_ROOT / f"{case.name}.onnx"
        case.build_model(model_path)

        param_path, bin_path = convert_via_browser(
            base_url,
            f"/verify/generated/{case.name}.onnx",
            VERIFY_ROOT / case.name,
        )

        comparisons = []
        for index, sample_input in enumerate(case.sample_inputs, start=1):
            onnx_output = run_onnx(model_path, case, sample_input)
            ncnn_output = run_ncnn(param_path, bin_path, case, sample_input)

            max_abs = float(np.max(np.abs(onnx_output - ncnn_output)))
            mean_abs = float(np.mean(np.abs(onnx_output - ncnn_output)))
            comparisons.append(
                {
                    "sample": index,
                    "passed": bool(np.allclose(onnx_output, ncnn_output, atol=1e-5, rtol=1e-5)),
                    "onnx_shape": list(onnx_output.shape),
                    "ncnn_shape": list(ncnn_output.shape),
                    "max_abs_diff": max_abs,
                    "mean_abs_diff": mean_abs,
                }
            )

        summary.append(
            {
                "case": case.name,
                "passed": all(item["passed"] for item in comparisons),
                "param_bytes": param_path.stat().st_size,
                "bin_bytes": bin_path.stat().st_size,
                "samples": comparisons,
            }
        )

      print(json.dumps({"base_url": base_url, "results": summary}, indent=2))
      return 0 if all(item["passed"] for item in summary) else 1
    finally:
      server.shutdown()
      server.server_close()


if __name__ == "__main__":
    raise SystemExit(main())
