import os
import io
import json
import base64
import zipfile
from typing import Any, Dict, Optional

from .base import BaseEdgeConverter


class NCNNConverter(BaseEdgeConverter):
    format_name = "ncnn"
    output_files = ("model.param", "model.bin")
    quantization_modes = ("none", "fp16", "int8")
    wasm_toolchain_key = "ncnnConvert"
    archive_output = True

    def __init__(self, logger=None):
        super().__init__(logger=logger)
        self.temp_dir = '/tmp/onnx_ncnn'
        os.makedirs(self.temp_dir, exist_ok=True)

    def _check_dependencies(self) -> Dict[str, bool]:
        deps = {
            "onnx": False,
            "ncnn": False,
            "wasm_toolchains": False,
        }
        for dep in ["onnx", "ncnn"]:
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
        self._log("INFO", "Starting NCNN conversion", "converting", 40)
        options = options or {}
        deps = self._check_dependencies()

        if deps.get("wasm_toolchains"):
            try:
                import wasm_toolchains  # type: ignore

                with open(onnx_path, 'rb') as f:
                    onnx_buffer = f.read()

                raw = wasm_toolchains.ncnn_wasm_convert(
                    base64.b64encode(onnx_buffer).decode('utf-8'),
                    json.dumps(options),
                )
                bridge_result = json.loads(raw)

                if not bridge_result.get("success"):
                    return {
                        "success": False,
                        "format": "ncnn",
                        "error": bridge_result.get("error", "NCNN wasm bridge failed"),
                        "wasm_limitation": True,
                    }

                param_base64 = bridge_result.get("param_base64", "")
                bin_base64 = bridge_result.get("bin_base64", "")

                if not param_base64 or not bin_base64:
                    return {
                        "success": False,
                        "format": "ncnn",
                        "error": "NCNN wasm bridge did not return .param/.bin artifacts",
                        "wasm_limitation": True,
                    }

                param_bytes = base64.b64decode(param_base64)
                bin_bytes = base64.b64decode(bin_base64)

                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
                    zf.writestr('model.param', param_bytes)
                    zf.writestr('model.bin', bin_bytes)

                zip_bytes = zip_buffer.getvalue()

                return {
                    "success": True,
                    "format": "ncnn",
                    "filename": "model.ncnn.zip",
                    "warning": bridge_result.get("warning"),
                    "model_base64": base64.b64encode(zip_bytes).decode('utf-8'),
                    "model_size": len(zip_bytes),
                }
            except Exception as e:
                return {
                    "success": False,
                    "format": "ncnn",
                    "error": f"NCNN wasm bridge exception: {str(e)}",
                    "wasm_limitation": True,
                }

        if deps.get("ncnn"):
            return self._unsupported(
                "NCNN runtime found but converter binding is not wired in current WASM build.",
                "Integrate wasm ncnn conversion binary or Python binding entrypoint and retry."
            )

        return self._unsupported(
            "NCNN converter is not available in current WASM environment.",
            "Build and load ONNX->NCNN toolchain for Pyodide, then enable this adapter."
        )
