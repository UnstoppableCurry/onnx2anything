"""
PaddlePaddle → ONNX converter (runs in Pyodide via micropip).

paddle2onnx >= 1.0 can perform static-graph export without running
inference, so it does not require the full paddlepaddle runtime.
However, its current PyPI release (2.x) pulls in `polygraphy` which
is unlikely to be available in Pyodide.  The converter implements
graceful degradation: it tries to install & use paddle2onnx, and
returns a clear error when the package cannot be loaded so the UI can
surface an actionable message instead of a raw traceback.
"""

import base64
import json
import os
from typing import Optional

PADDLE2ONNX_NOT_AVAILABLE_REASON = (
    "paddle2onnx 当前无法在浏览器 (Pyodide) 环境中安装，"
    "因为其依赖项 polygraphy 尚未提供 WASM 兼容的 wheel。"
    "请使用本地 Python 环境或 Docker 容器执行 paddle2onnx 转换。"
)

PADDLE2ONNX_NOT_AVAILABLE_RECOMMENDATION = (
    "在本地安装: pip install paddle2onnx\n"
    "然后运行: paddle2onnx --model_dir <dir> --model_filename model.pdmodel "
    "--params_filename model.pdiparams --save_file output.onnx --opset_version 13"
)


def convert_paddle_to_onnx(
    model_data_base64: str,
    params_data_base64: Optional[str] = None,
    opset_version: int = 13,
) -> str:
    """
    Convert a PaddlePaddle model to ONNX format.

    Args:
        model_data_base64: base64-encoded .pdmodel file content.
        params_data_base64: base64-encoded .pdiparams file content (optional).
        opset_version: ONNX opset version to target (default 13).

    Returns:
        JSON string with keys:
          success (bool), onnx_base64 (str), message (str), error (str)
    """
    logger_lines = []

    def _log(msg: str) -> None:
        logger_lines.append(msg)
        print(f"[PADDLE2ONNX] {msg}", flush=True)

    _log("开始 PaddlePaddle → ONNX 转换")

    # ------------------------------------------------------------------ #
    # Step 1: attempt to install paddle2onnx via micropip
    # ------------------------------------------------------------------ #
    try:
        import micropip  # type: ignore  # available in Pyodide
        import asyncio

        _log("尝试安装 paddle2onnx …")
        asyncio.get_event_loop().run_until_complete(
            micropip.install("paddle2onnx")
        )
        _log("paddle2onnx 安装成功")
    except ImportError:
        # Not in Pyodide – micropip unavailable; try direct import below
        _log("micropip 不可用，尝试直接导入 paddle2onnx …")
    except Exception as install_err:
        return json.dumps(
            {
                "success": False,
                "error": PADDLE2ONNX_NOT_AVAILABLE_REASON,
                "recommendation": PADDLE2ONNX_NOT_AVAILABLE_RECOMMENDATION,
                "install_error": str(install_err),
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
                "success": False,
                "error": PADDLE2ONNX_NOT_AVAILABLE_REASON,
                "recommendation": PADDLE2ONNX_NOT_AVAILABLE_RECOMMENDATION,
                "import_error": str(imp_err),
            }
        )

    # ------------------------------------------------------------------ #
    # Step 3: write model bytes to the Pyodide virtual filesystem
    # ------------------------------------------------------------------ #
    try:
        model_bytes = base64.b64decode(model_data_base64)
    except Exception as decode_err:
        return json.dumps(
            {"success": False, "error": f"无法解码 model_data_base64: {decode_err}"}
        )

    work_dir = "/tmp/paddle2onnx_work"
    os.makedirs(work_dir, exist_ok=True)

    model_path = os.path.join(work_dir, "model.pdmodel")
    with open(model_path, "wb") as fh:
        fh.write(model_bytes)
    _log(f"写入模型文件: {model_path} ({len(model_bytes)} bytes)")

    params_filename: Optional[str] = None
    if params_data_base64:
        try:
            params_bytes = base64.b64decode(params_data_base64)
        except Exception as decode_err:
            return json.dumps(
                {
                    "success": False,
                    "error": f"无法解码 params_data_base64: {decode_err}",
                }
            )
        params_path = os.path.join(work_dir, "model.pdiparams")
        with open(params_path, "wb") as fh:
            fh.write(params_bytes)
        params_filename = "model.pdiparams"
        _log(f"写入参数文件: {params_path} ({len(params_bytes)} bytes)")

    # ------------------------------------------------------------------ #
    # Step 4: convert
    # ------------------------------------------------------------------ #
    onnx_path = os.path.join(work_dir, "output.onnx")

    try:
        paddle2onnx.export(
            model_dir=work_dir,
            model_filename="model.pdmodel",
            params_filename=params_filename,
            save_file=onnx_path,
            opset_version=opset_version,
            enable_onnx_checker=True,
        )
    except Exception as conv_err:
        import traceback

        return json.dumps(
            {
                "success": False,
                "error": f"paddle2onnx 转换失败: {conv_err}",
                "traceback": traceback.format_exc(),
            }
        )

    if not os.path.exists(onnx_path):
        return json.dumps(
            {"success": False, "error": "paddle2onnx 未生成输出文件"}
        )

    with open(onnx_path, "rb") as fh:
        onnx_bytes = fh.read()

    _log(f"转换成功，ONNX 大小: {len(onnx_bytes)} bytes")

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
            "success": True,
            "onnx_base64": base64.b64encode(onnx_bytes).decode("utf-8"),
            "onnx_size": len(onnx_bytes),
            "message": f"PaddlePaddle → ONNX 转换成功 ({len(onnx_bytes)} bytes)",
            "logs": logger_lines,
        }
    )
