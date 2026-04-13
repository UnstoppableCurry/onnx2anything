import os
import io
import json
import base64
import shutil
import tempfile
import zipfile
from typing import Any, Dict, Optional

from .base import BaseEdgeConverter


class OpenVINOConverter(BaseEdgeConverter):
    format_name = "openvino"
    output_files = ("model.xml", "model.bin")
    quantization_modes = ("none", "fp16")
    wasm_toolchain_key = "openvinoConvert"
    archive_output = True
    native_supported = True

    def __init__(self, logger=None):
        super().__init__(logger=logger)
        self.temp_dir = '/tmp/onnx_openvino'
        os.makedirs(self.temp_dir, exist_ok=True)

    def _check_dependencies(self) -> Dict[str, bool]:
        deps = {
            "onnx": False,
            "openvino": False,
            "wasm_toolchains": False,
        }
        for dep in ["onnx", "openvino"]:
            try:
                __import__(dep)
                deps[dep] = True
            except ImportError:
                pass
        try:
            import wasm_toolchains  # type: ignore
            deps["wasm_toolchains"] = True
        except Exception:
            deps["wasm_toolchains"] = False
        return deps

    def convert(self, onnx_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._log("INFO", "Starting OpenVINO conversion", "converting", 40)
        options = options or {}
        deps = self._check_dependencies()
        quantization = str(options.get("quantization", "none")).lower()

        if deps.get("wasm_toolchains"):
            try:
                import wasm_toolchains  # type: ignore

                with open(onnx_path, 'rb') as f:
                    onnx_buffer = f.read()

                raw = wasm_toolchains.openvino_wasm_convert(
                    base64.b64encode(onnx_buffer).decode('utf-8'),
                    json.dumps(options),
                )
                bridge_result = json.loads(raw)

                if not bridge_result.get("success"):
                    return {
                        "success": False,
                        "format": "openvino",
                        "error": bridge_result.get("error", "OpenVINO wasm bridge failed"),
                        "wasm_limitation": True,
                    }

                output_base64 = bridge_result.get("output_base64", "")
                output_filename = bridge_result.get("output_filename") or "model.openvino.zip"

                if not output_base64:
                    return {
                        "success": False,
                        "format": "openvino",
                        "error": "OpenVINO wasm bridge did not return output payload",
                        "wasm_limitation": True,
                    }

                output_bytes = base64.b64decode(output_base64)

                if output_filename.endswith('.zip'):
                    payload = output_bytes
                else:
                    zip_buffer = io.BytesIO()
                    with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
                        zf.writestr(output_filename, output_bytes)
                    payload = zip_buffer.getvalue()
                    output_filename = "model.openvino.zip"

                return {
                    "success": True,
                    "format": "openvino",
                    "filename": output_filename,
                    "warning": bridge_result.get("warning"),
                    "model_base64": base64.b64encode(payload).decode('utf-8'),
                    "model_size": len(payload),
                }
            except Exception as e:
                return {
                    "success": False,
                    "format": "openvino",
                    "error": f"OpenVINO wasm bridge exception: {str(e)}",
                    "wasm_limitation": True,
                }

        if quantization == "int8":
            return {
                "success": False,
                "format": "openvino",
                "error": (
                    "OpenVINO int8 export is not supported in this workflow. "
                    "It requires a separate PTQ pipeline such as NNCF."
                ),
                "recommendation": (
                    "Use quantization='none' or 'fp16', or run a dedicated PTQ pipeline."
                ),
            }

        if quantization not in self.quantization_modes:
            return {
                "success": False,
                "format": "openvino",
                "error": f"Unsupported OpenVINO quantization mode: {quantization}",
                "recommendation": "Use quantization='none' or 'fp16'.",
            }

        if deps.get("openvino"):
            return self._convert_with_openvino_runtime(onnx_path, quantization)

        return self._unsupported(
            "OpenVINO converter is not available in current WASM environment.",
            "Use the native OpenVINO Python package or register wasm_toolchains.openvino_wasm_convert from a real OpenVINO WASM converter toolchain."
        )

    def _convert_with_openvino_runtime(self, onnx_path: str, quantization: str) -> Dict[str, Any]:
        try:
            import openvino as ov
        except Exception as e:
            return {
                "success": False,
                "format": "openvino",
                "error": f"Failed to import OpenVINO runtime: {str(e)}",
            }

        work_root = tempfile.mkdtemp(prefix=".openvino-native-", dir=self.temp_dir)
        xml_path = os.path.join(work_root, "model.xml")
        bin_path = os.path.join(work_root, "model.bin")

        try:
            self._log("INFO", "Using native OpenVINO Python API", "converting", 50)
            model = ov.convert_model(onnx_path)
            ov.save_model(
                model,
                xml_path,
                compress_to_fp16=(quantization == "fp16"),
            )

            if not os.path.exists(xml_path) or not os.path.exists(bin_path):
                return {
                    "success": False,
                    "format": "openvino",
                    "error": "OpenVINO conversion did not produce model.xml/model.bin",
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
                "success": True,
                "format": "openvino",
                "filename": "model.openvino.zip",
                "model_base64": base64.b64encode(payload).decode('utf-8'),
                "model_size": len(payload),
                "xml_size": len(xml_bytes),
                "bin_size": len(bin_bytes),
                "quantization": quantization,
                "method": "openvino_python_api",
            }
        except Exception as e:
            return {
                "success": False,
                "format": "openvino",
                "error": f"OpenVINO native conversion failed: {str(e)}",
            }
        finally:
            shutil.rmtree(work_root, ignore_errors=True)
