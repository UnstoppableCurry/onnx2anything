
# Auto-generated Python package loader for Pyodide
# Generated: 2026-05-13T18:19:41.958Z

__file_map__ = {}


# === File: converters/__init__.py ===
__file_map__["converters/__init__.py"] = """\"\"\"
ONNX2Anything Converter Modules

This package provides converters for transforming ONNX models to various formats
optimized for edge deployment.

Supported output formats:
    - TFLite (TensorFlow Lite)
    - OpenVINO (Intel IR)
    - NCNN
    - MNN
    - Paddle Lite
    - TNN (Tencent Neural Network)

Supported input pre-processing:
    - PaddlePaddle → ONNX (via paddle2onnx)

Note: This package is designed to run in Pyodide (WASM) environment.
\"\"\"

from .tflite_converter import TFLiteConverter
from .openvino_converter import OpenVINOConverter
from .ncnn_converter import NCNNConverter
from .mnn_converter import MNNConverter
from .paddlelite_converter import PaddleLiteConverter
from .tnn_converter import TNNConverter
from .tengine_converter import TengineConverter
from .paddle2onnx_converter import convert_paddle_to_onnx

__version__ = \"0.2.0\"
__all__ = [
    \"TFLiteConverter\",
    \"OpenVINOConverter\",
    \"NCNNConverter\",
    \"MNNConverter\",
    \"PaddleLiteConverter\",
    \"TNNConverter\",
    \"TengineConverter\",
    \"convert_paddle_to_onnx\",
]


def get_converter(format_name: str):
    \"\"\"
    Get the appropriate converter for the target format.

    Args:
        format_name: Target format name

    Returns:
        Converter class instance

    Raises:
        ValueError: If format is not supported
    \"\"\"
    converters = {
        \"tflite\": TFLiteConverter,
        \"openvino\": OpenVINOConverter,
        \"ncnn\": NCNNConverter,
        \"mnn\": MNNConverter,
        \"paddlelite\": PaddleLiteConverter,
        \"tnn\": TNNConverter,
        \"tengine\": TengineConverter,
    }

    if format_name.lower() not in converters:
        raise ValueError(f\"Unsupported format: {format_name}. \"
                        f\"Supported formats: {list(converters.keys())}\")

    return converters[format_name.lower()]()


def get_supported_formats():
    \"\"\"Get list of supported target formats.\"\"\"
    return [\"tflite\", \"openvino\", \"ncnn\", \"mnn\", \"paddlelite\", \"tnn\", \"tengine\"]


def get_format_info(format_name: str) -> dict:
    \"\"\"
    Get information about a target format.

    Args:
        format_name: Target format name

    Returns:
        Dictionary with format information
    \"\"\"
    info = {
        \"tflite\": {
            \"name\": \"TensorFlow Lite\",
            \"description\": \"Optimized for mobile and embedded devices\",
            \"file_extension\": \".tflite\",
            \"quantization\": [\"none\", \"fp16\", \"int8\"],
            \"platforms\": [\"Android\", \"iOS\", \"Linux\", \"microcontrollers\"],
            \"wasm_supported\": True,
        },
        \"openvino\": {
            \"name\": \"OpenVINO IR\",
            \"description\": \"Intel OpenVINO intermediate representation\",
            \"file_extension\": \".xml+.bin\",
            \"quantization\": [\"none\", \"fp16\"],
            \"platforms\": [\"Intel CPU\", \"Intel GPU\", \"NPU\"],
            \"wasm_supported\": False,
        },
        \"ncnn\": {
            \"name\": \"NCNN\",
            \"description\": \"Tencent mobile inference framework\",
            \"file_extension\": \".param+.bin\",
            \"quantization\": [\"none\", \"fp16\", \"int8\"],
            \"platforms\": [\"Android\", \"iOS\", \"Linux\"],
            \"wasm_supported\": False,
        },
        \"mnn\": {
            \"name\": \"MNN\",
            \"description\": \"Alibaba lightweight inference framework\",
            \"file_extension\": \".mnn\",
            \"quantization\": [\"none\", \"fp16\", \"int8\"],
            \"platforms\": [\"Android\", \"iOS\", \"Linux\", \"Windows\"],
            \"wasm_supported\": False,
        },
        \"paddlelite\": {
            \"name\": \"Paddle Lite\",
            \"description\": \"Paddle mobile inference format\",
            \"file_extension\": \".nb/model bundle\",
            \"quantization\": [\"none\", \"fp16\", \"int8\"],
            \"platforms\": [\"Android\", \"iOS\", \"ARM Linux\"],
            \"wasm_supported\": False,
        },
        \"tnn\": {
            \"name\": \"TNN\",
            \"description\": \"Tencent cross-platform inference framework\",
            \"file_extension\": \".tnnproto+.tnnmodel\",
            \"quantization\": [\"none\", \"fp16\"],
            \"platforms\": [\"Android\", \"iOS\", \"Linux\", \"macOS\", \"Windows\"],
            \"wasm_supported\": False,
        },
    }

    return info.get(format_name.lower(), {})
"""


# === File: converters/base.py ===
__file_map__["converters/base.py"] = """from typing import Any, Dict, Iterable, Optional


class BaseEdgeConverter:
    \"\"\"Shared base converter behavior for edge format adapters.\"\"\"

    format_name = \"unknown\"
    output_files = ()
    quantization_modes: Iterable[str] = (\"none\",)
    wasm_toolchain_key: Optional[str] = None
    archive_output = False
    native_supported = False

    def __init__(self, logger=None):
        self.logger = logger

    def _log(self, level: str, message: str, stage: str = \"\", percent: int = 0):
        if not self.logger:
            return
        if hasattr(self.logger, 'log'):
            self.logger.log(level, message, stage, percent)
            return
        method_name = {
            'INFO': 'info',
            'WARN': 'warn',
            'ERROR': 'error',
            'DEBUG': 'debug',
        }.get(level, 'info')
        if hasattr(self.logger, method_name):
            getattr(self.logger, method_name)(message, stage, percent)

    def _check_dependencies(self) -> Dict[str, bool]:
        return {}

    def convert(self, onnx_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        raise NotImplementedError

    def describe_capability(self) -> Dict[str, Any]:
        deps = self._check_dependencies()
        has_wasm_bridge = bool(self.wasm_toolchain_key and deps.get(\"wasm_toolchains\"))
        has_native_backend = self.native_supported and any(
            key != \"wasm_toolchains\" and value for key, value in deps.items()
        )
        has_non_wasm_deps = any(
            key != \"wasm_toolchains\" and value for key, value in deps.items()
        )

        available = has_wasm_bridge or has_native_backend

        reason = None
        if not available:
            if has_non_wasm_deps:
                reason = (
                    f\"{self.format_name} runtime libraries are present, but no active conversion backend \"
                    \"is wired for this runtime.\"
                )
            else:
                reason = (
                    f\"{self.format_name} converter is unavailable in the current browser toolchain.\"
                )

        return {
            \"format\": self.format_name,
            \"available\": available,
            \"wasm_supported\": has_wasm_bridge,
            \"quantization\": list(self.quantization_modes),
            \"artifacts\": list(self.output_files),
            \"archive_output\": self.archive_output,
            \"reason\": reason,
            \"dependencies\": deps,
        }

    def _unsupported(self, reason: str, recommendation: str) -> Dict[str, Any]:
        return {
            \"success\": False,
            \"format\": self.format_name,
            \"wasm_limitation\": True,
            \"error\": reason,
            \"recommendation\": recommendation,
        }
"""


# === File: converters/mnn_converter.py ===
__file_map__["converters/mnn_converter.py"] = """import os
import io
import json
import base64
import zipfile
from typing import Any, Dict, Optional

from .base import BaseEdgeConverter


class MNNConverter(BaseEdgeConverter):
    format_name = \"mnn\"
    output_files = (\"model.mnn\",)
    quantization_modes = (\"none\", \"fp16\", \"int8\")
    wasm_toolchain_key = \"mnnConvert\"
    archive_output = True

    def __init__(self, logger=None):
        super().__init__(logger=logger)
        self.temp_dir = '/tmp/onnx_mnn'
        os.makedirs(self.temp_dir, exist_ok=True)

    def _check_dependencies(self) -> Dict[str, bool]:
        deps = {
            \"onnx\": False,
            \"MNN\": False,
            \"wasm_toolchains\": False,
        }
        for dep in [\"onnx\", \"MNN\"]:
            try:
                __import__(dep)
                deps[dep] = True
            except ImportError:
                pass
        try:
            import wasm_toolchains  # type: ignore
            deps[\"wasm_toolchains\"] = True
        except Exception:
            deps[\"wasm_toolchains\"] = False
        return deps

    def convert(self, onnx_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._log(\"INFO\", \"Starting MNN conversion\", \"converting\", 40)
        options = options or {}
        deps = self._check_dependencies()

        if deps.get(\"wasm_toolchains\"):
            try:
                import wasm_toolchains  # type: ignore

                with open(onnx_path, 'rb') as f:
                    onnx_buffer = f.read()

                raw = wasm_toolchains.mnn_wasm_convert(
                    base64.b64encode(onnx_buffer).decode('utf-8'),
                    json.dumps(options),
                )
                bridge_result = json.loads(raw)

                if not bridge_result.get(\"success\"):
                    return {
                        \"success\": False,
                        \"format\": \"mnn\",
                        \"error\": bridge_result.get(\"error\", \"MNN wasm bridge failed\"),
                        \"wasm_limitation\": True,
                    }

                output_base64 = bridge_result.get(\"output_base64\", \"\")
                output_filename = bridge_result.get(\"output_filename\") or \"model.mnn\"

                if not output_base64:
                    return {
                        \"success\": False,
                        \"format\": \"mnn\",
                        \"error\": \"MNN wasm bridge did not return output model\",
                        \"wasm_limitation\": True,
                    }

                output_bytes = base64.b64decode(output_base64)

                if output_filename.endswith('.zip'):
                    payload = output_bytes
                else:
                    zip_buffer = io.BytesIO()
                    with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
                        zf.writestr(output_filename, output_bytes)
                    payload = zip_buffer.getvalue()
                    output_filename = \"model.mnn.zip\"

                return {
                    \"success\": True,
                    \"format\": \"mnn\",
                    \"filename\": output_filename,
                    \"warning\": bridge_result.get(\"warning\"),
                    \"model_base64\": base64.b64encode(payload).decode('utf-8'),
                    \"model_size\": len(payload),
                }
            except Exception as e:
                return {
                    \"success\": False,
                    \"format\": \"mnn\",
                    \"error\": f\"MNN wasm bridge exception: {str(e)}\",
                    \"wasm_limitation\": True,
                }

        return self._unsupported(
            \"MNN converter is not available in current WASM environment.\",
            \"Register wasm_toolchains.mnn_wasm_convert from a real MNN WASM converter toolchain.\"
        )
"""


# === File: converters/ncnn_converter.py ===
__file_map__["converters/ncnn_converter.py"] = """import os
import io
import json
import base64
import zipfile
from typing import Any, Dict, Optional

from .base import BaseEdgeConverter


class NCNNConverter(BaseEdgeConverter):
    format_name = \"ncnn\"
    output_files = (\"model.param\", \"model.bin\")
    quantization_modes = (\"none\", \"fp16\", \"int8\")
    wasm_toolchain_key = \"ncnnConvert\"
    archive_output = True

    def __init__(self, logger=None):
        super().__init__(logger=logger)
        self.temp_dir = '/tmp/onnx_ncnn'
        os.makedirs(self.temp_dir, exist_ok=True)

    def _check_dependencies(self) -> Dict[str, bool]:
        deps = {
            \"onnx\": False,
            \"ncnn\": False,
            \"wasm_toolchains\": False,
        }
        for dep in [\"onnx\", \"ncnn\"]:
            try:
                __import__(dep)
                deps[dep] = True
            except ImportError:
                pass
        try:
            import wasm_toolchains  # type: ignore
            deps[\"wasm_toolchains\"] = True
        except Exception:
            deps[\"wasm_toolchains\"] = False
        return deps

    def convert(self, onnx_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._log(\"INFO\", \"Starting NCNN conversion\", \"converting\", 40)
        options = options or {}
        deps = self._check_dependencies()

        if deps.get(\"wasm_toolchains\"):
            try:
                import wasm_toolchains  # type: ignore

                with open(onnx_path, 'rb') as f:
                    onnx_buffer = f.read()

                raw = wasm_toolchains.ncnn_wasm_convert(
                    base64.b64encode(onnx_buffer).decode('utf-8'),
                    json.dumps(options),
                )
                bridge_result = json.loads(raw)

                if not bridge_result.get(\"success\"):
                    return {
                        \"success\": False,
                        \"format\": \"ncnn\",
                        \"error\": bridge_result.get(\"error\", \"NCNN wasm bridge failed\"),
                        \"wasm_limitation\": True,
                    }

                param_base64 = bridge_result.get(\"param_base64\", \"\")
                bin_base64 = bridge_result.get(\"bin_base64\", \"\")

                if not param_base64 or not bin_base64:
                    return {
                        \"success\": False,
                        \"format\": \"ncnn\",
                        \"error\": \"NCNN wasm bridge did not return .param/.bin artifacts\",
                        \"wasm_limitation\": True,
                    }

                param_bytes = base64.b64decode(param_base64)
                bin_bytes = base64.b64decode(bin_base64)

                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
                    zf.writestr('model.param', param_bytes)
                    zf.writestr('model.bin', bin_bytes)

                zip_bytes = zip_buffer.getvalue()

                return {
                    \"success\": True,
                    \"format\": \"ncnn\",
                    \"filename\": \"model.ncnn.zip\",
                    \"warning\": bridge_result.get(\"warning\"),
                    \"model_base64\": base64.b64encode(zip_bytes).decode('utf-8'),
                    \"model_size\": len(zip_bytes),
                }
            except Exception as e:
                return {
                    \"success\": False,
                    \"format\": \"ncnn\",
                    \"error\": f\"NCNN wasm bridge exception: {str(e)}\",
                    \"wasm_limitation\": True,
                }

        if deps.get(\"ncnn\"):
            return self._unsupported(
                \"NCNN runtime found but converter binding is not wired in current WASM build.\",
                \"Integrate wasm ncnn conversion binary or Python binding entrypoint and retry.\"
            )

        return self._unsupported(
            \"NCNN converter is not available in current WASM environment.\",
            \"Build and load ONNX->NCNN toolchain for Pyodide, then enable this adapter.\"
        )
"""


# === File: converters/openvino_converter.py ===
__file_map__["converters/openvino_converter.py"] = """import os
import io
import json
import base64
import shutil
import tempfile
import zipfile
from typing import Any, Dict, Optional

from .base import BaseEdgeConverter


class OpenVINOConverter(BaseEdgeConverter):
    format_name = \"openvino\"
    output_files = (\"model.xml\", \"model.bin\")
    quantization_modes = (\"none\", \"fp16\")
    wasm_toolchain_key = \"openvinoConvert\"
    archive_output = True
    native_supported = True

    def __init__(self, logger=None):
        super().__init__(logger=logger)
        self.temp_dir = '/tmp/onnx_openvino'
        os.makedirs(self.temp_dir, exist_ok=True)

    def _check_dependencies(self) -> Dict[str, bool]:
        deps = {
            \"onnx\": False,
            \"openvino\": False,
            \"wasm_toolchains\": False,
        }
        for dep in [\"onnx\", \"openvino\"]:
            try:
                __import__(dep)
                deps[dep] = True
            except ImportError:
                pass
        try:
            import wasm_toolchains  # type: ignore
            deps[\"wasm_toolchains\"] = True
        except Exception:
            deps[\"wasm_toolchains\"] = False
        return deps

    def convert(self, onnx_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._log(\"INFO\", \"Starting OpenVINO conversion\", \"converting\", 40)
        options = options or {}
        deps = self._check_dependencies()
        quantization = str(options.get(\"quantization\", \"none\")).lower()

        if deps.get(\"wasm_toolchains\"):
            try:
                import wasm_toolchains  # type: ignore

                with open(onnx_path, 'rb') as f:
                    onnx_buffer = f.read()

                raw = wasm_toolchains.openvino_wasm_convert(
                    base64.b64encode(onnx_buffer).decode('utf-8'),
                    json.dumps(options),
                )
                bridge_result = json.loads(raw)

                if not bridge_result.get(\"success\"):
                    return {
                        \"success\": False,
                        \"format\": \"openvino\",
                        \"error\": bridge_result.get(\"error\", \"OpenVINO wasm bridge failed\"),
                        \"wasm_limitation\": True,
                    }

                output_base64 = bridge_result.get(\"output_base64\", \"\")
                output_filename = bridge_result.get(\"output_filename\") or \"model.openvino.zip\"

                if not output_base64:
                    return {
                        \"success\": False,
                        \"format\": \"openvino\",
                        \"error\": \"OpenVINO wasm bridge did not return output payload\",
                        \"wasm_limitation\": True,
                    }

                output_bytes = base64.b64decode(output_base64)

                if output_filename.endswith('.zip'):
                    payload = output_bytes
                else:
                    zip_buffer = io.BytesIO()
                    with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
                        zf.writestr(output_filename, output_bytes)
                    payload = zip_buffer.getvalue()
                    output_filename = \"model.openvino.zip\"

                return {
                    \"success\": True,
                    \"format\": \"openvino\",
                    \"filename\": output_filename,
                    \"warning\": bridge_result.get(\"warning\"),
                    \"model_base64\": base64.b64encode(payload).decode('utf-8'),
                    \"model_size\": len(payload),
                }
            except Exception as e:
                return {
                    \"success\": False,
                    \"format\": \"openvino\",
                    \"error\": f\"OpenVINO wasm bridge exception: {str(e)}\",
                    \"wasm_limitation\": True,
                }

        if quantization == \"int8\":
            return {
                \"success\": False,
                \"format\": \"openvino\",
                \"error\": (
                    \"OpenVINO int8 export is not supported in this workflow. \"
                    \"It requires a separate PTQ pipeline such as NNCF.\"
                ),
                \"recommendation\": (
                    \"Use quantization='none' or 'fp16', or run a dedicated PTQ pipeline.\"
                ),
            }

        if quantization not in self.quantization_modes:
            return {
                \"success\": False,
                \"format\": \"openvino\",
                \"error\": f\"Unsupported OpenVINO quantization mode: {quantization}\",
                \"recommendation\": \"Use quantization='none' or 'fp16'.\",
            }

        if deps.get(\"openvino\"):
            return self._convert_with_openvino_runtime(onnx_path, quantization)

        return self._unsupported(
            \"OpenVINO converter is not available in current WASM environment.\",
            \"Use the native OpenVINO Python package or register wasm_toolchains.openvino_wasm_convert from a real OpenVINO WASM converter toolchain.\"
        )

    def _convert_with_openvino_runtime(self, onnx_path: str, quantization: str) -> Dict[str, Any]:
        try:
            import openvino as ov
        except Exception as e:
            return {
                \"success\": False,
                \"format\": \"openvino\",
                \"error\": f\"Failed to import OpenVINO runtime: {str(e)}\",
            }

        work_root = tempfile.mkdtemp(prefix=\".openvino-native-\", dir=self.temp_dir)
        xml_path = os.path.join(work_root, \"model.xml\")
        bin_path = os.path.join(work_root, \"model.bin\")

        try:
            self._log(\"INFO\", \"Using native OpenVINO Python API\", \"converting\", 50)
            model = ov.convert_model(onnx_path)
            ov.save_model(
                model,
                xml_path,
                compress_to_fp16=(quantization == \"fp16\"),
            )

            if not os.path.exists(xml_path) or not os.path.exists(bin_path):
                return {
                    \"success\": False,
                    \"format\": \"openvino\",
                    \"error\": \"OpenVINO conversion did not produce model.xml/model.bin\",
                }

            with open(xml_path, 'rb') as f:
                xml_bytes = f.read()
            with open(bin_path, 'rb') as f:
                bin_bytes = f.read()

            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
                zf.writestr('model.xml', xml_bytes)
                zf.writestr('model.bin', bin_bytes)
            payload = zip_buffer.getvalue()

            return {
                \"success\": True,
                \"format\": \"openvino\",
                \"filename\": \"model.openvino.zip\",
                \"model_base64\": base64.b64encode(payload).decode('utf-8'),
                \"model_size\": len(payload),
                \"xml_size\": len(xml_bytes),
                \"bin_size\": len(bin_bytes),
                \"quantization\": quantization,
                \"method\": \"openvino_python_api\",
            }
        except Exception as e:
            return {
                \"success\": False,
                \"format\": \"openvino\",
                \"error\": f\"OpenVINO native conversion failed: {str(e)}\",
            }
        finally:
            shutil.rmtree(work_root, ignore_errors=True)
"""


# === File: converters/paddle2onnx_converter.py ===
__file_map__["converters/paddle2onnx_converter.py"] = """\"\"\"
PaddlePaddle → ONNX converter (runs in Pyodide via micropip).

paddle2onnx >= 1.0 can perform static-graph export without running
inference, so it does not require the full paddlepaddle runtime.
However, its current PyPI release (2.x) pulls in `polygraphy` which
is unlikely to be available in Pyodide.  The converter implements
graceful degradation: it tries to install & use paddle2onnx, and
returns a clear error when the package cannot be loaded so the UI can
surface an actionable message instead of a raw traceback.
\"\"\"

import base64
import json
import os
from typing import Optional

PADDLE2ONNX_NOT_AVAILABLE_REASON = (
    \"paddle2onnx 当前无法在浏览器 (Pyodide) 环境中安装，\"
    \"因为其依赖项 polygraphy 尚未提供 WASM 兼容的 wheel。\"
    \"请使用本地 Python 环境或 Docker 容器执行 paddle2onnx 转换。\"
)

PADDLE2ONNX_NOT_AVAILABLE_RECOMMENDATION = (
    \"在本地安装: pip install paddle2onnx\\n\"
    \"然后运行: paddle2onnx --model_dir <dir> --model_filename model.pdmodel \"
    \"--params_filename model.pdiparams --save_file output.onnx --opset_version 13\"
)


def convert_paddle_to_onnx(
    model_data_base64: str,
    params_data_base64: Optional[str] = None,
    opset_version: int = 13,
) -> str:
    \"\"\"
    Convert a PaddlePaddle model to ONNX format.

    Args:
        model_data_base64: base64-encoded .pdmodel file content.
        params_data_base64: base64-encoded .pdiparams file content (optional).
        opset_version: ONNX opset version to target (default 13).

    Returns:
        JSON string with keys:
          success (bool), onnx_base64 (str), message (str), error (str)
    \"\"\"
    logger_lines = []

    def _log(msg: str) -> None:
        logger_lines.append(msg)
        print(f\"[PADDLE2ONNX] {msg}\", flush=True)

    _log(\"开始 PaddlePaddle → ONNX 转换\")

    # ------------------------------------------------------------------ #
    # Step 1: attempt to install paddle2onnx via micropip
    # ------------------------------------------------------------------ #
    try:
        import micropip  # type: ignore  # available in Pyodide
        import asyncio

        _log(\"尝试安装 paddle2onnx …\")
        asyncio.get_event_loop().run_until_complete(
            micropip.install(\"paddle2onnx\")
        )
        _log(\"paddle2onnx 安装成功\")
    except ImportError:
        # Not in Pyodide – micropip unavailable; try direct import below
        _log(\"micropip 不可用，尝试直接导入 paddle2onnx …\")
    except Exception as install_err:
        return json.dumps(
            {
                \"success\": False,
                \"error\": PADDLE2ONNX_NOT_AVAILABLE_REASON,
                \"recommendation\": PADDLE2ONNX_NOT_AVAILABLE_RECOMMENDATION,
                \"install_error\": str(install_err),
            }
        )

    # ------------------------------------------------------------------ #
    # Step 2: import paddle2onnx
    # ------------------------------------------------------------------ #
    try:
        import paddle2onnx  # type: ignore
    except ImportError as imp_err:
        return json.dumps(
            {
                \"success\": False,
                \"error\": PADDLE2ONNX_NOT_AVAILABLE_REASON,
                \"recommendation\": PADDLE2ONNX_NOT_AVAILABLE_RECOMMENDATION,
                \"import_error\": str(imp_err),
            }
        )

    # ------------------------------------------------------------------ #
    # Step 3: write model bytes to the Pyodide virtual filesystem
    # ------------------------------------------------------------------ #
    try:
        model_bytes = base64.b64decode(model_data_base64)
    except Exception as decode_err:
        return json.dumps(
            {\"success\": False, \"error\": f\"无法解码 model_data_base64: {decode_err}\"}
        )

    work_dir = \"/tmp/paddle2onnx_work\"
    os.makedirs(work_dir, exist_ok=True)

    model_path = os.path.join(work_dir, \"model.pdmodel\")
    with open(model_path, \"wb\") as fh:
        fh.write(model_bytes)
    _log(f\"写入模型文件: {model_path} ({len(model_bytes)} bytes)\")

    params_filename: Optional[str] = None
    if params_data_base64:
        try:
            params_bytes = base64.b64decode(params_data_base64)
        except Exception as decode_err:
            return json.dumps(
                {
                    \"success\": False,
                    \"error\": f\"无法解码 params_data_base64: {decode_err}\",
                }
            )
        params_path = os.path.join(work_dir, \"model.pdiparams\")
        with open(params_path, \"wb\") as fh:
            fh.write(params_bytes)
        params_filename = \"model.pdiparams\"
        _log(f\"写入参数文件: {params_path} ({len(params_bytes)} bytes)\")

    # ------------------------------------------------------------------ #
    # Step 4: convert
    # ------------------------------------------------------------------ #
    onnx_path = os.path.join(work_dir, \"output.onnx\")

    try:
        paddle2onnx.export(
            model_dir=work_dir,
            model_filename=\"model.pdmodel\",
            params_filename=params_filename,
            save_file=onnx_path,
            opset_version=opset_version,
            enable_onnx_checker=True,
        )
    except Exception as conv_err:
        import traceback

        return json.dumps(
            {
                \"success\": False,
                \"error\": f\"paddle2onnx 转换失败: {conv_err}\",
                \"traceback\": traceback.format_exc(),
            }
        )

    if not os.path.exists(onnx_path):
        return json.dumps(
            {\"success\": False, \"error\": \"paddle2onnx 未生成输出文件\"}
        )

    with open(onnx_path, \"rb\") as fh:
        onnx_bytes = fh.read()

    _log(f\"转换成功，ONNX 大小: {len(onnx_bytes)} bytes\")

    # ------------------------------------------------------------------ #
    # Step 5: clean up temp files
    # ------------------------------------------------------------------ #
    for fname in [model_path, onnx_path]:
        try:
            os.remove(fname)
        except OSError:
            pass
    if params_filename:
        try:
            os.remove(os.path.join(work_dir, params_filename))
        except OSError:
            pass

    return json.dumps(
        {
            \"success\": True,
            \"onnx_base64\": base64.b64encode(onnx_bytes).decode(\"utf-8\"),
            \"onnx_size\": len(onnx_bytes),
            \"message\": f\"PaddlePaddle → ONNX 转换成功 ({len(onnx_bytes)} bytes)\",
            \"logs\": logger_lines,
        }
    )
"""


# === File: converters/paddlelite_converter.py ===
__file_map__["converters/paddlelite_converter.py"] = """import os
from typing import Any, Dict, Optional

from .base import BaseEdgeConverter


BACK_HALF_ONLY_REASON = (
    \"Paddle Lite 浏览器链路当前只有 back-half：现有 WASM 仅覆盖 \"
    \"Paddle inference model -> .nb；前半段 ONNX -> Paddle 仍依赖 \"
    \"x2paddle + paddle Python 运行时。\"
)

BACK_HALF_ONLY_RECOMMENDATION = (
    \"继续使用 native/container export。不要把 `paddle_lite_opt.js/.wasm` \"
    \"误判成完整的 ONNX -> Paddle Lite 浏览器转换链路。\"
)

NATIVE_EXPORT_ONLY_REASON = (
    \"已检测到 x2paddle + paddle Python 运行时，但当前这个 Python converter \"
    \"并未内嵌 Paddle Lite native opt 后半段。\"
)

NATIVE_EXPORT_ONLY_RECOMMENDATION = (
    \"请改走 `node scripts/export-paddlelite-artifacts-native.mjs \"
    \"<modelPath> <outPath>` 或容器内 native export。\"
)


class PaddleLiteConverter(BaseEdgeConverter):
    format_name = \"paddlelite\"
    output_files = (\"model.nb\",)
    quantization_modes = (\"none\", \"fp16\", \"int8\")
    wasm_toolchain_key = \"paddleliteConvert\"
    archive_output = True

    def __init__(self, logger=None):
        super().__init__(logger=logger)
        self.temp_dir = '/tmp/onnx_paddlelite'
        os.makedirs(self.temp_dir, exist_ok=True)

    def _check_dependencies(self) -> Dict[str, bool]:
        deps = {
            \"onnx\": False,
            \"x2paddle\": False,
            \"paddle\": False,
            \"wasm_toolchains\": False,
        }
        for dep in [\"onnx\", \"x2paddle\", \"paddle\"]:
            try:
                __import__(dep)
                deps[dep] = True
            except ImportError:
                pass
        try:
            import wasm_toolchains  # type: ignore
            deps[\"wasm_toolchains\"] = True
        except Exception:
            deps[\"wasm_toolchains\"] = False
        return deps

    @staticmethod
    def _has_front_half_runtime(deps: Dict[str, bool]) -> bool:
        return bool(deps.get(\"x2paddle\") and deps.get(\"paddle\"))

    def describe_capability(self) -> Dict[str, Any]:
        deps = self._check_dependencies()
        capability = super().describe_capability()

        if deps.get(\"wasm_toolchains\"):
            capability.update(
                {
                    \"available\": False,
                    \"wasm_supported\": False,
                    \"reason\": BACK_HALF_ONLY_REASON,
                    \"backend_stage\": \"back-half-only\",
                    \"dependencies\": deps,
                }
            )
            return capability

        if self._has_front_half_runtime(deps):
            capability.update(
                {
                    \"available\": False,
                    \"wasm_supported\": False,
                    \"reason\": NATIVE_EXPORT_ONLY_REASON,
                    \"backend_stage\": \"native-export-only\",
                    \"dependencies\": deps,
                }
            )
            return capability

        return capability

    def convert(self, onnx_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._log(\"INFO\", \"Starting Paddle Lite conversion\", \"converting\", 40)
        options = options or {}
        deps = self._check_dependencies()

        if deps.get(\"wasm_toolchains\"):
            return self._unsupported(
                BACK_HALF_ONLY_REASON,
                BACK_HALF_ONLY_RECOMMENDATION,
            )

        if self._has_front_half_runtime(deps):
            return self._unsupported(
                NATIVE_EXPORT_ONLY_REASON,
                NATIVE_EXPORT_ONLY_RECOMMENDATION,
            )

        return self._unsupported(
            \"Paddle Lite converter is not available in current WASM environment.\",
            \"Current front-half still requires x2paddle + paddle Python runtime; continue with native/container export.\"
        )
"""


# === File: converters/tengine_converter.py ===
__file_map__["converters/tengine_converter.py"] = """import os
import json
import base64
from typing import Any, Dict, Optional

from .base import BaseEdgeConverter


class TengineConverter(BaseEdgeConverter):
    format_name = \"tengine\"
    output_files = (\"model.tmfile\",)
    quantization_modes = (\"none\",)
    wasm_toolchain_key = \"tengineConvert\"
    archive_output = False

    def __init__(self, logger=None):
        super().__init__(logger=logger)
        self.temp_dir = '/tmp/onnx_tengine'
        os.makedirs(self.temp_dir, exist_ok=True)

    def _check_dependencies(self) -> Dict[str, bool]:
        deps = {
            \"wasm_toolchains\": False,
        }
        try:
            import wasm_toolchains  # type: ignore
            deps[\"wasm_toolchains\"] = True
        except Exception:
            deps[\"wasm_toolchains\"] = False
        return deps

    def convert(self, onnx_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._log(\"INFO\", \"Starting Tengine conversion\", \"converting\", 40)
        options = options or {}
        deps = self._check_dependencies()

        if deps.get(\"wasm_toolchains\"):
            try:
                import wasm_toolchains  # type: ignore

                with open(onnx_path, 'rb') as f:
                    onnx_buffer = f.read()

                raw = wasm_toolchains.tengine_wasm_convert(
                    base64.b64encode(onnx_buffer).decode('utf-8'),
                    json.dumps(options),
                )
                bridge_result = json.loads(raw)

                if not bridge_result.get(\"success\"):
                    return {
                        \"success\": False,
                        \"format\": \"tengine\",
                        \"error\": bridge_result.get(\"error\", \"Tengine wasm bridge failed\"),
                        \"wasm_limitation\": True,
                    }

                output_base64 = bridge_result.get(\"output_base64\", \"\")
                if not output_base64:
                    return {
                        \"success\": False,
                        \"format\": \"tengine\",
                        \"error\": \"Tengine wasm bridge did not return .tmfile artifact\",
                        \"wasm_limitation\": True,
                    }

                output_bytes = base64.b64decode(output_base64)

                return {
                    \"success\": True,
                    \"format\": \"tengine\",
                    \"filename\": \"model.tmfile\",
                    \"warning\": bridge_result.get(\"warning\"),
                    \"model_base64\": base64.b64encode(output_bytes).decode('utf-8'),
                    \"model_size\": len(output_bytes),
                }
            except Exception as e:
                return {
                    \"success\": False,
                    \"format\": \"tengine\",
                    \"error\": f\"Tengine wasm bridge exception: {str(e)}\",
                    \"wasm_limitation\": True,
                }

        return self._unsupported(
            \"Tengine converter WASM toolchain is not yet loaded.\",
            \"Build and load ONNX->Tengine toolchain (TengineConvert.wasm) for Pyodide, then enable this adapter.\"
        )
"""


# === File: converters/tflite_converter.py ===
__file_map__["converters/tflite_converter.py"] = """\"\"\"
ONNX to TFLite Converter

This module provides conversion from ONNX format to TensorFlow Lite format.
Optimized for Pyodide (WASM) environment with minimal dependencies.
\"\"\"

import json
import os
import sys
import struct
from typing import Dict, List, Tuple, Optional, Any, Union
from io import BytesIO


class TFLiteConverter:
    \"\"\"
    ONNX to TensorFlow Lite converter.

    Supports:
        - Standard FP32 conversion
n        - FP16 quantization
        - INT8 quantization (post-training)
        - Dynamic range quantization
    \"\"\"

    def __init__(self, logger=None):
        \"\"\"
        Initialize the converter.

        Args:
            logger: Optional logger instance for progress reporting
        \"\"\"
        self.logger = logger
        self.temp_dir = '/tmp/onnx_tflite'
        os.makedirs(self.temp_dir, exist_ok=True)

    def _log(self, level: str, message: str, stage: str = \"\", percent: int = 0):
        \"\"\"Log a message if logger is available.\"\"\"
        if self.logger:
            if hasattr(self.logger, 'log'):
                self.logger.log(level, message, stage, percent)
            elif hasattr(self.logger, 'info') and level == \"INFO\":
                self.logger.info(message, stage, percent)
            elif hasattr(self.logger, 'warn') and level == \"WARN\":
                self.logger.warn(message, stage, percent)
            elif hasattr(self.logger, 'error') and level == \"ERROR\":
                self.logger.error(message, stage, percent)

    def _check_dependencies(self) -> Dict[str, bool]:
        \"\"\"
        Check which dependencies are available.

        Returns:
            Dictionary mapping dependency names to availability
        \"\"\"
        deps = {
            \"onnx\": False,
            \"onnxsim\": False,
            \"tensorflow\": False,
            \"onnx2tf\": False,
            \"numpy\": False,
        }

        for dep in deps.keys():
            try:
                __import__(dep)
                deps[dep] = True
            except ImportError:
                pass

        return deps

    def convert(self,
                onnx_path: str,
                output_path: str,
                options: Optional[Dict] = None) -> Dict[str, Any]:
        \"\"\"
        Convert ONNX model to TFLite format.

        Args:
            onnx_path: Path to input ONNX model
            output_path: Path for output TFLite model
            options: Conversion options dictionary
                - quantization: 'none', 'fp16', 'int8', 'dynamic'
                - input_shapes: Dict of input name to shape
                - optimization: bool, apply optimizations
                - calibration_data: Optional calibration data for INT8
                - target_platform: 'default', 'edgetpu', 'micro'

        Returns:
            Dictionary with conversion results
        \"\"\"
        options = options or {}
        quantization = options.get(\"quantization\", \"none\")

        self._log(\"INFO\", f\"Starting TFLite conversion with {quantization} quantization\",
                  \"converting\", 40)

        deps = self._check_dependencies()

        # Strategy selection based on available dependencies
        if deps[\"onnx2tf\"] and deps[\"tensorflow\"]:
            return self._convert_with_onnx2tf(onnx_path, output_path, options, deps)
        elif deps[\"tensorflow\"]:
            return self._convert_with_tf_direct(onnx_path, output_path, options, deps)
        else:
            return self._convert_fallback(onnx_path, output_path, options)

    def _convert_with_onnx2tf(self,
                               onnx_path: str,
                               output_path: str,
                               options: Dict,
                               deps: Dict) -> Dict[str, Any]:
        \"\"\"
        Convert using onnx2tf library (preferred method).
        \"\"\"
        try:
            from onnx2tf import convert

            self._log(\"INFO\", \"Using onnx2tf converter\", \"converting\", 45)

            # Build conversion options
            convert_opts = {
                \"input_onnx_file_path\": onnx_path,
                \"output_folder_path\": os.path.dirname(output_path),
                \"output_tflite_file_path\": output_path,
                \"overwrite_input_shape\": options.get(\"input_shapes\"),
                \"no_large_tensor\": options.get(\"no_large_tensor\", False),
                \"verbosity\": \"info\" if options.get(\"verbose\") else \"error\",
                \"copy_onnx_input_output_names_to_tflite\": True,
            }

            # Apply optimizations
            if options.get(\"optimization\", True):
                convert_opts[\"optimization\"] = True

            # Handle quantization
            quantize = options.get(\"quantization\", \"none\")

            if quantize == \"fp16\":
                self._log(\"INFO\", \"Applying FP16 quantization\", \"quantizing\", 75)
                convert_opts[\"output_float16_quantized_tflite\"] = True

            elif quantize == \"int8\":
                self._log(\"INFO\", \"Applying INT8 quantization\", \"quantizing\", 75)
                convert_opts[\"output_integer_quantized_tflite\"] = True
                convert_opts[\"quant_type\"] = \"per-channel\"

                # Calibration data for INT8
                calib_data = options.get(\"calibration_data\")
                if calib_data:
                    convert_opts[\"quant_calib_input_op_name_np_data_path\"] = calib_data
                else:
                    # Default representative dataset
                    convert_opts[\"quant_calib_input_op_name_np_data_path\"] = None

            elif quantize == \"dynamic\":
                self._log(\"INFO\", \"Applying dynamic range quantization\", \"quantizing\", 75)
                convert_opts[\"output_dynamic_range_quantized_tflite\"] = True

            # Target platform
            platform = options.get(\"target_platform\", \"default\")
            if platform == \"edgetpu\":
                convert_opts[\"output_edgetpu\"] = True

            # Execute conversion
            convert(**convert_opts)

            if os.path.exists(output_path):
                output_size = os.path.getsize(output_path)
                self._log(\"INFO\", f\"TFLite conversion complete: {output_size} bytes\",
                          \"converting\", 90)

                return {
                    \"success\": True,
                    \"output_path\": output_path,
                    \"output_size\": output_size,
                    \"quantization\": quantize,
                    \"method\": \"onnx2tf\",
                    \"message\": f\"Successfully converted to TFLite ({quantize} quantization)\"
                }
            else:
                return {
                    \"success\": False,
                    \"error\": \"Output file was not created\",
                    \"method\": \"onnx2tf\"
                }

        except Exception as e:
            self._log(\"ERROR\", f\"onnx2tf conversion failed: {str(e)}\", \"converting\", 0)
            # Fall back to alternative method
            return self._convert_with_tf_direct(onnx_path, output_path, options, deps)

    def _convert_with_tf_direct(self,
                                 onnx_path: str,
                                 output_path: str,
                                 options: Dict,
                                 deps: Dict) -> Dict[str, Any]:
        \"\"\"
        Convert using TensorFlow's native converter.
        Requires ONNX model to be loaded and converted to TF first.
        \"\"\"
        try:
            import tensorflow as tf
            import onnx
            from onnx import numpy_helper

            self._log(\"INFO\", \"Using TensorFlow direct converter\", \"converting\", 45)

            # Load ONNX model
            onnx_model = onnx.load(onnx_path)

            # Convert to TensorFlow (basic implementation)
            # Note: Full implementation would use onnx-tf or tf-onnx
            self._log(\"INFO\", \"Converting ONNX to TensorFlow format\", \"converting\", 50)

            # This is a simplified placeholder - actual implementation
            # would require onnx-tf or similar library
            return {
                \"success\": False,
                \"error\": \"Direct TensorFlow conversion requires onnx-tf package which is not available in WASM\",
                \"fallback_available\": True,
                \"method\": \"tf_direct\"
            }

        except Exception as e:
            self._log(\"ERROR\", f\"TensorFlow conversion failed: {str(e)}\", \"converting\", 0)
            return self._convert_fallback(onnx_path, output_path, options)

    def _convert_fallback(self,
                          onnx_path: str,
                          output_path: str,
                          options: Dict) -> Dict[str, Any]:
        \"\"\"
        Fallback conversion when full libraries are not available.
        Provides information about the model and suggests alternatives.
        \"\"\"
        self._log(\"WARN\", \"Full conversion libraries not available in WASM environment\",
                  \"converting\", 0)

        try:
            import onnx

            # Load model to get info
            model = onnx.load(onnx_path)

            # Collect model information
            node_count = len(model.graph.node)
            input_count = len(model.graph.input)
            output_count = len(model.graph.output)

            # Get operator types
            op_types = {}
            for node in model.graph.node:
                op_types[node.op_type] = op_types.get(node.op_type, 0) + 1

            self._log(\"INFO\", f\"Model info: {node_count} nodes, {input_count} inputs, {output_count} outputs\",
                      \"analyzing\", 50)

            return {
                \"success\": False,
                \"error\": \"TFLite conversion requires onnx2tf or TensorFlow which are not available in WASM\",
                \"wasm_limitation\": True,
                \"model_info\": {
                    \"node_count\": node_count,
                    \"input_count\": input_count,
                    \"output_count\": output_count,
                    \"operators\": op_types,
                    \"opset_version\": model.opset_import[0].version if model.opset_import else None,
                },
                \"recommendation\": \"Use server-side conversion for this model, or download the ONNX model and convert locally with onnx2tf\"
            }

        except Exception as e:
            return {
                \"success\": False,
                \"error\": f\"Fallback analysis failed: {str(e)}\",
                \"wasm_limitation\": True
            }

    def quantize_model(self,
                       input_path: str,
                       output_path: str,
                       quantization: str,
                       calibration_data: Optional[Any] = None) -> Dict[str, Any]:
        \"\"\"
        Apply quantization to an existing TFLite model.

        Args:
            input_path: Path to input TFLite model
            output_path: Path for output quantized model
            quantization: Quantization type ('fp16', 'int8', 'dynamic')
            calibration_data: Calibration data for INT8 quantization

        Returns:
            Dictionary with quantization results
        \"\"\"
        try:
            import tensorflow as tf

            self._log(\"INFO\", f\"Applying {quantization} quantization\", \"quantizing\", 80)

            # Load model
            converter = tf.lite.TFLiteConverter.from_saved_model(input_path)

            if quantization == \"fp16\":
                converter.optimizations = [tf.lite.Optimize.DEFAULT]
                converter.target_spec.supported_types = [tf.float16]

            elif quantization == \"int8\":
                converter.optimizations = [tf.lite.Optimize.DEFAULT]
                converter.representative_dataset = calibration_data or self._default_representative_dataset

            elif quantization == \"dynamic\":
                converter.optimizations = [tf.lite.Optimize.DEFAULT]

            # Convert
            tflite_model = converter.convert()

            # Save
            with open(output_path, 'wb') as f:
                f.write(tflite_model)

            input_size = os.path.getsize(input_path)
            output_size = os.path.getsize(output_path)
            reduction = (input_size - output_size) / input_size * 100

            self._log(\"INFO\", f\"Quantization complete: {reduction:.1f}% size reduction\",
                      \"quantizing\", 95)

            return {
                \"success\": True,
                \"input_size\": input_size,
                \"output_size\": output_size,
                \"reduction_percent\": reduction,
                \"quantization\": quantization
            }

        except ImportError:
            return {
                \"success\": False,
                \"error\": \"TensorFlow not available for quantization\"
            }
        except Exception as e:
            return {
                \"success\": False,
                \"error\": f\"Quantization failed: {str(e)}\"
            }

    def _default_representative_dataset(self):
        \"\"\"Generate default representative dataset for INT8 calibration.\"\"\"
        # This should be customized based on actual model input
        for _ in range(100):
            yield [tf.random.normal([1, 224, 224, 3])]

    def get_supported_ops(self) -> List[str]:
        \"\"\"
        Get list of ONNX operators supported for TFLite conversion.

        Returns:
            List of supported operator names
        \"\"\"
        return [
            \"Conv\", \"ConvTranspose\", \"AveragePool\", \"MaxPool\", \"GlobalAveragePool\",
            \"BatchNormalization\", \"InstanceNormalization\", \"LayerNormalization\",
            \"Relu\", \"Relu6\", \"LeakyRelu\", \"Sigmoid\", \"Tanh\", \"Softmax\",
            \"Add\", \"Sub\", \"Mul\", \"Div\", \"Pow\", \"Sqrt\", \"Exp\", \"Log\",
            \"Concat\", \"Split\", \"Transpose\", \"Reshape\", \"Flatten\", \"Squeeze\", \"Unsqueeze\",
            \"Gather\", \"Slice\", \"Pad\", \"Resize\", \"Upsample\",
            \"MatMul\", \"Gemm\", \"LSTM\", \"GRU\", \"RNN\",
            \"ReduceMean\", \"ReduceSum\", \"ReduceMax\", \"ReduceMin\",
            \"Cast\", \"Clip\", \"Abs\", \"Neg\", \"Ceil\", \"Floor\", \"Round\",
            \"Equal\", \"Greater\", \"Less\", \"Not\", \"And\", \"Or\", \"Xor\",
            \"Where\", \"Expand\", \"Tile\", \"Range\", \"Shape\", \"Constant\",
        ]

    def estimate_conversion_complexity(self, onnx_path: str) -> Dict[str, Any]:
        \"\"\"
        Estimate the complexity of converting a model.

        Args:
            onnx_path: Path to ONNX model

        Returns:
            Dictionary with complexity assessment
        \"\"\"
        try:
            import onnx

            model = onnx.load(onnx_path)
            node_count = len(model.graph.node)

            # Count operators by type
            op_counts = {}
            for node in model.graph.node:
                op_counts[node.op_type] = op_counts.get(node.op_type, 0) + 1

            # Identify potentially problematic ops
            complex_ops = ['LSTM', 'GRU', 'RNN', 'Loop', 'If', 'Scan', 'Sequence']
            has_complex_ops = any(op in op_counts for op in complex_ops)

            # Check for dynamic shapes
            has_dynamic_shapes = False
            for inp in model.graph.input:
                for dim in inp.type.tensor_type.shape.dim:
                    if dim.dim_param:  # Dynamic dimension
                        has_dynamic_shapes = True
                        break

            # Estimate time (rough heuristic)
            if node_count < 50:
                estimated_time = \"< 10 seconds\"
                complexity = \"low\"
            elif node_count < 200:
                estimated_time = \"10-30 seconds\"
                complexity = \"medium\"
            else:
                estimated_time = \"> 30 seconds\"
                complexity = \"high\"

            if has_complex_ops:
                complexity = \"high\"
                estimated_time += \" (complex ops detected)\"

            return {
                \"node_count\": node_count,
                \"operator_counts\": op_counts,
                \"has_complex_ops\": has_complex_ops,
                \"has_dynamic_shapes\": has_dynamic_shapes,
                \"complexity\": complexity,
                \"estimated_time\": estimated_time,
                \"likely_success\": not has_complex_ops or complexity != \"high\"
            }

        except Exception as e:
            return {
                \"error\": str(e),
                \"complexity\": \"unknown\"
            }
"""


# === File: converters/tnn_converter.py ===
__file_map__["converters/tnn_converter.py"] = """import os
import io
import json
import base64
import zipfile
from typing import Any, Dict, Optional

from .base import BaseEdgeConverter


class TNNConverter(BaseEdgeConverter):
    format_name = \"tnn\"
    output_files = (\"model.tnnproto\", \"model.tnnmodel\")
    quantization_modes = (\"none\", \"fp16\")
    wasm_toolchain_key = \"tnnConvert\"
    archive_output = True

    def __init__(self, logger=None):
        super().__init__(logger=logger)
        self.temp_dir = '/tmp/onnx_tnn'
        os.makedirs(self.temp_dir, exist_ok=True)

    def _check_dependencies(self) -> Dict[str, bool]:
        deps = {
            \"wasm_toolchains\": False,
        }
        try:
            import wasm_toolchains  # type: ignore
            deps[\"wasm_toolchains\"] = True
        except Exception:
            deps[\"wasm_toolchains\"] = False
        return deps

    def convert(self, onnx_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._log(\"INFO\", \"Starting TNN conversion\", \"converting\", 40)
        options = options or {}
        deps = self._check_dependencies()

        if deps.get(\"wasm_toolchains\"):
            try:
                import wasm_toolchains  # type: ignore

                with open(onnx_path, 'rb') as f:
                    onnx_buffer = f.read()

                raw = wasm_toolchains.tnn_wasm_convert(
                    base64.b64encode(onnx_buffer).decode('utf-8'),
                    json.dumps(options),
                )
                bridge_result = json.loads(raw)

                if not bridge_result.get(\"success\"):
                    return {
                        \"success\": False,
                        \"format\": \"tnn\",
                        \"error\": bridge_result.get(\"error\", \"TNN wasm bridge failed\"),
                        \"wasm_limitation\": True,
                    }

                proto_base64 = bridge_result.get(\"proto_base64\", \"\")
                model_base64 = bridge_result.get(\"model_base64\", \"\")

                if not proto_base64 or not model_base64:
                    return {
                        \"success\": False,
                        \"format\": \"tnn\",
                        \"error\": \"TNN wasm bridge did not return .tnnproto/.tnnmodel artifacts\",
                        \"wasm_limitation\": True,
                    }

                proto_bytes = base64.b64decode(proto_base64)
                model_bytes = base64.b64decode(model_base64)

                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
                    zf.writestr('model.tnnproto', proto_bytes)
                    zf.writestr('model.tnnmodel', model_bytes)

                zip_bytes = zip_buffer.getvalue()

                return {
                    \"success\": True,
                    \"format\": \"tnn\",
                    \"filename\": \"model.tnn.zip\",
                    \"warning\": bridge_result.get(\"warning\"),
                    \"model_base64\": base64.b64encode(zip_bytes).decode('utf-8'),
                    \"model_size\": len(zip_bytes),
                }
            except Exception as e:
                return {
                    \"success\": False,
                    \"format\": \"tnn\",
                    \"error\": f\"TNN wasm bridge exception: {str(e)}\",
                    \"wasm_limitation\": True,
                }

        return self._unsupported(
            \"TNN converter WASM toolchain is not yet loaded.\",
            \"Build and load ONNX->TNN toolchain (convert2tnn.wasm) for Pyodide, then enable this adapter.\"
        )
"""


# === File: entry.py ===
__file_map__["entry.py"] = """\"\"\"
ONNX2Anything - Pyodide Entry Point

This module serves as the main entry point for the WASM converter running in Pyodide.
It provides a unified interface for model conversion, validation, and analysis.

Usage from JavaScript:
    await pyodide.runPythonAsync(`
        import entry
        result = entry.convert_model(buffer, 'tflite', options)
    `);
\"\"\"

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
    \"\"\"
    Logger that sends messages back to JavaScript via stdout.
    The worker captures these and forwards them as progress messages.
    \"\"\"

    def __init__(self, prefix=\"CONVERTER\"):
        self.prefix = prefix
        self.logs = []

    def log(self, level: str, message: str, stage: str = \"\", percent: int = 0):
        \"\"\"Log a message that will be captured by JS worker.\"\"\"
        entry = {
            \"level\": level,
            \"message\": message,
            \"stage\": stage,
            \"percent\": percent,
            \"prefix\": self.prefix
        }
        self.logs.append(entry)

        # Format for stdout capture
        log_line = f\"[PYLOG]{json.dumps(entry)}[/PYLOG]\"
        print(log_line, flush=True)

    def info(self, message: str, stage: str = \"\", percent: int = 0):
        self.log(\"INFO\", message, stage, percent)

    def warn(self, message: str, stage: str = \"\", percent: int = 0):
        self.log(\"WARN\", message, stage, percent)

    def error(self, message: str, stage: str = \"\", percent: int = 0):
        self.log(\"ERROR\", message, stage, percent)

    def debug(self, message: str, stage: str = \"\", percent: int = 0):
        self.log(\"DEBUG\", message, stage, percent)

    def get_logs(self) -> List[Dict]:
        return self.logs.copy()


def _ensure_directories():
    \"\"\"Ensure required directories exist.\"\"\"
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
    \"\"\"Get version information about the converter.\"\"\"
    return {
        \"converter_version\": \"0.1.0\",
        \"python_version\": sys.version,
        \"converters_available\": str(CONVERTERS_AVAILABLE),
        \"utils_available\": str(UTILS_AVAILABLE),
    }


def check_environment() -> Dict[str, Any]:
    \"\"\"
    Check the WASM environment and available dependencies.

    Returns:
        Dictionary with environment information
    \"\"\"
    result = {
        \"platform\": sys.platform,
        \"python_version\": sys.version,
        \"available_packages\": {},
        \"temp_dirs\": {},
    }

    # Check key packages
    packages = [
        \"onnx\", \"onnxsim\", \"numpy\", \"protobuf\",
        \"tensorflow\", \"onnx2tf\", \"torch\"
    ]

    for pkg in packages:
        try:
            mod = __import__(pkg)
            version = getattr(mod, \"__version__\", \"unknown\")
            result[\"available_packages\"][pkg] = {\"available\": True, \"version\": version}
        except ImportError:
            result[\"available_packages\"][pkg] = {\"available\": False}

    # Check temp directories
    _ensure_directories()
    for d in ['/tmp/onnx_convert', '/tmp/onnx_tflite', '/tmp/onnx_openvino']:
        result[\"temp_dirs\"][d] = os.path.exists(d)

    return result


def validate_model(model_buffer: Union[bytes, str],
                   is_base64: bool = False) -> str:
    \"\"\"
    Validate an ONNX model.

    Args:
        model_buffer: Model data as bytes or base64 string
        is_base64: Whether the buffer is base64 encoded

    Returns:
        JSON string with validation results
    \"\"\"
    logger = JSLogger(\"VALIDATOR\")
    logger.info(\"Starting model validation\", \"validating\", 0)

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

        logger.info(f\"Model written to {input_path}\", \"validating\", 10)

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
                \"success\": True,
                \"valid\": True,
                \"message\": \"Basic validation passed\"
            }

        # Cleanup
        try:
            os.remove(input_path)
        except:
            pass

        logger.info(\"Validation complete\", \"validating\", 100)
        return json.dumps(result)

    except Exception as e:
        error_result = {
            \"success\": False,
            \"valid\": False,
            \"error\": str(e)
        }
        logger.error(f\"Validation failed: {str(e)}\", \"validating\", 0)
        return json.dumps(error_result)


def simplify_model(model_buffer: Union[bytes, str],
                   is_base64: bool = False,
                   options: Optional[str] = None) -> str:
    \"\"\"
    Simplify an ONNX model using onnx-simplifier.

    Args:
        model_buffer: Model data as bytes or base64 string
        is_base64: Whether the buffer is base64 encoded
        options: JSON string with simplification options

    Returns:
        JSON string with results and simplified model (base64 encoded)
    \"\"\"
    logger = JSLogger(\"SIMPLIFIER\")
    logger.info(\"Starting model simplification\", \"simplifying\", 0)

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

        logger.info(\"Model loaded, starting simplification\", \"simplifying\", 20)

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
                \"success\": True,
                \"check_passed\": check,
                \"original_nodes\": original_nodes,
                \"simplified_nodes\": simplified_nodes,
                \"reduction\": original_nodes - simplified_nodes,
                \"reduction_percent\": (original_nodes - simplified_nodes) / original_nodes * 100 if original_nodes > 0 else 0
            }

        # Read output and encode
        if result.get(\"success\") and os.path.exists(output_path):
            with open(output_path, 'rb') as f:
                output_buffer = f.read()
            result[\"model_base64\"] = base64.b64encode(output_buffer).decode('utf-8')
            result[\"model_size\"] = len(output_buffer)

        # Cleanup
        for f in [input_path, output_path]:
            try:
                os.remove(f)
            except:
                pass

        logger.info(\"Simplification complete\", \"simplifying\", 100)
        return json.dumps(result)

    except Exception as e:
        error_result = {
            \"success\": False,
            \"error\": str(e)
        }
        logger.error(f\"Simplification failed: {str(e)}\", \"simplifying\", 0)
        return json.dumps(error_result)


def convert_model(model_buffer: Union[bytes, str],
                  target_format: str,
                  is_base64: bool = False,
                  options: Optional[str] = None) -> str:
    \"\"\"
    Convert an ONNX model to target format.

    Args:
        model_buffer: Model data as bytes or base64 string
        target_format: Target format ('tflite', 'openvino', 'ncnn', 'mnn', 'paddlelite', 'tnn')
        is_base64: Whether the buffer is base64 encoded
        options: JSON string with conversion options

    Returns:
        JSON string with results and converted model (base64 encoded)
    \"\"\"
    logger = JSLogger(\"CONVERTER\")
    logger.info(f\"Starting conversion to {target_format}\", \"converting\", 0)

    try:
        _ensure_directories()

        # Decode buffer
        if is_base64 and isinstance(model_buffer, str):
            model_buffer = base64.b64decode(model_buffer)
        elif isinstance(model_buffer, str):
            model_buffer = model_buffer.encode()

        # Parse options
        opts = json.loads(options) if options else {}
        logger.info(f\"Options: {opts}\", \"converting\", 5)

        quantization = opts.get(\"quantization\", \"none\")
        optimization = opts.get(\"optimization\", True)

        # Set up paths
        input_path = f'/tmp/onnx_convert/convert_input_{target_format}.onnx'
        simplified_path = f'/tmp/onnx_convert/convert_simplified_{target_format}.onnx'

        # Write input
        with open(input_path, 'wb') as f:
            f.write(model_buffer)

        logger.info(f\"Model written ({len(model_buffer)} bytes)\", \"converting\", 10)

        # Optionally simplify first
        model_to_convert = input_path
        if optimization:
            logger.info(\"Applying model simplification\", \"simplifying\", 20)
            try:
                if UTILS_AVAILABLE:
                    simplifier = ModelSimplifier(logger=logger)
                    simp_result = simplifier.simplify(input_path, simplified_path)
                    if simp_result.get(\"success\"):
                        model_to_convert = simplified_path
                        logger.info(\"Simplification successful\", \"simplifying\", 35)
                    else:
                        logger.warn(\"Simplification failed, using original model\", \"simplifying\", 35)
                else:
                    import onnx
                    from onnxsim import simplify
                    model = onnx.load(input_path)
                    model_simp, check = simplify(model)
                    if check:
                        onnx.save(model_simp, simplified_path)
                        model_to_convert = simplified_path
            except Exception as e:
                logger.warn(f\"Simplification error: {e}\", \"simplifying\", 35)

        # Perform conversion
        logger.info(f\"Converting to {target_format}\", \"converting\", 40)

        if target_format == \"tflite\":
            result = _convert_to_tflite(model_to_convert, opts, logger)
        elif target_format == \"openvino\":
            result = _convert_to_openvino(model_to_convert, opts, logger)
        elif target_format == \"ncnn\":
            result = _convert_to_ncnn(model_to_convert, opts, logger)
        elif target_format == \"mnn\":
            result = _convert_to_mnn(model_to_convert, opts, logger)
        elif target_format in (\"paddlelite\", \"paddle_lite\"):
            result = _convert_to_paddlelite(model_to_convert, opts, logger)
        elif target_format == \"tnn\":
            result = _convert_to_tnn(model_to_convert, opts, logger)
        elif target_format == \"tengine\":
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

        if result.get(\"success\"):
            logger.info(\"Conversion complete\", \"done\", 100)
        else:
            logger.error(f\"Conversion failed: {result.get('error')}\", \"error\", 0)

        return json.dumps(result)

    except Exception as e:
        error_result = {
            \"success\": False,
            \"error\": str(e)
        }
        logger.error(f\"Conversion failed: {str(e)}\", \"error\", 0)
        return json.dumps(error_result)


def convert_model_from_path(input_path: str,
                            target_format: str,
                            options: Optional[str] = None) -> str:
    \"\"\"
    Convert an ONNX model from an already-written filesystem path.

    This avoids serializing large models through Python source strings and is the
    preferred path for browser worker -> Pyodide conversions.
    \"\"\"
    logger = JSLogger(\"CONVERTER\")
    logger.info(f\"Starting conversion to {target_format}\", \"converting\", 0)

    try:
        _ensure_directories()

        if not os.path.exists(input_path):
            raise FileNotFoundError(f\"Input model path does not exist: {input_path}\")

        opts = json.loads(options) if options else {}
        logger.info(f\"Options: {opts}\", \"converting\", 5)

        optimization = opts.get(\"optimization\", True)
        simplified_path = f'/tmp/onnx_convert/convert_simplified_{target_format}.onnx'
        model_to_convert = input_path

        if optimization:
            logger.info(\"Applying model simplification\", \"simplifying\", 20)
            try:
                if UTILS_AVAILABLE:
                    simplifier = ModelSimplifier(logger=logger)
                    simp_result = simplifier.simplify(input_path, simplified_path)
                    if simp_result.get(\"success\"):
                        model_to_convert = simplified_path
                        logger.info(\"Simplification successful\", \"simplifying\", 35)
                    else:
                        logger.warn(\"Simplification failed, using original model\", \"simplifying\", 35)
                else:
                    import onnx
                    from onnxsim import simplify
                    model = onnx.load(input_path)
                    model_simp, check = simplify(model)
                    if check:
                        onnx.save(model_simp, simplified_path)
                        model_to_convert = simplified_path
            except Exception as e:
                logger.warn(f\"Simplification error: {e}\", \"simplifying\", 35)

        logger.info(f\"Converting to {target_format}\", \"converting\", 40)

        if target_format == \"tflite\":
            result = _convert_to_tflite(model_to_convert, opts, logger)
        elif target_format == \"openvino\":
            result = _convert_to_openvino(model_to_convert, opts, logger)
        elif target_format == \"ncnn\":
            result = _convert_to_ncnn(model_to_convert, opts, logger)
        elif target_format == \"mnn\":
            result = _convert_to_mnn(model_to_convert, opts, logger)
        elif target_format in (\"paddlelite\", \"paddle_lite\"):
            result = _convert_to_paddlelite(model_to_convert, opts, logger)
        elif target_format == \"tnn\":
            result = _convert_to_tnn(model_to_convert, opts, logger)
        elif target_format == \"tengine\":
            result = _convert_to_tengine(model_to_convert, opts, logger)
        else:
            result = {
                \"success\": False,
                \"error\": f\"Unsupported target format: {target_format}\"
            }

        if result.get(\"success\"):
            logger.info(\"Conversion complete\", \"done\", 100)
        else:
            logger.error(f\"Conversion failed: {result.get('error')}\", \"error\", 0)

        return json.dumps(result)
    except Exception as e:
        error_result = {
            \"success\": False,
            \"error\": str(e)
        }
        logger.error(f\"Conversion failed: {str(e)}\", \"error\", 0)
        return json.dumps(error_result)
    finally:
        for f in [simplified_path if 'simplified_path' in locals() else None]:
            try:
                if f and os.path.exists(f):
                    os.remove(f)
            except Exception:
                pass


def _convert_to_tflite(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    \"\"\"Internal TFLite conversion.\"\"\"
    output_path = '/tmp/onnx_tflite/output.tflite'

    try:
        if CONVERTERS_AVAILABLE:
            converter = TFLiteConverter(logger=logger)
            result = converter.convert(onnx_path, output_path, options)
        else:
            # Fallback - check if onnx2tf is available directly
            try:
                from onnx2tf import convert
                logger.info(\"Using onnx2tf directly\", \"converting\", 50)

                convert_opts = {
                    \"input_onnx_file_path\": onnx_path,
                    \"output_folder_path\": '/tmp/onnx_tflite',
                    \"output_tflite_file_path\": output_path,
                }

                if options.get(\"quantization\") == \"fp16\":
                    convert_opts[\"output_float16_quantized_tflite\"] = True

                convert(**convert_opts)

                result = {\"success\": True, \"method\": \"onnx2tf_direct\"}

            except ImportError:
                return {
                    \"success\": False,
                    \"error\": \"TFLite converter not available. Install onnx2tf or tensorflow.\",
                    \"wasm_limitation\": True
                }

        # Read output if successful
        if result.get(\"success\") and os.path.exists(output_path):
            with open(output_path, 'rb') as f:
                output_buffer = f.read()

            result[\"model_base64\"] = base64.b64encode(output_buffer).decode('utf-8')
            result[\"model_size\"] = len(output_buffer)
            result[\"format\"] = \"tflite\"
            result[\"filename\"] = \"model.tflite\"

            # Cleanup
            try:
                os.remove(output_path)
            except:
                pass

        return result

    except Exception as e:
        return {
            \"success\": False,
            \"error\": f\"TFLite conversion error: {str(e)}\"
        }


def _convert_to_openvino(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    \"\"\"Internal OpenVINO conversion.\"\"\"
    if not CONVERTERS_AVAILABLE:
        return {
            \"success\": False,
            \"error\": \"OpenVINO converter modules unavailable in WASM runtime.\",
            \"wasm_limitation\": True,
            \"format\": \"openvino\"
        }

    converter = OpenVINOConverter(logger=logger)
    return converter.convert(onnx_path, options)


def _convert_to_ncnn(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    \"\"\"Internal NCNN conversion.\"\"\"
    if not CONVERTERS_AVAILABLE:
        return {
            \"success\": False,
            \"error\": \"NCNN converter modules unavailable in WASM runtime.\",
            \"wasm_limitation\": True,
            \"format\": \"ncnn\"
        }

    converter = NCNNConverter(logger=logger)
    return converter.convert(onnx_path, options)


def _convert_to_mnn(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    \"\"\"Internal MNN conversion.\"\"\"
    if not CONVERTERS_AVAILABLE:
        return {
            \"success\": False,
            \"error\": \"MNN converter modules unavailable in WASM runtime.\",
            \"wasm_limitation\": True,
            \"format\": \"mnn\"
        }

    converter = MNNConverter(logger=logger)
    return converter.convert(onnx_path, options)


def _convert_to_paddlelite(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    \"\"\"Internal Paddle Lite conversion.\"\"\"
    if not CONVERTERS_AVAILABLE:
        return {
            \"success\": False,
            \"error\": \"Paddle Lite converter modules unavailable in WASM runtime.\",
            \"wasm_limitation\": True,
            \"format\": \"paddlelite\"
        }

    converter = PaddleLiteConverter(logger=logger)
    return converter.convert(onnx_path, options)


def _convert_to_tnn(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    \"\"\"Internal TNN conversion.\"\"\"
    if not CONVERTERS_AVAILABLE:
        return {
            \"success\": False,
            \"error\": \"TNN converter modules unavailable in WASM runtime.\",
            \"wasm_limitation\": True,
            \"format\": \"tnn\"
        }

    converter = TNNConverter(logger=logger)
    return converter.convert(onnx_path, options)


def _convert_to_tengine(onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    \"\"\"Internal Tengine conversion.\"\"\"
    if not CONVERTERS_AVAILABLE:
        return {
            \"success\": False,
            \"error\": \"Tengine converter modules unavailable in WASM runtime.\",
            \"wasm_limitation\": True,
            \"format\": \"tengine\"
        }

    converter = TengineConverter(logger=logger)
    return converter.convert(onnx_path, options)


def _convert_with_toolchain_bridge(target_format: str, onnx_path: str, options: Dict, logger: JSLogger) -> Dict:
    \"\"\"Generic bridge for dynamically registered JS/WASM toolchains.\"\"\"
    try:
        import wasm_toolchains  # type: ignore
    except Exception:
        return {
            \"success\": False,
            \"error\": f'Toolchain \"{target_format}\" is not available in current WASM runtime.',
            \"wasm_limitation\": True,
            \"format\": target_format
        }

    if not hasattr(wasm_toolchains, \"convert_with_toolchain\"):
        return {
            \"success\": False,
            \"error\": \"wasm_toolchains.convert_with_toolchain is not registered.\",
            \"wasm_limitation\": True,
            \"format\": target_format
        }

    try:
        with open(onnx_path, 'rb') as f:
            onnx_buffer = f.read()

        logger.info(f\"Using dynamic toolchain bridge for {target_format}\", \"converting\", 48)
        raw = wasm_toolchains.convert_with_toolchain(
            target_format,
            base64.b64encode(onnx_buffer).decode('utf-8'),
            json.dumps(options),
        )
        result = json.loads(raw)

        if result.get(\"success\"):
            result.setdefault(\"format\", target_format)
            result.setdefault(\"filename\", f\"model.{target_format}\")

        return result
    except Exception as e:
        return {
            \"success\": False,
            \"error\": f'{target_format} toolchain bridge error: {str(e)}',
            \"wasm_limitation\": True,
            \"format\": target_format
        }


def analyze_model(model_buffer: Union[bytes, str],
                  is_base64: bool = False) -> str:
    \"\"\"
    Perform detailed analysis of an ONNX model.

    Args:
        model_buffer: Model data as bytes or base64 string
        is_base64: Whether the buffer is base64 encoded

    Returns:
        JSON string with analysis results
    \"\"\"
    logger = JSLogger(\"ANALYZER\")
    logger.info(\"Starting model analysis\", \"analyzing\", 0)

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

        logger.info(\"Model loaded\", \"analyzing\", 20)

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
                \"success\": True,
                \"basic_info\": {
                    \"ir_version\": model.ir_version,
                    \"producer_name\": model.producer_name or \"Unknown\",
                    \"node_count\": len(model.graph.node),
                    \"operators\": dict(sorted(op_counts.items(), key=lambda x: x[1], reverse=True))
                }
            }

        # Estimate memory
        try:
            result[\"memory_estimate\"] = estimate_memory_usage(input_path)
        except:
            pass

        # Cleanup
        try:
            os.remove(input_path)
        except:
            pass

        logger.info(\"Analysis complete\", \"analyzing\", 100)
        return json.dumps(result)

    except Exception as e:
        error_result = {
            \"success\": False,
            \"error\": str(e)
        }
        logger.error(f\"Analysis failed: {str(e)}\", \"analyzing\", 0)
        return json.dumps(error_result)


def get_supported_formats() -> str:
    \"\"\"Get list of supported target formats.\"\"\"
    dynamic_formats = {}

    if CONVERTERS_AVAILABLE:
        try:
            converter_matrix = {
                \"openvino\": OpenVINOConverter(logger=_module_logger).describe_capability(),
                \"ncnn\": NCNNConverter(logger=_module_logger).describe_capability(),
                \"mnn\": MNNConverter(logger=_module_logger).describe_capability(),
                \"paddlelite\": PaddleLiteConverter(logger=_module_logger).describe_capability(),
                \"tnn\": TNNConverter(logger=_module_logger).describe_capability(),
                \"tengine\": TengineConverter(logger=_module_logger).describe_capability(),
            }
        except Exception:
            converter_matrix = {}
    else:
        converter_matrix = {}

    formats = {
        \"tflite\": {
            \"name\": \"TensorFlow Lite\",
            \"extension\": \".tflite\",
            \"wasm_supported\": True,
            \"quantization\": [\"none\", \"fp16\", \"int8\", \"dynamic\"],
            \"available\": True,
            \"artifacts\": [\"model.tflite\"],
        },
        \"openvino\": {
            \"name\": \"OpenVINO IR\",
            \"extension\": \".xml+.bin\",
            \"wasm_supported\": converter_matrix.get(\"openvino\", {}).get(\"wasm_supported\", False),
            \"quantization\": converter_matrix.get(\"openvino\", {}).get(\"quantization\", [\"none\", \"fp16\"]),
            \"available\": converter_matrix.get(\"openvino\", {}).get(\"available\", False),
            \"artifacts\": converter_matrix.get(\"openvino\", {}).get(\"artifacts\", [\"model.xml\", \"model.bin\"]),
            \"reason\": converter_matrix.get(\"openvino\", {}).get(\"reason\"),
        },
        \"ncnn\": {
            \"name\": \"NCNN\",
            \"extension\": \".param+.bin\",
            \"wasm_supported\": converter_matrix.get(\"ncnn\", {}).get(\"wasm_supported\", False),
            \"quantization\": converter_matrix.get(\"ncnn\", {}).get(\"quantization\", [\"none\", \"fp16\", \"int8\"]),
            \"available\": converter_matrix.get(\"ncnn\", {}).get(\"available\", False),
            \"artifacts\": converter_matrix.get(\"ncnn\", {}).get(\"artifacts\", [\"model.param\", \"model.bin\"]),
            \"reason\": converter_matrix.get(\"ncnn\", {}).get(\"reason\"),
        },
        \"mnn\": {
            \"name\": \"MNN\",
            \"extension\": \".mnn\",
            \"wasm_supported\": converter_matrix.get(\"mnn\", {}).get(\"wasm_supported\", False),
            \"quantization\": converter_matrix.get(\"mnn\", {}).get(\"quantization\", [\"none\", \"fp16\", \"int8\"]),
            \"available\": converter_matrix.get(\"mnn\", {}).get(\"available\", False),
            \"artifacts\": converter_matrix.get(\"mnn\", {}).get(\"artifacts\", [\"model.mnn\"]),
            \"reason\": converter_matrix.get(\"mnn\", {}).get(\"reason\"),
        },
        \"paddlelite\": {
            \"name\": \"Paddle Lite\",
            \"extension\": \".nb/model bundle\",
            \"wasm_supported\": converter_matrix.get(\"paddlelite\", {}).get(\"wasm_supported\", False),
            \"quantization\": converter_matrix.get(\"paddlelite\", {}).get(\"quantization\", [\"none\", \"fp16\", \"int8\"]),
            \"available\": converter_matrix.get(\"paddlelite\", {}).get(\"available\", False),
            \"artifacts\": converter_matrix.get(\"paddlelite\", {}).get(\"artifacts\", [\"model.nb\"]),
            \"reason\": converter_matrix.get(\"paddlelite\", {}).get(\"reason\"),
        },
        \"tnn\": {
            \"name\": \"TNN\",
            \"extension\": \".tnnproto+.tnnmodel\",
            \"wasm_supported\": converter_matrix.get(\"tnn\", {}).get(\"wasm_supported\", False),
            \"quantization\": converter_matrix.get(\"tnn\", {}).get(\"quantization\", [\"none\", \"fp16\"]),
            \"available\": converter_matrix.get(\"tnn\", {}).get(\"available\", False),
            \"artifacts\": converter_matrix.get(\"tnn\", {}).get(\"artifacts\", [\"model.tnnproto\", \"model.tnnmodel\"]),
            \"reason\": converter_matrix.get(\"tnn\", {}).get(\"reason\"),
        },
        \"tengine\": {
            \"name\": \"Tengine\",
            \"extension\": \".tmfile\",
            \"wasm_supported\": converter_matrix.get(\"tengine\", {}).get(\"wasm_supported\", False),
            \"quantization\": converter_matrix.get(\"tengine\", {}).get(\"quantization\", [\"none\"]),
            \"available\": converter_matrix.get(\"tengine\", {}).get(\"available\", False),
            \"artifacts\": converter_matrix.get(\"tengine\", {}).get(\"artifacts\", [\"model.tmfile\"]),
            \"reason\": converter_matrix.get(\"tengine\", {}).get(\"reason\"),
        }
    }
    return json.dumps(formats)


def convert_paddle_to_onnx(
    model_data_base64: str,
    params_data_base64: Optional[str] = None,
    opset_version: int = 13,
) -> str:
    \"\"\"
    Convert a PaddlePaddle model to ONNX format.

    This is a pre-processing step (input conversion) that runs *before* the
    normal ONNX → target-format pipeline.

    Args:
        model_data_base64: base64-encoded .pdmodel file.
        params_data_base64: base64-encoded .pdiparams file (optional).
        opset_version: ONNX opset version (default 13).

    Returns:
        JSON string with keys:
          success, onnx_base64, onnx_size, message  –– on success
          success, error, recommendation             –– on failure
    \"\"\"
    logger = JSLogger(\"PADDLE2ONNX\")
    logger.info(\"Starting PaddlePaddle → ONNX conversion\", \"paddle2onnx\", 0)

    try:
        from converters.paddle2onnx_converter import convert_paddle_to_onnx as _convert
        result_json = _convert(model_data_base64, params_data_base64, opset_version)
        result = json.loads(result_json)
        if result.get(\"success\"):
            logger.info(result.get(\"message\", \"Conversion complete\"), \"paddle2onnx\", 100)
        else:
            logger.error(result.get(\"error\", \"Conversion failed\"), \"paddle2onnx\", 0)
        return result_json
    except Exception as exc:
        import traceback
        error_result = {
            \"success\": False,
            \"error\": str(exc),
            \"traceback\": traceback.format_exc(),
        }
        logger.error(str(exc), \"paddle2onnx\", 0)
        return json.dumps(error_result)


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
    'convert_paddle_to_onnx',
    'JSLogger',
]
"""


# === File: utils/model_utils.py ===
__file_map__["utils/model_utils.py"] = """\"\"\"
Model Utilities for ONNX2Anything

This module provides utility functions for model validation, analysis,
and preprocessing. Designed to work in Pyodide (WASM) environment.
\"\"\"

import json
import os
import struct
import math
from typing import Dict, List, Tuple, Optional, Any, Union, BinaryIO
from io import BytesIO


class ModelValidator:
    \"\"\"
    ONNX model validator.

    Validates ONNX model structure, checks for common issues,
    and provides detailed model information.
    \"\"\"

    def __init__(self, logger=None):
        \"\"\"
        Initialize validator.

        Args:
            logger: Optional logger instance
        \"\"\"
        self.logger = logger

    def _log(self, level: str, message: str, stage: str = \"\", percent: int = 0):
        \"\"\"Log a message if logger is available.\"\"\"
        if self.logger:
            if hasattr(self.logger, 'log'):
                self.logger.log(level, message, stage, percent)
            elif hasattr(self.logger, 'info') and level == \"INFO\":
                self.logger.info(message, stage, percent)
            elif hasattr(self.logger, 'warn') and level == \"WARN\":
                self.logger.warn(message, stage, percent)
            elif hasattr(self.logger, 'error') and level == \"ERROR\":
                self.logger.error(message, stage, percent)

    def validate(self, model_path: str, check_shapes: bool = True) -> Dict[str, Any]:
        \"\"\"
        Validate an ONNX model.

        Args:
            model_path: Path to ONNX model file
            check_shapes: Whether to check shape information

        Returns:
            Validation results dictionary
        \"\"\"
        self._log(\"INFO\", f\"Starting validation of {model_path}\", \"validating\", 0)

        try:
            import onnx

            # Check file existence
            if not os.path.exists(model_path):
                return {
                    \"success\": False,
                    \"valid\": False,
                    \"error\": \"Model file not found\",
                    \"path\": model_path
                }

            # Check file size
            file_size = os.path.getsize(model_path)
            self._log(\"INFO\", f\"File size: {self._format_size(file_size)}\", \"validating\", 5)

            # Check magic number (ONNX files start with 0x08)
            with open(model_path, 'rb') as f:
                magic = f.read(4)
                if not magic or magic[0] != 0x08:
                    return {
                        \"success\": False,
                        \"valid\": False,
                        \"error\": \"File does not appear to be a valid ONNX model (wrong magic number)\",
                        \"path\": model_path
                    }

            # Load model
            self._log(\"INFO\", \"Loading ONNX model\", \"validating\", 10)
            try:
                model = onnx.load(model_path)
            except Exception as e:
                return {
                    \"success\": False,
                    \"valid\": False,
                    \"error\": f\"Failed to load model: {str(e)}\",
                    \"path\": model_path
                }

            # Basic structure validation
            if not model.graph:
                return {
                    \"success\": False,
                    \"valid\": False,
                    \"error\": \"Model has no graph\",
                    \"path\": model_path
                }

            # Check IR version
            ir_version = model.ir_version
            self._log(\"INFO\", f\"IR version: {ir_version}\", \"validating\", 15)

            # Check opset imports
            opset_imports = {}
            for imp in model.opset_import:
                domain = imp.domain if imp.domain else \"ai.onnx\"
                opset_imports[domain] = imp.version

            self._log(\"INFO\", f\"Opset imports: {opset_imports}\", \"validating\", 20)

            # Check inputs/outputs
            inputs = list(model.graph.input)
            outputs = list(model.graph.output)
            initializers = list(model.graph.initializer)

            if len(inputs) == 0:
                return {
                    \"success\": False,
                    \"valid\": False,
                    \"error\": \"Model has no inputs\",
                    \"path\": model_path
                }

            if len(outputs) == 0:
                return {
                    \"success\": False,
                    \"valid\": False,
                    \"error\": \"Model has no outputs\",
                    \"path\": model_path
                }

            self._log(\"INFO\", f\"Inputs: {len(inputs)}, Outputs: {len(outputs)}, Initializers: {len(initializers)}\",
                      \"validating\", 25)

            # Run ONNX checker
            self._log(\"INFO\", \"Running ONNX checker\", \"validating\", 30)
            try:
                onnx.checker.check_model(model)
                checker_passed = True
            except Exception as e:
                checker_passed = False
                checker_error = str(e)
                self._log(\"WARN\", f\"ONNX checker warning: {checker_error}\", \"validating\", 35)

            # Additional validations
            warnings = []
            errors = []

            # Check for large tensors
            for init in initializers:
                tensor_size = 1
                for dim in init.dims:
                    tensor_size *= dim

                # Warn if tensor is very large (> 100MB of floats)
                if tensor_size > 25 * 1024 * 1024:  # 25M floats ~ 100MB
                    warnings.append(f\"Large tensor '{init.name}': {tensor_size} elements\")

            # Check for dynamic shapes
            dynamic_inputs = []
            for inp in inputs:
                for dim in inp.type.tensor_type.shape.dim:
                    if dim.dim_param:
                        dynamic_inputs.append(inp.name)
                        break

            if dynamic_inputs:
                warnings.append(f\"Dynamic shapes detected in inputs: {dynamic_inputs}\")

            # Check for unsupported ops (basic check)
            unsupported_ops = self._check_unsupported_ops(model)
            if unsupported_ops:
                warnings.append(f\"Potentially unsupported ops: {unsupported_ops}\")

            # Shape inference check
            shape_info = {}
            if check_shapes:
                shape_info = self._check_shapes(model)

            # Compile results
            result = {
                \"success\": True,
                \"valid\": checker_passed,
                \"path\": model_path,
                \"file_size\": file_size,
                \"file_size_formatted\": self._format_size(file_size),
                \"ir_version\": ir_version,
                \"opset_imports\": opset_imports,
                \"graph\": {
                    \"node_count\": len(model.graph.node),
                    \"input_count\": len(inputs),
                    \"output_count\": len(outputs),
                    \"initializer_count\": len(initializers),
                    \"value_info_count\": len(model.graph.value_info),
                    \"sparse_initializer_count\": len(model.graph.sparse_initializer),
                },
                \"inputs\": [{\"name\": inp.name} for inp in inputs],
                \"outputs\": [{\"name\": out.name} for out in outputs],
                \"warnings\": warnings,
                \"shape_info\": shape_info,
            }

            if not checker_passed:
                result[\"checker_error\"] = checker_error

            self._log(\"INFO\", f\"Validation complete. Valid: {checker_passed}\", \"validating\", 100)
            return result

        except ImportError:
            return {
                \"success\": False,
                \"valid\": False,
                \"error\": \"ONNX library not available\",
                \"path\": model_path
            }
        except Exception as e:
            return {
                \"success\": False,
                \"valid\": False,
                \"error\": f\"Validation failed: {str(e)}\",
                \"path\": model_path
            }

    def _format_size(self, size_bytes: int) -> str:
        \"\"\"Format byte size to human readable string.\"\"\"
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024.0:
                return f\"{size_bytes:.2f} {unit}\"
            size_bytes /= 1024.0
        return f\"{size_bytes:.2f} TB\"

    def _check_unsupported_ops(self, model) -> List[str]:
        \"\"\"Check for potentially unsupported ops.\"\"\"
        # Ops that may cause issues in common converters
        potentially_problematic = {
            'Loop', 'If', 'Scan', 'Sequence', 'Optional',
            'Trilu', 'Unique', 'NonMaxSuppression',
        }

        found = []
        for node in model.graph.node:
            if node.op_type in potentially_problematic:
                found.append(node.op_type)

        return list(set(found))

    def _check_shapes(self, model) -> Dict[str, Any]:
        \"\"\"Check and collect shape information.\"\"\"
        shape_info = {
            \"inputs\": [],
            \"outputs\": [],
            \"has_dynamic_shapes\": False
        }

        for inp in model.graph.input:
            tensor_type = inp.type.tensor_type
            shape = []
            for dim in tensor_type.shape.dim:
                if dim.dim_value:
                    shape.append(dim.dim_value)
                elif dim.dim_param:
                    shape.append(f\"dynamic({dim.dim_param})\")
                    shape_info[\"has_dynamic_shapes\"] = True
                else:
                    shape.append(\"unknown\")

            shape_info[\"inputs\"].append({
                \"name\": inp.name,
                \"shape\": shape,
                \"dtype\": self._dtype_to_string(tensor_type.elem_type)
            })

        for out in model.graph.output:
            tensor_type = out.type.tensor_type
            shape = []
            for dim in tensor_type.shape.dim:
                if dim.dim_value:
                    shape.append(dim.dim_value)
                elif dim.dim_param:
                    shape.append(f\"dynamic({dim.dim_param})\")
                    shape_info[\"has_dynamic_shapes\"] = True
                else:
                    shape.append(\"unknown\")

            shape_info[\"outputs\"].append({
                \"name\": out.name,
                \"shape\": shape,
                \"dtype\": self._dtype_to_string(tensor_type.elem_type)
            })

        return shape_info

    def _dtype_to_string(self, dtype: int) -> str:
        \"\"\"Convert ONNX dtype to string.\"\"\"
        dtype_map = {
            0: \"UNDEFINED\", 1: \"FLOAT\", 2: \"UINT8\", 3: \"INT8\",
            4: \"UINT16\", 5: \"INT16\", 6: \"INT32\", 7: \"INT64\",
            8: \"STRING\", 9: \"BOOL\", 10: \"FLOAT16\", 11: \"DOUBLE\",
            12: \"UINT32\", 13: \"UINT64\", 14: \"COMPLEX64\", 15: \"COMPLEX128\",
            16: \"BFLOAT16\"
        }
        return dtype_map.get(dtype, f\"UNKNOWN({dtype})\")


class ModelSimplifier:
    \"\"\"
    ONNX model simplifier using onnx-simplifier.
    \"\"\"

    def __init__(self, logger=None):
        self.logger = logger

    def _log(self, level: str, message: str, stage: str = \"\", percent: int = 0):
        \"\"\"Log a message if logger is available.\"\"\"
        if self.logger:
            if hasattr(self.logger, 'log'):
                self.logger.log(level, message, stage, percent)
            elif hasattr(self.logger, 'info') and level == \"INFO\":
                self.logger.info(message, stage, percent)

    def simplify(self,
                 input_path: str,
                 output_path: str,
                 options: Optional[Dict] = None) -> Dict[str, Any]:
        \"\"\"
        Simplify an ONNX model.

        Args:
            input_path: Path to input ONNX model
            output_path: Path for output simplified model
            options: Simplification options
                - skip_optimization: Skip optimization passes
                - skip_shape_inference: Skip shape inference
                - overwrite_input_shapes: Dict of input name to shape
                - skipped_optimizers: List of optimizers to skip

        Returns:
            Simplification results
        \"\"\"
        options = options or {}

        self._log(\"INFO\", \"Starting model simplification\", \"simplifying\", 0)

        try:
            import onnx
            from onnxsim import simplify

            # Load model
            self._log(\"INFO\", \"Loading model\", \"simplifying\", 10)
            model = onnx.load(input_path)

            original_node_count = len(model.graph.node)
            self._log(\"INFO\", f\"Original model: {original_node_count} nodes\", \"simplifying\", 20)

            # Build simplify options
            simplify_opts = {
                \"perform_optimization\": not options.get(\"skip_optimization\", False),
                \"skip_shape_inference\": options.get(\"skip_shape_inference\", False),
            }

            if options.get(\"overwrite_input_shapes\"):
                simplify_opts[\"overwrite_input_shapes\"] = options[\"overwrite_input_shapes\"]

            if options.get(\"skipped_optimizers\"):
                simplify_opts[\"skipped_optimizers\"] = options[\"skipped_optimizers\"]

            # Run simplification
            self._log(\"INFO\", \"Running simplifier\", \"simplifying\", 40)
            model_simp, check = simplify(model, **simplify_opts)

            simplified_node_count = len(model_simp.graph.node)
            reduction = original_node_count - simplified_node_count
            reduction_pct = (reduction / original_node_count * 100) if original_node_count > 0 else 0

            self._log(\"INFO\", f\"Simplified: {original_node_count} -> {simplified_node_count} nodes \"
                      f\"({reduction_pct:.1f}% reduction)\", \"simplifying\", 80)

            # Save result
            self._log(\"INFO\", \"Saving simplified model\", \"simplifying\", 90)
            onnx.save(model_simp, output_path)

            result = {
                \"success\": True,
                \"check_passed\": check,
                \"original_nodes\": original_node_count,
                \"simplified_nodes\": simplified_node_count,
                \"reduction\": reduction,
                \"reduction_percent\": reduction_pct,
                \"output_path\": output_path
            }

            if not check:
                result[\"warning\"] = \"Simplification check failed - model may have issues\"
                self._log(\"WARN\", \"Simplification validation check failed\", \"simplifying\", 95)

            self._log(\"INFO\", \"Simplification complete\", \"simplifying\", 100)
            return result

        except ImportError as e:
            return {
                \"success\": False,
                \"error\": f\"Required library not available: {str(e)}\"
            }
        except Exception as e:
            return {
                \"success\": False,
                \"error\": f\"Simplification failed: {str(e)}\"
            }


class ModelAnalyzer:
    \"\"\"
    ONNX model analyzer for detailed inspection.
    \"\"\"

    def __init__(self, logger=None):
        self.logger = logger

    def analyze(self, model_path: str) -> Dict[str, Any]:
        \"\"\"
        Perform comprehensive model analysis.

        Args:
            model_path: Path to ONNX model

        Returns:
            Analysis results
        \"\"\"
        try:
            import onnx

            model = onnx.load(model_path)

            # Basic info
            analysis = {
                \"success\": True,
                \"model_info\": {
                    \"ir_version\": model.ir_version,
                    \"producer_name\": model.producer_name or \"Unknown\",
                    \"producer_version\": model.producer_version or \"Unknown\",
                    \"doc_string\": model.doc_string or \"\",
                    \"domain\": model.domain or \"\",
                    \"model_version\": model.model_version,
                },
                \"opset\": [
                    {\"domain\": imp.domain or \"ai.onnx\", \"version\": imp.version}
                    for imp in model.opset_import
                ],
            }

            # Graph analysis
            graph = model.graph
            analysis[\"graph\"] = {
                \"name\": graph.name or \"\",
                \"node_count\": len(graph.node),
                \"input_count\": len(graph.input),
                \"output_count\": len(graph.output),
                \"initializer_count\": len(graph.initializer),
                \"sparse_initializer_count\": len(graph.sparse_initializer),
                \"value_info_count\": len(graph.value_info),
            }

            # Operator statistics
            op_counts = {}
            for node in graph.node:
                op_counts[node.op_type] = op_counts.get(node.op_type, 0) + 1

            analysis[\"operators\"] = {
                \"unique_count\": len(op_counts),
                \"total_count\": sum(op_counts.values()),
                \"counts\": dict(sorted(op_counts.items(), key=lambda x: x[1], reverse=True))
            }

            # Parameter count
            total_params = 0
            param_details = []

            for init in graph.initializer:
                size = 1
                for dim in init.dims:
                    size *= dim
                total_params += size

                param_details.append({
                    \"name\": init.name,
                    \"shape\": list(init.dims),
                    \"size\": size,
                    \"dtype\": self._dtype_to_string(init.data_type)
                })

            analysis[\"parameters\"] = {
                \"total_count\": total_params,
                \"initializer_count\": len(graph.initializer),
                \"largest_initializers\": sorted(param_details, key=lambda x: x[\"size\"], reverse=True)[:10]
            }

            # Input/Output details
            analysis[\"inputs\"] = []
            for inp in graph.input:
                tensor_type = inp.type.tensor_type
                shape = []
                for dim in tensor_type.shape.dim:
                    if dim.dim_value:
                        shape.append(dim.dim_value)
                    elif dim.dim_param:
                        shape.append(f\"dynamic:{dim.dim_param}\")
                    else:
                        shape.append(\"?\")

                analysis[\"inputs\"].append({
                    \"name\": inp.name,
                    \"shape\": shape,
                    \"dtype\": self._dtype_to_string(tensor_type.elem_type)
                })

            analysis[\"outputs\"] = []
            for out in graph.output:
                tensor_type = out.type.tensor_type
                shape = []
                for dim in tensor_type.shape.dim:
                    if dim.dim_value:
                        shape.append(dim.dim_value)
                    elif dim.dim_param:
                        shape.append(f\"dynamic:{dim.dim_param}\")
                    else:
                        shape.append(\"?\")

                analysis[\"outputs\"].append({
                    \"name\": out.name,
                    \"shape\": shape,
                    \"dtype\": self._dtype_to_string(tensor_type.elem_type)
                })

            return analysis

        except Exception as e:
            return {
                \"success\": False,
                \"error\": str(e)
            }

    def _dtype_to_string(self, dtype: int) -> str:
        \"\"\"Convert ONNX dtype to string.\"\"\"
        dtype_map = {
            0: \"UNDEFINED\", 1: \"FLOAT\", 2: \"UINT8\", 3: \"INT8\",
            4: \"UINT16\", 5: \"INT16\", 6: \"INT32\", 7: \"INT64\",
            8: \"STRING\", 9: \"BOOL\", 10: \"FLOAT16\", 11: \"DOUBLE\",
            12: \"UINT32\", 13: \"UINT64\", 14: \"COMPLEX64\", 15: \"COMPLEX128\",
            16: \"BFLOAT16\"
        }
        return dtype_map.get(dtype, f\"UNKNOWN({dtype})\")


class ProgressTracker:
    \"\"\"
    Tracks conversion progress and reports via callback.
    \"\"\"

    def __init__(self, callback=None):
        \"\"\"
        Initialize progress tracker.

        Args:
            callback: Function to call with progress updates (stage, percent, message)
        \"\"\"
        self.callback = callback
        self.stages = {}
        self.current_stage = None

    def start_stage(self, stage: str, message: str = \"\"):
        \"\"\"Start a new processing stage.\"\"\"
        self.current_stage = stage
        self.stages[stage] = {
            \"start_percent\": self._get_stage_start_percent(stage),
            \"end_percent\": self._get_stage_end_percent(stage),
            \"message\": message
        }

        if self.callback:
            self.callback(stage, self.stages[stage][\"start_percent\"], message)

    def update(self, percent_in_stage: float, message: str = \"\"):
        \"\"\"Update progress within current stage.\"\"\"
        if self.current_stage and self.current_stage in self.stages:
            stage_info = self.stages[self.current_stage]
            total_percent = int(stage_info[\"start_percent\"] +
                               (stage_info[\"end_percent\"] - stage_info[\"start_percent\"]) *
                               (percent_in_stage / 100.0))

            if self.callback:
                self.callback(self.current_stage, total_percent,
                             message or stage_info[\"message\"])

    def end_stage(self, message: str = \"\"):
        \"\"\"End current stage.\"\"\"
        if self.current_stage and self.current_stage in self.stages:
            stage_info = self.stages[self.current_stage]

            if self.callback:
                self.callback(self.current_stage, stage_info[\"end_percent\"],
                             message or f\"{self.current_stage} complete\")

    def _get_stage_start_percent(self, stage: str) -> int:
        \"\"\"Get starting percent for a stage.\"\"\"
        stage_order = {
            \"loading\": 0,
            \"validating\": 5,
            \"analyzing\": 10,
            \"simplifying\": 20,
            \"converting\": 40,
            \"quantizing\": 75,
            \"finalizing\": 90,
            \"done\": 100
        }
        return stage_order.get(stage, 0)

    def _get_stage_end_percent(self, stage: str) -> int:
        \"\"\"Get ending percent for a stage.\"\"\"
        stage_order = {
            \"loading\": 5,
            \"validating\": 10,
            \"analyzing\": 20,
            \"simplifying\": 40,
            \"converting\": 75,
            \"quantizing\": 90,
            \"finalizing\": 100,
            \"done\": 100
        }
        return stage_order.get(stage, 100)


def estimate_memory_usage(model_path: str) -> Dict[str, Any]:
    \"\"\"
    Estimate memory requirements for processing a model.

    Args:
        model_path: Path to model file

    Returns:
        Memory estimation results
    \"\"\"
    try:
        file_size = os.path.getsize(model_path)

        # Rough estimates based on typical memory patterns
        estimates = {
            \"file_size\": file_size,
            \"file_size_formatted\": _format_bytes(file_size),
            \"loading_memory\": file_size * 3,  # ~3x for loaded model
            \"simplification_memory\": file_size * 5,  # ~5x during simplification
            \"conversion_memory\": file_size * 8,  # ~8x during conversion
            \"peak_memory\": file_size * 10,  # ~10x peak
        }

        # Format all sizes
        for key in list(estimates.keys()):
            if key.endswith(\"_memory\"):
                estimates[key + \"_formatted\"] = _format_bytes(estimates[key])

        # WASM considerations
        estimates[\"wasm_feasible\"] = estimates[\"peak_memory\"] < 2 * 1024 * 1024 * 1024  # 2GB
        estimates[\"recommendations\"] = []

        if not estimates[\"wasm_feasible\"]:
            estimates[\"recommendations\"].append(
                \"Model may be too large for browser-based conversion. \"
                \"Consider server-side conversion or model pruning.\"
            )

        return estimates

    except Exception as e:
        return {
            \"error\": str(e)
        }


def _format_bytes(size_bytes: int) -> str:
    \"\"\"Format bytes to human readable string.\"\"\"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f\"{size_bytes:.2f} {unit}\"
        size_bytes /= 1024.0
    return f\"{size_bytes:.2f} TB\"


def validate_input_shapes(model_path: str, input_shapes: Dict[str, List[int]]) -> Dict[str, Any]:
    \"\"\"
    Validate input shapes against model requirements.

    Args:
        model_path: Path to ONNX model
        input_shapes: Proposed input shapes

    Returns:
        Validation results
    \"\"\"
    try:
        import onnx

        model = onnx.load(model_path)

        results = {
            \"success\": True,
            \"valid\": True,
            \"inputs\": [],
            \"errors\": [],
            \"warnings\": []
        }

        input_dict = {inp.name: inp for inp in model.graph.input}

        for name, shape in input_shapes.items():
            if name not in input_dict:
                results[\"errors\"].append(f\"Input '{name}' not found in model\")
                results[\"valid\"] = False
                continue

            inp = input_dict[name]
            tensor_type = inp.type.tensor_type
            model_shape = []

            for dim in tensor_type.shape.dim:
                if dim.dim_value:
                    model_shape.append(dim.dim_value)
                elif dim.dim_param:
                    model_shape.append(f\"dynamic({dim.dim_param})\")
                else:
                    model_shape.append(None)

            # Check rank
            if len(shape) != len(model_shape):
                results[\"errors\"].append(
                    f\"Input '{name}' rank mismatch: model expects {len(model_shape)}, got {len(shape)}\"
                )
                results[\"valid\"] = False
                continue

            # Check dimensions
            for i, (model_dim, provided_dim) in enumerate(zip(model_shape, shape)):
                if model_dim is None or (isinstance(model_dim, str) and model_dim.startswith(\"dynamic\")):
                    # Dynamic dimension - any value is valid
                    continue

                if model_dim != provided_dim:
                    results[\"warnings\"].append(
                        f\"Input '{name}' dimension {i}: model expects {model_dim}, got {provided_dim}\"
                    )

            results[\"inputs\"].append({
                \"name\": name,
                \"model_shape\": model_shape,
                \"provided_shape\": shape
            })

        return results

    except Exception as e:
        return {
            \"success\": False,
            \"valid\": False,
            \"error\": str(e)
        }
"""


def install_package():
    """Install all Python files to Pyodide virtual filesystem."""
    import os
    import sys

    base_path = '/lib/python3.11/site-packages/onnx2anything'
    os.makedirs(base_path, exist_ok=True)

    for path, content in __file_map__.items():
        full_path = os.path.join(base_path, path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w') as f:
            f.write(content)

    # Add to path
    if base_path not in sys.path:
        sys.path.insert(0, base_path)

    return base_path

# Auto-install on import
install_package()
