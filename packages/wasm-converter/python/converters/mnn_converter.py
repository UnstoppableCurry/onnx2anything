import os
import io
import json
import base64
import zipfile
from typing import Any, Dict, Optional

from .base import BaseEdgeConverter


class MNNConverter(BaseEdgeConverter):
    format_name = "mnn"
    output_files = ("model.mnn",)
    quantization_modes = ("none", "fp16", "int8")
    wasm_toolchain_key = "mnnConvert"
    archive_output = True

    def __init__(self, logger=None):
        super().__init__(logger=logger)
        self.temp_dir = '/tmp/onnx_mnn'
        os.makedirs(self.temp_dir, exist_ok=True)

    def _check_dependencies(self) -> Dict[str, bool]:
        deps = {
            "onnx": False,
            "MNN": False,
            "wasm_toolchains": False,
        }
        for dep in ["onnx", "MNN"]:
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
        self._log("INFO", "Starting MNN conversion", "converting", 40)
        options = options or {}
        deps = self._check_dependencies()

        if deps.get("wasm_toolchains"):
            try:
                import wasm_toolchains  # type: ignore

                with open(onnx_path, 'rb') as f:
                    onnx_buffer = f.read()

                raw = wasm_toolchains.mnn_wasm_convert(
                    base64.b64encode(onnx_buffer).decode('utf-8'),
                    json.dumps(options),
                )
                bridge_result = json.loads(raw)

                if not bridge_result.get("success"):
                    return {
                        "success": False,
                        "format": "mnn",
                        "error": bridge_result.get("error", "MNN wasm bridge failed"),
                        "wasm_limitation": True,
                    }

                output_base64 = bridge_result.get("output_base64", "")
                output_filename = bridge_result.get("output_filename") or "model.mnn"

                if not output_base64:
                    return {
                        "success": False,
                        "format": "mnn",
                        "error": "MNN wasm bridge did not return output model",
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
                    output_filename = "model.mnn.zip"

                return {
                    "success": True,
                    "format": "mnn",
                    "filename": output_filename,
                    "warning": bridge_result.get("warning"),
                    "model_base64": base64.b64encode(payload).decode('utf-8'),
                    "model_size": len(payload),
                }
            except Exception as e:
                return {
                    "success": False,
                    "format": "mnn",
                    "error": f"MNN wasm bridge exception: {str(e)}",
                    "wasm_limitation": True,
                }

        return self._unsupported(
            "MNN converter is not available in current WASM environment.",
            "Register wasm_toolchains.mnn_wasm_convert from a real MNN WASM converter toolchain."
        )
