import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  ensureCommandSuccess,
  quoteShell,
  runDockerExec,
} from './lib/native-toolchain-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const containerName =
  process.env.PADDLELITE_NATIVE_CONTAINER || 'onnx2anything-toolchain-builder';
const containerVenv =
  process.env.PADDLELITE_NATIVE_VENV || '/tmp/paddlelite-p26-venv';
const modelArg =
  process.argv[2] || 'apps/web/public/verify/generated/add_const.onnx';
const modelPath = path.resolve(projectRoot, modelArg);
const workspaceModelPath = `/workspace/${path
  .relative(projectRoot, modelPath)
  .split(path.sep)
  .join('/')}`;

const pythonProbe = `
import contextlib
import importlib
import importlib.util
import io
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

model_path = Path(${JSON.stringify(workspaceModelPath)})
if not model_path.exists():
    raise SystemExit(json.dumps({
        "success": False,
        "error": f"Probe model was not found: {model_path}",
    }, ensure_ascii=False))

mods = {}
for name in ["x2paddle", "x2paddle.convert", "paddle", "paddlelite", "onnx"]:
    spec = importlib.util.find_spec(name)
    mods[name] = {
        "found": spec is not None,
        "origin": getattr(spec, "origin", None) if spec else None,
    }

blocked_probe = subprocess.run(
    [
        sys.executable,
        "-c",
        """
import importlib.abc
import sys

class BlockPaddle(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path, target=None):
        if fullname == 'paddle' or fullname.startswith('paddle.'):
            raise ModuleNotFoundError(f'blocked {fullname}')
        return None

sys.meta_path.insert(0, BlockPaddle())
try:
    import x2paddle.convert  # noqa: F401
    print('unexpected-success')
except Exception as exc:
    print(type(exc).__name__ + ': ' + str(exc))
""",
    ],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    check=False,
)
blocked_error = blocked_probe.stdout.strip()

from x2paddle.convert import onnx2paddle

work_dir = Path(tempfile.mkdtemp(prefix="paddlelite-front-half-probe-"))
out_dir = work_dir / "out"
out_dir.mkdir(parents=True, exist_ok=True)
conversion_logs = io.StringIO()
try:
    with contextlib.redirect_stdout(conversion_logs), contextlib.redirect_stderr(conversion_logs):
        onnx2paddle(
            str(model_path),
            str(out_dir),
            enable_onnx_checker=False,
            disable_feedback=True,
        )
    generated_files = sorted(
        str(path.relative_to(out_dir))
        for path in out_dir.rglob("*")
        if path.is_file()
    )
    result = {
        "success": True,
        "container_name": ${JSON.stringify(containerName)},
        "container_venv": ${JSON.stringify(containerVenv)},
        "model_path": str(model_path),
        "imports": mods,
        "blocked_paddle_import": {
            "success": blocked_error != "unexpected-success",
            "error": blocked_error,
        },
        "x2paddle_conversion": {
            "generated_files": generated_files,
            "generated_inference_model": (
                "inference_model/model.pdmodel" in generated_files
                and "inference_model/model.pdiparams" in generated_files
            ),
            "logs_tail": conversion_logs.getvalue().splitlines()[-20:],
        },
        "conclusion": (
            "Current Paddle Lite browser work is still blocked at the ONNX -> Paddle front-half: "
            "x2paddle imports paddle at import time and uses paddle to export inference_model; "
            "the existing wasm artifacts only cover the opt back-half."
        ),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
finally:
    shutil.rmtree(work_dir, ignore_errors=True)
`;

const probeResult = runDockerExec({
  containerName,
  command:
    `VENV=${quoteShell(containerVenv)}; ` +
    `"${containerVenv}/bin/python" - <<'PY'\n${pythonProbe}\nPY`,
  encoding: 'utf8',
});

ensureCommandSuccess(
  probeResult,
  'paddlelite front-half dependency probe',
  'Paddle Lite probe'
);

if (probeResult.stdout) {
  process.stdout.write(probeResult.stdout);
}
