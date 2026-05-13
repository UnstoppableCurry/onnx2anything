import os
import io
import json
import base64
import zipfile
from typing import Any, Dict, Optional

from .base import BaseEdgeConverter


class TNNConverter(BaseEdgeConverter):
    format_name = "tnn"
    output_files = ("model.tnnproto", "model.tnnmodel")
    quantization_modes = ("none", "fp16")
    wasm_toolchain_key = "tnnConvert"
    archive_output = True

    def __init__(self, logger=None):
        super().__init__(logger=logger)
        self.temp_dir = '/tmp/onnx_tnn'
        os.makedirs(self.temp_dir, exist_ok=True)

    def _check_dependencies(self) -> Dict[str, bool]:
        deps = {
            "wasm_toolchains": False,
        }
        try:
            import wasm_toolchains  # type: ignore
            deps["wasm_toolchains"] = True
        except Exception:
            deps["wasm_toolchains"] = False
        return deps

    def convert(self, onnx_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._log("INFO", "Starting TNN conversion", "converting", 40)
        options = options or {}
        deps = self._check_dependencies()

        if deps.get("wasm_toolchains"):
            try:
                import wasm_toolchains  # type: ignore

                with open(onnx_path, 'rb') as f:
                    onnx_buffer = f.read()

                raw = wasm_toolchains.tnn_wasm_convert(
                    base64.b64encode(onnx_buffer).decode('utf-8'),
                    json.dumps(options),
                )
                bridge_result = json.loads(raw)

                if not bridge_result.get("success"):
                    return {
                        "success": False,
                        "format": "tnn",
                        "error": bridge_result.get("error", "TNN wasm bridge failed"),
                        "wasm_limitation": True,
                    }

                proto_base64 = bridge_result.get("proto_base64", "")
                model_base64 = bridge_result.get("model_base64", "")

                if not proto_base64 or not model_base64:
                    return {
                        "success": False,
                        "format": "tnn",
                        "error": "TNN wasm bridge did not return .tnnproto/.tnnmodel artifacts",
                        "wasm_limitation": True,
                    }

                proto_bytes = base64.b64decode(proto_base64)
                model_bytes = base64.b64decode(model_base64)

                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
                    zf.writestr('model.tnnproto', proto_bytes)
                    zf.writestr('model.tnnmodel', model_bytes)

                zip_bytes = zip_buffer.getvalue()

                return {
                    "success": True,
                    "format": "tnn",
                    "filename": "model.tnn.zip",
                    "warning": bridge_result.get("warning"),
                    "model_base64": base64.b64encode(zip_bytes).decode('utf-8'),
                    "model_size": len(zip_bytes),
                }
            except Exception as e:
                return {
                    "success": False,
                    "format": "tnn",
                    "error": f"TNN wasm bridge exception: {str(e)}",
                    "wasm_limitation": True,
                }

        return self._unsupported(
            "TNN converter WASM toolchain is not yet loaded.",
            "Build and load ONNX->TNN toolchain (convert2tnn.wasm) for Pyodide, then enable this adapter."
        )
