#!/usr/bin/env python3

import json
import os
import sys
from pathlib import Path


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    python_root = project_root / "packages" / "wasm-converter" / "python"
    sys.path.insert(0, str(python_root))

    from converters.ncnn_converter import NCNNConverter
    from converters.mnn_converter import MNNConverter
    from converters.openvino_converter import OpenVINOConverter
    from converters.paddlelite_converter import PaddleLiteConverter

    cases = [
        (
            "ncnn-native-without-backend",
            NCNNConverter(),
            {"onnx": False, "ncnn": True, "wasm_toolchains": False},
            {"available": False, "wasm_supported": False, "archive_output": True},
        ),
        (
            "mnn-native-without-backend",
            MNNConverter(),
            {"onnx": False, "MNN": True, "wasm_toolchains": False},
            {"available": False, "wasm_supported": False, "archive_output": True},
        ),
        (
            "paddlelite-native-without-backend",
            PaddleLiteConverter(),
            {"onnx": False, "x2paddle": True, "paddle": True, "wasm_toolchains": False},
            {
                "available": False,
                "wasm_supported": False,
                "archive_output": True,
                "reason_contains": "native opt 后半段",
            },
        ),
        (
            "paddlelite-wasm-back-half-only",
            PaddleLiteConverter(),
            {"onnx": False, "x2paddle": False, "paddle": False, "wasm_toolchains": True},
            {
                "available": False,
                "wasm_supported": False,
                "archive_output": True,
                "reason_contains": "back-half",
            },
        ),
        (
            "openvino-native-with-backend",
            OpenVINOConverter(),
            {"onnx": False, "openvino": True, "wasm_toolchains": False},
            {"available": True, "wasm_supported": False, "archive_output": True},
        ),
        (
            "openvino-wasm-bridge",
            OpenVINOConverter(),
            {"onnx": False, "openvino": False, "wasm_toolchains": True},
            {"available": True, "wasm_supported": True, "archive_output": True},
        ),
    ]

    results = []
    failures = []

    for name, converter, deps, expected in cases:
        converter._check_dependencies = lambda deps=deps: deps  # type: ignore[attr-defined]
        capability = converter.describe_capability()
        result = {
          "name": name,
          "capability": {
              "available": capability.get("available"),
              "wasm_supported": capability.get("wasm_supported"),
              "archive_output": capability.get("archive_output"),
              "quantization": capability.get("quantization"),
              "reason": capability.get("reason"),
          },
        }
        results.append(result)

        for key, expected_value in expected.items():
            if key == "reason_contains":
                actual_reason = capability.get("reason") or ""
                if expected_value not in actual_reason:
                    failures.append(
                        {
                            "name": name,
                            "field": key,
                            "expected": expected_value,
                            "actual": actual_reason,
                        }
                    )
                continue
            if capability.get(key) != expected_value:
                failures.append(
                    {
                        "name": name,
                        "field": key,
                        "expected": expected_value,
                        "actual": capability.get(key),
                    }
                )

    print(
        json.dumps(
            {
                "success": not failures,
                "results": results,
                "failures": failures,
            },
            ensure_ascii=False,
        )
    )
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
