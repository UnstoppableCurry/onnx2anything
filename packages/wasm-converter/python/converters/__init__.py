"""
ONNX2Anything Converter Modules

This package provides converters for transforming ONNX models to various formats
optimized for edge deployment.

Supported formats:
    - TFLite (TensorFlow Lite)
    - OpenVINO (Intel IR)
    - NCNN
    - MNN
    - Paddle Lite

Note: This package is designed to run in Pyodide (WASM) environment.
"""

from .tflite_converter import TFLiteConverter
from .openvino_converter import OpenVINOConverter
from .ncnn_converter import NCNNConverter
from .mnn_converter import MNNConverter
from .paddlelite_converter import PaddleLiteConverter

__version__ = "0.2.0"
__all__ = [
    "TFLiteConverter",
    "OpenVINOConverter",
    "NCNNConverter",
    "MNNConverter",
    "PaddleLiteConverter",
]


def get_converter(format_name: str):
    """
    Get the appropriate converter for the target format.

    Args:
        format_name: Target format name

    Returns:
        Converter class instance

    Raises:
        ValueError: If format is not supported
    """
    converters = {
        "tflite": TFLiteConverter,
        "openvino": OpenVINOConverter,
        "ncnn": NCNNConverter,
        "mnn": MNNConverter,
        "paddlelite": PaddleLiteConverter,
    }

    if format_name.lower() not in converters:
        raise ValueError(f"Unsupported format: {format_name}. "
                        f"Supported formats: {list(converters.keys())}")

    return converters[format_name.lower()]()


def get_supported_formats():
    """Get list of supported target formats."""
    return ["tflite", "openvino", "ncnn", "mnn", "paddlelite"]


def get_format_info(format_name: str) -> dict:
    """
    Get information about a target format.

    Args:
        format_name: Target format name

    Returns:
        Dictionary with format information
    """
    info = {
        "tflite": {
            "name": "TensorFlow Lite",
            "description": "Optimized for mobile and embedded devices",
            "file_extension": ".tflite",
            "quantization": ["none", "fp16", "int8"],
            "platforms": ["Android", "iOS", "Linux", "microcontrollers"],
            "wasm_supported": True,
        },
        "openvino": {
            "name": "OpenVINO IR",
            "description": "Intel OpenVINO intermediate representation",
            "file_extension": ".xml+.bin",
            "quantization": ["none", "fp16"],
            "platforms": ["Intel CPU", "Intel GPU", "NPU"],
            "wasm_supported": False,
        },
        "ncnn": {
            "name": "NCNN",
            "description": "Tencent mobile inference framework",
            "file_extension": ".param+.bin",
            "quantization": ["none", "fp16", "int8"],
            "platforms": ["Android", "iOS", "Linux"],
            "wasm_supported": False,
        },
        "mnn": {
            "name": "MNN",
            "description": "Alibaba lightweight inference framework",
            "file_extension": ".mnn",
            "quantization": ["none", "fp16", "int8"],
            "platforms": ["Android", "iOS", "Linux", "Windows"],
            "wasm_supported": False,
        },
        "paddlelite": {
            "name": "Paddle Lite",
            "description": "Paddle mobile inference format",
            "file_extension": ".nb/model bundle",
            "quantization": ["none", "fp16", "int8"],
            "platforms": ["Android", "iOS", "ARM Linux"],
            "wasm_supported": False,
        },
    }

    return info.get(format_name.lower(), {})
