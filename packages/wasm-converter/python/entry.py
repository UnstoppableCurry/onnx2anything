"""
ONNX2Anything - Pyodide Entry Point

This module serves as the main entry point for the WASM converter running in Pyodide.
It provides a unified interface for model conversion, validation, and analysis.

Usage from JavaScript:
    await pyodide.runPythonAsync(`
        import entry
        result = entry.convert_model(buffer, 'tflite', options)
    `);
"""

import json
import os
import sys
import base64
from typing import Dict, List, Optional, Any, Union
from io import BytesIO

# Import converter modules
try:
    from converters import (
        TFLiteConverter,
        OpenVINOConverter,
        NCNNConverter,
        MNNConverter,
        PaddleLiteConverter,
        TNNConverter,
        TengineConverter,
    )
    CONVERTERS_AVAILABLE = True
except ImportError as e:
    CONVERTERS_AVAILABLE = False
    CONVERTER_ERROR = str(e)

try:
    from utils.model_utils import ModelValidator, ModelSimplifier, ModelAnalyzer
    from utils.model_utils import ProgressTracker, estimate_memory_usage, validate_input_shapes
    UTILS_AVAILABLE = True
except ImportError as e:
    UTILS_AVAILABLE = False
    UTILS_ERROR = str(e)


class JSLogger:
    """
    Logger that sends messages back to JavaScript via stdout.
    The worker captures these and forwards them as progress messages.
    """

    def __init__(self, prefix="CONVERTER"):
        self.prefix = prefix
        self.logs = []

    def log(self, level: str, message: str, stage: str = "", percent: int = 0):
        """Log a message that will be captured by JS worker."""
        entry = {
            "level": level,
            "message": message,
            "stage": stage,
            "percent": percent,
            "prefix": self.prefix
        }
        self.logs.append(entry)

        # Format for stdout capture
        log_line = f"[PYLOG]{json.dumps(entry)}[/PYLOG]"
        print(log_line, flush=True)

    def info(self, message: str, stage: str = "", percent: int = 0):
        self.log("INFO", message, stage, percent)

    def warn(self, message: str, stage: str = "", percent: int = 0):
        self.log("WARN", message, stage, percent)

    def error(self, message: str, stage: str = "", percent: int = 0):
        self.log("ERROR", message, stage, percent)

    def debug(self, message: str, stage: str = "", percent: int = 0):
        self.log("DEBUG", message, stage, percent)

    def get_logs(self) -> List[Dict]:
        return self.logs.copy()


def _ensure_directories():
    """Ensure required directories exist."""
    dirs = [
        '/tmp/onnx_convert',
        '/tmp/onnx_tflite',
        '/tmp/onnx_openvino',
        '/tmp/onnx_ncnn',
        '/tmp/onnx_mnn',
        '/tmp/onnx_paddlelite',
        '/tmp/onnx_tnn',
        '/tmp/onnx_tengine',
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)


def get_version() -> Dict[str, str]:
    """Get version information about the converter."""
    return {
        "converter_version": "0.1.0",
        "python_version": sys.version,
        "converters_available": str(CONVERTERS_AVAILABLE),
        "utils_available": str(UTILS_AVAILABLE),
    }


def check_environment() -> Dict[str, Any]:
    """
    Check the WASM environment and available dependencies.

    Returns:
        Dictionary with environment information
    """
    result = {
        "platform": sys.platform,
        "python_version": sys.version,
        "available_packages": {},
        "temp_dirs": {},
    }

    # Check key packages
    packages = [
        "onnx", "onnxsim", "numpy", "protobuf",
        "tensorflow", "onnx2tf", "torch"
    ]

    for pkg in packages:
        try:
            mod = __import__(pkg)
            version = getattr(mod, "__version__", "unknown")
            result["available_packages"][pkg] = {"available": True, "version": version}
        except ImportError:
            result["available_packages"][pkg] = {"available": False}

    # Check temp directories
    _ensure_directories()
    for d in ['/tmp/onnx_convert', '/tmp/onnx_tflite', '/tmp/onnx_openvino']:
        result["temp_dirs"][d] = os.path.exists(d)

    return result


def validate_model(model_buffer: Union[bytes, str],
                   is_base64: bool = False) -> str:
    """
    Validate an ONNX model.

    Args:
        model_buffer: Model data as bytes or base64 string
        is_base64: Whether the buffer is base64 encoded

    Returns:
        JSON string with validation results
    """
    logger = JSLogger("VALIDATOR")
    logger.info("Starting model validation", "validating", 0)

    try:
        _ensure_directories()

        # Decode buffer if needed
        if is_base64 and isinstance(model_buffer, str):
            model_buffer = base64.b64decode(model_buffer)
        elif isinstance(model_buffer, str):
            model_buffer = model_buffer.encode()

        # Write to temp file
        input_path = '/tmp/onnx_convert/validate_input.onnx'
        with open(input_path, 'wb') as f:
            f.write(model_buffer)

        logger.info(f"Model written to {input_path}", "validating", 10)

        # Validate
        if UTILS_AVAILABLE:
            validator = ModelValidator(logger=logger)
            result = validator.validate(input_path, check_shapes=True)
        else:
            # Basic validation without utils
            import onnx
            model = onnx.load(input_path)
            onnx.checker.check_model(model)
            result = {
                "success": True,
                "valid": True,
                "message": "Basic validation passed"
            }

        # Cleanup
        try:
            os.remove(input_path)
        except:
            pass

        logger.info("Validation complete", "validating", 100)
        return json.dumps(result)

    except Exception as e:
        error_result = {
            "success": False,
            "valid": False,
            "error": str(e)
        }
        logger.error(f"Validation failed: {str(e)}", "validating", 0)
        return json.dumps(error_result)


def simplify_model(model_buffer: Union[bytes, str],
                   is_base64: bool = False,
                   options: Optional[str] = None) -> str:
    """
    Simplify an ONNX model using onnx-simplifier.

    Args:
        model_buffer: Model data as bytes or base64 string
        is_base64: Whether the buffer is base64 encoded
        options: JSON string with simplification options

    Returns:
        JSON string with results and simplified model (base64 encoded)
    """
    logger = JSLogger("SIMPLIFIER")
    logger.info("Starting model simplification", "simplifying", 0)

    try:
        _ensure_directories()

        # Decode buffer
        if is_base64 and isinstance(model_buffer, str):
            model_buffer = base64.b64decode(model_buffer)
        elif isinstance(model_buffer, str):
            model_buffer = model_buffer.encode()

        # Parse options
        opts = json.loads(options) if options else {}

        # Write input
        input_path = '/tmp/onnx_convert/simplify_input.onnx'
        output_path = '/tmp/onnx_convert/simplify_output.onnx'

        with open(input_path, 'wb') as f:
            f.write(model_buffer)

        logger.info("Model loaded, starting simplification", "simplifying", 20)

        # Simplify
        if UTILS_AVAILABLE:
            simplifier = ModelSimplifier(logger=logger)
            result = simplifier.simplify(input_path, output_path, opts)
        else:
            # Fallback using onnxsim directly
            import onnx
            from onnxsim import simplify

            model = onnx.load(input_path)
            original_nodes = len(model.graph.node)

            model_simp, check = simplify(model)
            simplified_nodes = len(model_simp.graph.node)

            onnx.save(model_simp, output_path)

            result = {
                "success": True,
                "check_passed": check,
                "original_nodes": original_nodes,
                "simplified_nodes": simplified_nodes,
                "reduction": original_nodes - simplified_nodes,
                "reduction_percent": (original_nodes - simplified_nodes) / original_nodes * 100 if original_nodes > 0 else 0
            }

        # Read output and encode
        if result.get("success") and os.path.exists(output_path):
            with open(output_path, 'rb') as f:
                output_buffer = f.read()
            result["model_base64"] = base64.b64encode(output_buffer).decode('utf-8')
            result["model_size"] = len(output_buffer)

        # Cleanup
        for f in [input_path, output_path]:
            try:
                os.remove(f)
            except:
                pass

        logger.info("Simplification complete", "simplifying", 100)
        return json.dumps(result)

    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        logger.error(f"Simplification failed: {str(e)}", "simplifying", 0)
        return json.dumps(error_result)


def convert_model(model_buffer: Union[bytes, str],
                  target_format: str,
                  is_base64: bool = False,
                  options: Optional[str] = None) -> str:
    """
    Convert an ONNX model to target format.

    Args:
        model_buffer: Model data as bytes or base64 string
        target_format: Target format ('tflite', 'openvino', 'ncnn', 'mnn', 'paddlelite', 'tnn')
        is_base64: Whether the buffer is base64 encoded
        options: JSON string with conversion options

    Returns:
        JSON string with results and converted model (base64 encoded)
    """
    logger = JSLogger("CONVERTER")
    logger.info(f"Starting conversion to {target_format}", "converting", 0)

    try:
        _ensure_directories()

        # Decode buffer
        if is_base64 and isinstance(model_buffer, str):
            model_buffer = base64.b64decode(model_buffer)
        elif isinstance(model_buffer, str):
            model_buffer = model_buffer.encode()

        # Parse options
        opts = json.loads(options) if options else {}
        logger.info(f"Options: {opts}", "converting", 5)

        quantization = opts.get("quantization", "none")
        optimization = opts.get("optimization", True)

        # Set up paths
        input_path = f'/tmp/onnx_convert/convert_input_{target_format}.onnx'
        simplified_path = f'/tmp/onnx_convert/convert_simplified_{target_format}.onnx'

        # Write input
        with open(input_path, 'wb') as f:
            f.write(model_buffer)

        logger.info(f"Model written ({len(model_buffer)} bytes)", "converting", 10)

        # Optionally simplify first
        model_to_convert = input_path
        if optimization:
            logger.info("Applying model simplification", "simplifying", 20)
            try:
                if UTILS_AVAILABLE:
                    simplifier = ModelSimplifier(logger=logger)
                    simp_result = simplifier.simplify(input_path, simplified_path)
                    if simp_result.get("success"):
                        model_to_convert = simplified_path
                        logger.info("Simplification successful", "simplifying", 35)
                    else:
                        logger.warn("Simplification failed, using original model", "simplifying", 35)
                else:
                    import onnx
                    from onnxsim import simplify
                    model = onnx.load(input_path)
                    model_simp, check = simplify(model)
                    if check:
                        onnx.save(model_simp, simplified_path)
                        model_to_convert = simplified_path
            except Exception as e:
                logger.warn(f"Simplification error: {e}", "simplifying", 35)

        # Perform conversion
        logger.info(f"Converting to {target_format}", "converting", 40)

        if target_format == "tflite":
            result = _convert_to_tflite(model_to_convert, opts, logger)
        elif target_format == "openvino":
            result = _convert_to_openvino(model_to_convert, opts, logger)
        elif target_format == "ncnn":
            result = _convert_to_ncnn(model_to_convert, opts, logger)
        elif target_format == "mnn":
            result = _convert_to_mnn(model_to_convert, opts, logger)
        elif target_format in ("paddlelite", "paddle_lite"):
            result = _convert_to_paddlelite(model_to_convert, opts, logger)
        elif target_format == "tnn":
            result = _convert_to_tnn(model_to_convert, opts, logger)
        elif target_format == "tengine":
            result = _convert_to_tengine(model_to_convert, opts, logger)
        else:
            result = _convert_with_toolchain_bridge(target_format, model_to_convert, opts, logger)

        # Cleanup
        for f in [input_path, simplified_path]:
            try:
                if os.path.exists(f):
                    os.remove(f)
            except:
                pass

        if result.get("success"):
            logger.info("Conversion complete", "done", 100)
        else:
            logger.error(f"Conversion failed: {result.get('error')}", "error", 0)

        return json.dumps(result)

    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        logger.error(f"Conversion failed: {str(e)}", "error", 0)
        return json.dumps(error_result)


def convert_model_from_path(input_path: str,
                            target_format: str,
                            options: Optional[str] = None) -> str:
    """
    Convert an ONNX model from an already-written filesystem path.

    This avoids serializing large models through Python source strings and is the
    preferred path for browser worker -> Pyodide conversions.
    """
    logger = JSLogger("CONVERTER")
    logger.info(f"Starting conversion to {target_format}", "converting", 0)

    try:
        _ensure_directories()

        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input model path does not exist: {input_path}")

        opts = json.loads(options) if options else {}
        logger.info(f"Options: {opts}", "converting", 5)

        optimization = opts.get("optimization", True)
        simplified_path = f'/tmp/onnx_convert/convert_simplified_{target_format}.onnx'
        model_to_convert = input_path

        if optimization:
            logger.info("Applying model simplification", "simplifying", 20)
            try:
                if UTILS_AVAILABLE:
                    simplifier = ModelSimplifier(logger=logger)
                    simp_result = simplifier.simplify(input_path, simplified_path)
                    if simp_result.get("success"):
                        model_to_convert = simplified_path
                        logger.info("Simplification successful", "simplifying", 35)
                    else:
                        logger.warn("Simplification failed, using original model", "simplifying", 35)
                else:
                    import onnx
                    from onnxsim import simplify
                    model = onnx.load(input_path)
                    model_simp, check = simplify(model)
                    if check:
                        onnx.save(model_simp, simplified_path)
                        model_to_convert = simplified_path
            except Exception as e:
                logger.warn(f"Simplification error: {e}", "simplifying", 35)

        logger.info(f"Converting to {target_format}", "converting", 40)

        if target_format == "tflite":
            result = _convert_to_tflite(model_to_convert, opts, logger)
        elif target_format == "openvino":
            result = _convert_to_openvino(model_to_convert, opts, logger)
        elif target_format == "ncnn":
            result = _convert_to_ncnn(model_to_convert, opts, logger)
        elif target_format == "mnn":
            result = _convert_to_mnn(model_to_convert, opts, logger)
        elif target_format in ("paddlelite", "paddle_lite"):
            result = _convert_to_paddlelite(model_to_convert, opts, logger)
        elif target_format == "tnn":
            result = _convert_to_tnn(model_to_convert, opts, logger)
        elif target_format == "tengine":
            result = _convert_to_tengine(model_to_convert, opts, logger)
        else:
            result = {
                "success": False,
                "error": f"Unsupported target format: {target_format}"
            }

        if result.get("success"):
            logger.info("Conversion complete", "done", 100)
        else:
            logger.error(f"Conversion failed: {result.get('error')}", "error", 0)

        return json.dumps(result)
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        logger.error(f"Conversion failed: {str(e)}", "error", 0)
        return json.dumps(error_result)
    finally:
        for f in [simplified_path if 'simplified_path' in locals() else None]:
            try:
                if f and os.path.exists(f):
                    os.remove(f)
            except Exception:
                pass


def _convert_to_tflite(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    """Internal TFLite conversion."""
    output_path = '/tmp/onnx_tflite/output.tflite'

    try:
        if CONVERTERS_AVAILABLE:
            converter = TFLiteConverter(logger=logger)
            result = converter.convert(onnx_path, output_path, options)
        else:
            # Fallback - check if onnx2tf is available directly
            try:
                from onnx2tf import convert
                logger.info("Using onnx2tf directly", "converting", 50)

                convert_opts = {
                    "input_onnx_file_path": onnx_path,
                    "output_folder_path": '/tmp/onnx_tflite',
                    "output_tflite_file_path": output_path,
                }

                if options.get("quantization") == "fp16":
                    convert_opts["output_float16_quantized_tflite"] = True

                convert(**convert_opts)

                result = {"success": True, "method": "onnx2tf_direct"}

            except ImportError:
                return {
                    "success": False,
                    "error": "TFLite converter not available. Install onnx2tf or tensorflow.",
                    "wasm_limitation": True
                }

        # Read output if successful
        if result.get("success") and os.path.exists(output_path):
            with open(output_path, 'rb') as f:
                output_buffer = f.read()

            result["model_base64"] = base64.b64encode(output_buffer).decode('utf-8')
            result["model_size"] = len(output_buffer)
            result["format"] = "tflite"
            result["filename"] = "model.tflite"

            # Cleanup
            try:
                os.remove(output_path)
            except:
                pass

        return result

    except Exception as e:
        return {
            "success": False,
            "error": f"TFLite conversion error: {str(e)}"
        }


def _convert_to_openvino(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    """Internal OpenVINO conversion."""
    if not CONVERTERS_AVAILABLE:
        return {
            "success": False,
            "error": "OpenVINO converter modules unavailable in WASM runtime.",
            "wasm_limitation": True,
            "format": "openvino"
        }

    converter = OpenVINOConverter(logger=logger)
    return converter.convert(onnx_path, options)


def _convert_to_ncnn(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    """Internal NCNN conversion."""
    if not CONVERTERS_AVAILABLE:
        return {
            "success": False,
            "error": "NCNN converter modules unavailable in WASM runtime.",
            "wasm_limitation": True,
            "format": "ncnn"
        }

    converter = NCNNConverter(logger=logger)
    return converter.convert(onnx_path, options)


def _convert_to_mnn(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    """Internal MNN conversion."""
    if not CONVERTERS_AVAILABLE:
        return {
            "success": False,
            "error": "MNN converter modules unavailable in WASM runtime.",
            "wasm_limitation": True,
            "format": "mnn"
        }

    converter = MNNConverter(logger=logger)
    return converter.convert(onnx_path, options)


def _convert_to_paddlelite(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    """Internal Paddle Lite conversion."""
    if not CONVERTERS_AVAILABLE:
        return {
            "success": False,
            "error": "Paddle Lite converter modules unavailable in WASM runtime.",
            "wasm_limitation": True,
            "format": "paddlelite"
        }

    converter = PaddleLiteConverter(logger=logger)
    return converter.convert(onnx_path, options)


def _convert_to_tnn(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    """Internal TNN conversion."""
    if not CONVERTERS_AVAILABLE:
        return {
            "success": False,
            "error": "TNN converter modules unavailable in WASM runtime.",
            "wasm_limitation": True,
            "format": "tnn"
        }

    converter = TNNConverter(logger=logger)
    return converter.convert(onnx_path, options)


def _convert_to_tengine(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    """Internal Tengine conversion."""
    if not CONVERTERS_AVAILABLE:
        return {
            "success": False,
            "error": "Tengine converter modules unavailable in WASM runtime.",
            "wasm_limitation": True,
            "format": "tengine"
        }

    converter = TengineConverter(logger=logger)
    return converter.convert(onnx_path, options)


def _convert_with_toolchain_bridge(target_format: str, onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    """Generic bridge for dynamically registered JS/WASM toolchains."""
    try:
        import wasm_toolchains  # type: ignore
    except Exception:
        return {
            "success": False,
            "error": f'Toolchain "{target_format}" is not available in current WASM runtime.',
            "wasm_limitation": True,
            "format": target_format
        }

    if not hasattr(wasm_toolchains, "convert_with_toolchain"):
        return {
            "success": False,
            "error": "wasm_toolchains.convert_with_toolchain is not registered.",
            "wasm_limitation": True,
            "format": target_format
        }

    try:
        with open(onnx_path, 'rb') as f:
            onnx_buffer = f.read()

        logger.info(f"Using dynamic toolchain bridge for {target_format}", "converting", 48)
        raw = wasm_toolchains.convert_with_toolchain(
            target_format,
            base64.b64encode(onnx_buffer).decode('utf-8'),
            json.dumps(options),
        )
        result = json.loads(raw)

        if result.get("success"):
            result.setdefault("format", target_format)
            result.setdefault("filename", f"model.{target_format}")

        return result
    except Exception as e:
        return {
            "success": False,
            "error": f'{target_format} toolchain bridge error: {str(e)}',
            "wasm_limitation": True,
            "format": target_format
        }


def analyze_model(model_buffer: Union[bytes, str],
                  is_base64: bool = False) -> str:
    """
    Perform detailed analysis of an ONNX model.

    Args:
        model_buffer: Model data as bytes or base64 string
        is_base64: Whether the buffer is base64 encoded

    Returns:
        JSON string with analysis results
    """
    logger = JSLogger("ANALYZER")
    logger.info("Starting model analysis", "analyzing", 0)

    try:
        _ensure_directories()

        # Decode buffer
        if is_base64 and isinstance(model_buffer, str):
            model_buffer = base64.b64decode(model_buffer)
        elif isinstance(model_buffer, str):
            model_buffer = model_buffer.encode()

        # Write to temp file
        input_path = '/tmp/onnx_convert/analyze_input.onnx'
        with open(input_path, 'wb') as f:
            f.write(model_buffer)

        logger.info("Model loaded", "analyzing", 20)

        # Analyze
        if UTILS_AVAILABLE:
            analyzer = ModelAnalyzer(logger=logger)
            result = analyzer.analyze(input_path)
        else:
            # Basic analysis
            import onnx
            model = onnx.load(input_path)

            op_counts = {}
            for node in model.graph.node:
                op_counts[node.op_type] = op_counts.get(node.op_type, 0) + 1

            result = {
                "success": True,
                "basic_info": {
                    "ir_version": model.ir_version,
                    "producer_name": model.producer_name or "Unknown",
                    "node_count": len(model.graph.node),
                    "operators": dict(sorted(op_counts.items(), key=lambda x: x[1], reverse=True))
                }
            }

        # Estimate memory
        try:
            result["memory_estimate"] = estimate_memory_usage(input_path)
        except:
            pass

        # Cleanup
        try:
            os.remove(input_path)
        except:
            pass

        logger.info("Analysis complete", "analyzing", 100)
        return json.dumps(result)

    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        logger.error(f"Analysis failed: {str(e)}", "analyzing", 0)
        return json.dumps(error_result)


def get_supported_formats() -> str:
    """Get list of supported target formats."""
    dynamic_formats = {}

    if CONVERTERS_AVAILABLE:
        try:
            converter_matrix = {
                "openvino": OpenVINOConverter(logger=_module_logger).describe_capability(),
                "ncnn": NCNNConverter(logger=_module_logger).describe_capability(),
                "mnn": MNNConverter(logger=_module_logger).describe_capability(),
                "paddlelite": PaddleLiteConverter(logger=_module_logger).describe_capability(),
                "tnn": TNNConverter(logger=_module_logger).describe_capability(),
                "tengine": TengineConverter(logger=_module_logger).describe_capability(),
            }
        except Exception:
            converter_matrix = {}
    else:
        converter_matrix = {}

    formats = {
        "tflite": {
            "name": "TensorFlow Lite",
            "extension": ".tflite",
            "wasm_supported": True,
            "quantization": ["none", "fp16", "int8", "dynamic"],
            "available": True,
            "artifacts": ["model.tflite"],
        },
        "openvino": {
            "name": "OpenVINO IR",
            "extension": ".xml+.bin",
            "wasm_supported": converter_matrix.get("openvino", {}).get("wasm_supported", False),
            "quantization": converter_matrix.get("openvino", {}).get("quantization", ["none", "fp16"]),
            "available": converter_matrix.get("openvino", {}).get("available", False),
            "artifacts": converter_matrix.get("openvino", {}).get("artifacts", ["model.xml", "model.bin"]),
            "reason": converter_matrix.get("openvino", {}).get("reason"),
        },
        "ncnn": {
            "name": "NCNN",
            "extension": ".param+.bin",
            "wasm_supported": converter_matrix.get("ncnn", {}).get("wasm_supported", False),
            "quantization": converter_matrix.get("ncnn", {}).get("quantization", ["none", "fp16", "int8"]),
            "available": converter_matrix.get("ncnn", {}).get("available", False),
            "artifacts": converter_matrix.get("ncnn", {}).get("artifacts", ["model.param", "model.bin"]),
            "reason": converter_matrix.get("ncnn", {}).get("reason"),
        },
        "mnn": {
            "name": "MNN",
            "extension": ".mnn",
            "wasm_supported": converter_matrix.get("mnn", {}).get("wasm_supported", False),
            "quantization": converter_matrix.get("mnn", {}).get("quantization", ["none", "fp16", "int8"]),
            "available": converter_matrix.get("mnn", {}).get("available", False),
            "artifacts": converter_matrix.get("mnn", {}).get("artifacts", ["model.mnn"]),
            "reason": converter_matrix.get("mnn", {}).get("reason"),
        },
        "paddlelite": {
            "name": "Paddle Lite",
            "extension": ".nb/model bundle",
            "wasm_supported": converter_matrix.get("paddlelite", {}).get("wasm_supported", False),
            "quantization": converter_matrix.get("paddlelite", {}).get("quantization", ["none", "fp16", "int8"]),
            "available": converter_matrix.get("paddlelite", {}).get("available", False),
            "artifacts": converter_matrix.get("paddlelite", {}).get("artifacts", ["model.nb"]),
            "reason": converter_matrix.get("paddlelite", {}).get("reason"),
        },
        "tnn": {
            "name": "TNN",
            "extension": ".tnnproto+.tnnmodel",
            "wasm_supported": converter_matrix.get("tnn", {}).get("wasm_supported", False),
            "quantization": converter_matrix.get("tnn", {}).get("quantization", ["none", "fp16"]),
            "available": converter_matrix.get("tnn", {}).get("available", False),
            "artifacts": converter_matrix.get("tnn", {}).get("artifacts", ["model.tnnproto", "model.tnnmodel"]),
            "reason": converter_matrix.get("tnn", {}).get("reason"),
        },
        "tengine": {
            "name": "Tengine",
            "extension": ".tmfile",
            "wasm_supported": converter_matrix.get("tengine", {}).get("wasm_supported", False),
            "quantization": converter_matrix.get("tengine", {}).get("quantization", ["none"]),
            "available": converter_matrix.get("tengine", {}).get("available", False),
            "artifacts": converter_matrix.get("tengine", {}).get("artifacts", ["model.tmfile"]),
            "reason": converter_matrix.get("tengine", {}).get("reason"),
        }
    }
    return json.dumps(formats)


# Create module-level logger for direct use
_module_logger = JSLogger()

# Export all public functions
__all__ = [
    'get_version',
    'check_environment',
    'validate_model',
    'simplify_model',
    'convert_model',
    'convert_model_from_path',
    'analyze_model',
    'get_supported_formats',
    'JSLogger',
]
