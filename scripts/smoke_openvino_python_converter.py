#!/usr/bin/env python3

import argparse
import base64
import json
import os
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Smoke test the Python OpenVINO converter entry."
    )
    parser.add_argument(
        "model_path",
        nargs="?",
        default="apps/web/public/verify/generated/add_const.onnx",
        help="Path to the input ONNX model, relative to the repo root or absolute.",
    )
    parser.add_argument(
        "--quantization",
        default="none",
        choices=["none", "fp16", "int8"],
        help="Quantization mode passed to OpenVINOConverter",
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    python_root = project_root / "packages" / "wasm-converter" / "python"
    sys.path.insert(0, str(python_root))

    os.environ["HOME"] = os.environ.get("OPENVINO_SMOKE_HOME", "/tmp")

    try:
        from converters.openvino_converter import OpenVINOConverter
    except Exception as exc:
        print(
            json.dumps(
                {
                    "success": False,
                    "stage": "import_converter",
                    "error": str(exc),
                }
            )
        )
        return 1

    model_path = Path(args.model_path)
    if not model_path.is_absolute():
        model_path = (project_root / model_path).resolve()

    if not model_path.exists() or not model_path.is_file():
        print(
            json.dumps(
                {
                    "success": False,
                    "stage": "validate_input",
                    "error": f"Model not found: {model_path}",
                }
            )
        )
        return 1

    converter = OpenVINOConverter()
    capability = converter.describe_capability()
    result = converter.convert(str(model_path), {"quantization": args.quantization})

    payload_size = None
    if result.get("success") and result.get("model_base64"):
        payload_size = len(base64.b64decode(result["model_base64"]))

    summary = {
        "success": bool(result.get("success")),
        "model_path": str(model_path),
        "quantization": args.quantization,
        "capability": {
            "available": capability.get("available"),
            "wasm_supported": capability.get("wasm_supported"),
            "quantization": capability.get("quantization"),
        },
        "result": {
            "format": result.get("format"),
            "filename": result.get("filename"),
            "model_size": result.get("model_size"),
            "payload_size": payload_size,
            "xml_size": result.get("xml_size"),
            "bin_size": result.get("bin_size"),
            "method": result.get("method"),
            "error": result.get("error"),
            "recommendation": result.get("recommendation"),
        },
    }
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    sys.exit(main())
