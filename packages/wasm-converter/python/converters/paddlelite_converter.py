import os
from typing import Any, Dict, Optional

from .base import BaseEdgeConverter


BACK_HALF_ONLY_REASON = (
    "Paddle Lite 浏览器链路当前只有 back-half：现有 WASM 仅覆盖 "
    "Paddle inference model -> .nb；前半段 ONNX -> Paddle 仍依赖 "
    "x2paddle + paddle Python 运行时。"
)

BACK_HALF_ONLY_RECOMMENDATION = (
    "继续使用 native/container export。不要把 `paddle_lite_opt.js/.wasm` "
    "误判成完整的 ONNX -> Paddle Lite 浏览器转换链路。"
)

NATIVE_EXPORT_ONLY_REASON = (
    "已检测到 x2paddle + paddle Python 运行时，但当前这个 Python converter "
    "并未内嵌 Paddle Lite native opt 后半段。"
)

NATIVE_EXPORT_ONLY_RECOMMENDATION = (
    "请改走 `node scripts/export-paddlelite-artifacts-native.mjs "
    "<modelPath> <outPath>` 或容器内 native export。"
)


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
            "x2paddle": False,
            "paddle": False,
            "wasm_toolchains": False,
        }
        for dep in ["onnx", "x2paddle", "paddle"]:
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

    @staticmethod
    def _has_front_half_runtime(deps: Dict[str, bool]) -> bool:
        return bool(deps.get("x2paddle") and deps.get("paddle"))

    def describe_capability(self) -> Dict[str, Any]:
        deps = self._check_dependencies()
        capability = super().describe_capability()

        if deps.get("wasm_toolchains"):
            capability.update(
                {
                    "available": False,
                    "wasm_supported": False,
                    "reason": BACK_HALF_ONLY_REASON,
                    "backend_stage": "back-half-only",
                    "dependencies": deps,
                }
            )
            return capability

        if self._has_front_half_runtime(deps):
            capability.update(
                {
                    "available": False,
                    "wasm_supported": False,
                    "reason": NATIVE_EXPORT_ONLY_REASON,
                    "backend_stage": "native-export-only",
                    "dependencies": deps,
                }
            )
            return capability

        return capability

    def convert(self, onnx_path: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._log("INFO", "Starting Paddle Lite conversion", "converting", 40)
        options = options or {}
        deps = self._check_dependencies()

        if deps.get("wasm_toolchains"):
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
            "Paddle Lite converter is not available in current WASM environment.",
            "Current front-half still requires x2paddle + paddle Python runtime; continue with native/container export."
        )
