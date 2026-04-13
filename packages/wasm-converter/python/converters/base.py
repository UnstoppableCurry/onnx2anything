from typing import Any, Dict, Iterable, Optional


class BaseEdgeConverter:
    """Shared base converter behavior for edge format adapters."""

    format_name = "unknown"
    output_files = ()
    quantization_modes: Iterable[str] = ("none",)
    wasm_toolchain_key: Optional[str] = None
    archive_output = False
    native_supported = False

    def __init__(self, logger=None):
        self.logger = logger

    def _log(self, level: str, message: str, stage: str = "", percent: int = 0):
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
        has_wasm_bridge = bool(self.wasm_toolchain_key and deps.get("wasm_toolchains"))
        has_native_backend = self.native_supported and any(
            key != "wasm_toolchains" and value for key, value in deps.items()
        )
        has_non_wasm_deps = any(
            key != "wasm_toolchains" and value for key, value in deps.items()
        )

        available = has_wasm_bridge or has_native_backend

        reason = None
        if not available:
            if has_non_wasm_deps:
                reason = (
                    f"{self.format_name} runtime libraries are present, but no active conversion backend "
                    "is wired for this runtime."
                )
            else:
                reason = (
                    f"{self.format_name} converter is unavailable in the current browser toolchain."
                )

        return {
            "format": self.format_name,
            "available": available,
            "wasm_supported": has_wasm_bridge,
            "quantization": list(self.quantization_modes),
            "artifacts": list(self.output_files),
            "archive_output": self.archive_output,
            "reason": reason,
            "dependencies": deps,
        }

    def _unsupported(self, reason: str, recommendation: str) -> Dict[str, Any]:
        return {
            "success": False,
            "format": self.format_name,
            "wasm_limitation": True,
            "error": reason,
            "recommendation": recommendation,
        }
