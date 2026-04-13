#!/usr/bin/env python3

from __future__ import annotations

import http.server
import json
import os
import shutil
import socketserver
import subprocess
import tarfile
import threading
import urllib.request
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import ncnn


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = PROJECT_ROOT / "apps/web/public"
VERIFY_ROOT = PUBLIC_ROOT / "verify/generated"
WORK_ROOT = Path("/tmp/dbnet_compare")

MODEL_URL = (
    "https://paddle-model-ecology.bj.bcebos.com/paddlex/"
    "official_inference_model/paddle3.0.0/PP-OCRv3_mobile_det_infer.tar"
)
MODEL_ARCHIVE = WORK_ROOT / "PP-OCRv3_mobile_det_infer.tar"
MODEL_DIR = WORK_ROOT / "PP-OCRv3_mobile_det_infer"
ONNX_PATH = WORK_ROOT / "PP-OCRv3_mobile_det.onnx"
ONNX_STRIPPED_PATH = WORK_ROOT / "PP-OCRv3_mobile_det_no_identity.onnx"
PUBLIC_ONNX_PATH = VERIFY_ROOT / "ppocrv3_dbnet_no_identity.onnx"
PUBLIC_PARAM_PATH = VERIFY_ROOT / "ppocrv3_dbnet_no_identity.param"
PUBLIC_BIN_PATH = VERIFY_ROOT / "ppocrv3_dbnet_no_identity.bin"

SAMPLE_SHAPES = [(1, 3, 64, 64), (1, 3, 96, 128), (1, 3, 160, 160)]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return


class ThreadedTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def ensure_model() -> None:
    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    if not MODEL_ARCHIVE.exists():
        with urllib.request.urlopen(MODEL_URL) as response:
            MODEL_ARCHIVE.write_bytes(response.read())
    if not MODEL_DIR.exists():
        with tarfile.open(MODEL_ARCHIVE) as tar:
            tar.extractall(WORK_ROOT)


def ensure_onnx() -> None:
    if ONNX_PATH.exists():
        return
    subprocess.run(
        [
            "paddle2onnx",
            "--model_dir",
            str(MODEL_DIR),
            "--model_filename",
            "inference.json",
            "--params_filename",
            "inference.pdiparams",
            "--save_file",
            str(ONNX_PATH),
            "--opset_version",
            "12",
        ],
        check=True,
    )


def strip_identity_nodes() -> None:
    model = onnx.load(ONNX_PATH)
    mapping = {}
    nodes = []

    for node in model.graph.node:
        if node.op_type == "Identity" and len(node.input) == 1 and len(node.output) == 1:
            mapping[node.output[0]] = node.input[0]
        else:
            nodes.append(node)

    changed = True
    while changed:
        changed = False
        for key, value in list(mapping.items()):
            if value in mapping and mapping[value] != value:
                mapping[key] = mapping[value]
                changed = True

    for node in nodes:
        for index, name in enumerate(node.input):
            if name in mapping:
                node.input[index] = mapping[name]

    for output in model.graph.output:
        if output.name in mapping:
            output.name = mapping[output.name]

    del model.graph.node[:]
    model.graph.node.extend(nodes)
    onnx.save(model, ONNX_STRIPPED_PATH)


def export_ncnn(base_url: str) -> None:
    VERIFY_ROOT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ONNX_STRIPPED_PATH, PUBLIC_ONNX_PATH)
    subprocess.run(
        [
            "node",
            str(PROJECT_ROOT / "scripts/export-ncnn-artifacts.mjs"),
            base_url,
            "/verify/generated/ppocrv3_dbnet_no_identity.onnx",
            str(PUBLIC_PARAM_PATH),
            str(PUBLIC_BIN_PATH),
        ],
        check=True,
    )


def start_server():
    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(PUBLIC_ROOT), **kwargs)
    server = ThreadedTCPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def align_shapes(onnx_output: np.ndarray, ncnn_output: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if onnx_output.ndim == ncnn_output.ndim + 1 and onnx_output.shape[1] == 1:
        return np.squeeze(onnx_output, axis=1), ncnn_output
    return onnx_output, ncnn_output


def main() -> int:
    ensure_model()
    ensure_onnx()
    strip_identity_nodes()

    original_session = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])
    stripped_session = ort.InferenceSession(str(ONNX_STRIPPED_PATH), providers=["CPUExecutionProvider"])

    server = start_server()
    base_url = f"http://127.0.0.1:{server.server_address[1]}"

    try:
        export_ncnn(base_url)

        net = ncnn.Net()
        load_param_ret = net.load_param_mem(PUBLIC_PARAM_PATH.read_text())
        net.load_model_mem(PUBLIC_BIN_PATH.read_bytes())
        input_name = stripped_session.get_inputs()[0].name
        output_name = stripped_session.get_outputs()[0].name

        results = []
        for index, shape in enumerate(SAMPLE_SHAPES, start=1):
            sample = np.random.default_rng(index).standard_normal(shape, dtype=np.float32)
            y_original = original_session.run(None, {input_name: sample})[0]
            y_stripped = stripped_session.run(None, {input_name: sample})[0]

            extractor = net.create_extractor()
            extractor.input(input_name, ncnn.Mat(sample.squeeze(0)))
            ret, out = extractor.extract(output_name)
            y_ncnn = np.array(out, dtype=np.float32)

            y_stripped_cmp, y_ncnn_cmp = align_shapes(y_stripped, y_ncnn)
            y_original_cmp, y_ncnn_cmp = align_shapes(y_original, y_ncnn_cmp)

            results.append(
                {
                    "sample": index,
                    "shape": list(shape),
                    "ncnn_extract_ret": int(ret),
                    "original_vs_stripped_max_abs_diff": float(np.max(np.abs(y_original - y_stripped))),
                    "original_vs_ncnn_max_abs_diff": float(np.max(np.abs(y_original_cmp - y_ncnn_cmp))),
                    "original_vs_ncnn_mean_abs_diff": float(np.mean(np.abs(y_original_cmp - y_ncnn_cmp))),
                    "allclose": bool(np.allclose(y_original_cmp, y_ncnn_cmp, atol=1e-4, rtol=1e-4)),
                    "onnx_output_shape": list(y_original.shape),
                    "ncnn_output_shape": list(y_ncnn.shape),
                }
            )

        summary = {
            "model": "PP-OCRv3_mobile_det (DBNet)",
            "paddle_model_dir": str(MODEL_DIR),
            "onnx_path": str(ONNX_PATH),
            "onnx_stripped_path": str(ONNX_STRIPPED_PATH),
            "ncnn_param": str(PUBLIC_PARAM_PATH),
            "ncnn_bin": str(PUBLIC_BIN_PATH),
            "load_param_ret": int(load_param_ret),
            "passed": all(item["allclose"] and item["ncnn_extract_ret"] == 0 for item in results),
            "results": results,
        }
        print(json.dumps(summary, indent=2))
        return 0 if summary["passed"] else 1
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    raise SystemExit(main())
