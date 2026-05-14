import base64
import json
import os
from typing import Any, Dict, Optional

from .base import BaseEdgeConverter


class PaddleLiteConverter(BaseEdgeConverter):
    format_name = "paddlelite"
    output_files = ("model.nb",)
    quantization_modes = ("none", "fp16", "int8")
    wasm_toolchain_key = "paddleliteConvert"
    archive_output = True

    def __init__(self, logger=None):
        super().__init__(logger=logger)
        self.temp_dir = '/tmp/onnx_paddlelite'
        os.makedirs(self.temp_dir, exist_ok=True)

    def _check_dependencies(self) -> Dict[str, bool]:
        deps = {
            "onnx": False,
            "wasm_toolchains": False,
        }
        try:
            __import__("onnx")
            deps["onnx"] = True
        except ImportError:
            pass
        try:
            import wasm_toolchains  # type: ignore
            deps["wasm_toolchains"] = True
        except Exception:
            pass
        return deps

    def describe_capability(self) -> Dict[str, Any]:
        deps = self._check_dependencies()
        capability = super().describe_capability()
        capability["available"] = bool(deps.get("wasm_toolchains"))
        capability["wasm_supported"] = bool(deps.get("wasm_toolchains"))
        if not capability["available"]:
            capability["reason"] = (
                "Paddle Lite WASM toolchain is not loaded in this runtime."
            )
        return capability

    def convert(self, onnx_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._log("INFO", "Starting Paddle Lite WASM conversion", "converting", 40)
        options = options or {}
        deps = self._check_dependencies()

        if not deps.get("wasm_toolchains"):
            return self._unsupported(
                "Paddle Lite WASM toolchain is not loaded in this runtime.",
                "Ensure the Paddle Lite opt WASM module is available in the browser environment.",
            )

        try:
            import wasm_toolchains  # type: ignore

            with open(onnx_path, "rb") as f:
                onnx_bytes = f.read()
            onnx_b64 = base64.b64encode(onnx_bytes).decode("ascii")

            options_json = json.dumps(options)
            raw = wasm_toolchains.paddlelite_wasm_convert(onnx_b64, options_json)
            result = json.loads(raw)

            if not result.get("success"):
                return result

            nb_b64 = result.get("output_base64", "")
            nb_bytes = base64.b64decode(nb_b64)

            out_path = os.path.join(self.temp_dir, "model.nb")
            with open(out_path, "wb") as f:
                f.write(nb_bytes)

            self._log("INFO", "Paddle Lite conversion complete", "done", 100)

            return {
                "success": True,
                "format": self.format_name,
                "files": [out_path],
                "model_base64": base64.b64encode(nb_bytes).decode("ascii"),
                "model_size": len(nb_bytes),
                "filename": "model.nb",
            }

        except Exception as exc:
            self._log("ERROR", f"Paddle Lite conversion failed: {exc}", "error", 0)
            return {
                "success": False,
                "format": self.format_name,
                "error": str(exc),
            }
