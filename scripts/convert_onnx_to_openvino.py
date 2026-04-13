#!/usr/bin/env python3

import argparse
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path


def create_openvino_archive(xml_path: Path, bin_path: Path, output_path: Path) -> int:
    with zipfile.ZipFile(output_path, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(xml_path, arcname="model.xml")
        zf.write(bin_path, arcname="model.bin")
    return output_path.stat().st_size


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert an ONNX model to a zipped OpenVINO IR archive."
    )
    parser.add_argument("model_path", help="Path to the input ONNX model")
    parser.add_argument(
        "output_path", help="Path to the output OpenVINO zip archive"
    )
    parser.add_argument(
        "--quantization",
        default="none",
        choices=["none", "fp16", "int8"],
        help="OpenVINO export mode",
    )
    args = parser.parse_args()

    if args.quantization == "int8":
        print(
            json.dumps(
                {
                    "success": False,
                    "stage": "validate_quantization",
                    "error": (
                        "OpenVINO int8 export is not supported in this workflow. "
                        "It requires a separate PTQ pipeline such as NNCF."
                    ),
                    "quantization": args.quantization,
                }
            )
        )
        return 1

    try:
        import openvino as ov
    except Exception as exc:
        print(
            json.dumps(
                {
                    "success": False,
                    "stage": "import_openvino",
                    "error": f"Failed to import openvino: {exc}",
                }
            )
        )
        return 1

    model_path = Path(args.model_path).resolve()
    output_path = Path(args.output_path).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    work_root = Path(
        tempfile.mkdtemp(prefix=".openvino-work-", dir=str(output_path.parent))
    )

    try:
        xml_path = work_root / "model.xml"
        bin_path = work_root / "model.bin"

        try:
            model = ov.convert_model(str(model_path))
        except Exception as exc:
            print(
                json.dumps(
                    {
                        "success": False,
                        "stage": "convert_model",
                        "error": str(exc),
                        "quantization": args.quantization,
                    }
                )
            )
            return 1

        try:
            ov.save_model(
                model,
                str(xml_path),
                compress_to_fp16=args.quantization == "fp16",
            )
        except Exception as exc:
            print(
                json.dumps(
                    {
                        "success": False,
                        "stage": "save_model",
                        "error": str(exc),
                        "quantization": args.quantization,
                    }
                )
            )
            return 1

        if not xml_path.exists() or not bin_path.exists():
            print(
                json.dumps(
                    {
                        "success": False,
                        "stage": "scan_output",
                        "error": f"Expected {xml_path} and {bin_path} to exist",
                        "quantization": args.quantization,
                    }
                )
            )
            return 1

        archive_size = create_openvino_archive(xml_path, bin_path, output_path)
        print(
            json.dumps(
                {
                    "success": True,
                    "output_path": str(output_path),
                    "output_size": archive_size,
                    "xml_size": xml_path.stat().st_size,
                    "bin_size": bin_path.stat().st_size,
                    "quantization": args.quantization,
                    "compress_to_fp16": args.quantization == "fp16",
                    "method": "openvino_python_api",
                }
            )
        )
        return 0
    finally:
        shutil.rmtree(work_root, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
