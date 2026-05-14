import os
import json
import base64
from typing import Any, Dict, Optional

from .base import BaseEdgeConverter


class TengineConverter(BaseEdgeConverter):
    format_name = "tengine"
    output_files = ("model.tmfile",)
    quantization_modes = ("none",)
    wasm_toolchain_key = "tengineConvert"
    archive_output = False

    def __init__(self, logger=None):
        super().__init__(logger=logger)
        self.temp_dir = '/tmp/onnx_tengine'
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
        self._log("INFO", "Starting Tengine conversion", "converting", 40)
        options = options or {}
        deps = self._check_dependencies()

        if deps.get("wasm_toolchains"):
            try:
                import wasm_toolchains  # type: ignore

                with open(onnx_path, 'rb') as f:
                    onnx_buffer = f.read()

                raw = wasm_toolchains.tengine_wasm_convert(
                    base64.b64encode(onnx_buffer).decode('utf-8'),
                    json.dumps(options),
                )
                bridge_result = json.loads(raw)

                if not bridge_result.get("success"):
                    return {
                        "success": False,
                        "format": "tengine",
                        "error": bridge_result.get("error", "Tengine wasm bridge failed"),
                        "wasm_limitation": True,
                    }

                output_base64 = bridge_result.get("output_base64", "")
                if not output_base64:
                    return {
                        "success": False,
                        "format": "tengine",
                        "error": "Tengine wasm bridge did not return .tmfile artifact",
                        "wasm_limitation": True,
                    }

                output_bytes = base64.b64decode(output_base64)

                return {
                    "success": True,
                    "format": "tengine",
                    "filename": "model.tmfile",
                    "warning": bridge_result.get("warning"),
                    "model_base64": base64.b64encode(output_bytes).decode('utf-8'),
                    "model_size": len(output_bytes),
                }
            except Exception as e:
                return {
                    "success": False,
                    "format": "tengine",
                    "error": f"Tengine wasm bridge exception: {str(e)}",
                    "wasm_limitation": True,
                }

        return self._unsupported(
            "Tengine converter WASM toolchain is not yet loaded.",
            "Build and load ONNX->Tengine toolchain (TengineConvert.wasm) for Pyodide, then enable this adapter."
        )
