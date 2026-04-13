#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

REQUIRED_MODULES=(onnxruntime ncnn numpy protobuf)
RUNNER_PYTHON="${ONNX_NCNN_COMPARE_PYTHON:-}"

PYTHON_BIN="${PYTHON_COMPARE_BIN:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  if command -v python3.12 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3.12)"
  elif [[ -x "$HOME/.local/bin/python3.12" ]]; then
    PYTHON_BIN="$HOME/.local/bin/python3.12"
  else
    PYTHON_BIN="$(command -v python3)"
  fi
fi

VENV_DIR="${ONNX_NCNN_COMPARE_VENV:-/tmp/onnx-ncnn-compare}"

has_modules() {
  local python_exec="$1"
  shift

  "$python_exec" - "$@" <<'PY' >/dev/null
import importlib
import sys

missing = []
for name in sys.argv[1:]:
    module_name = "google.protobuf" if name == "protobuf" else name
    try:
        importlib.import_module(module_name)
    except Exception:
        missing.append(name)

if missing:
    print(",".join(missing))
    raise SystemExit(1)
PY
}

ensure_venv() {
  if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    "$PYTHON_BIN" -m venv "$VENV_DIR"
  fi
}

install_requirements() {
  local pip_exec="$1"
  "$pip_exec" install -U pip >/dev/null
  "$pip_exec" install "${REQUIRED_MODULES[@]}" >/dev/null
}

if [[ -n "$RUNNER_PYTHON" ]]; then
  if ! has_modules "$RUNNER_PYTHON" "${REQUIRED_MODULES[@]}"; then
    echo "Configured ONNX_NCNN_COMPARE_PYTHON is missing required modules: ${REQUIRED_MODULES[*]}" >&2
    exit 1
  fi
else
  ensure_venv
  RUNNER_PYTHON="$VENV_DIR/bin/python"

  if ! has_modules "$RUNNER_PYTHON" "${REQUIRED_MODULES[@]}"; then
    if [[ "${ONNX_NCNN_COMPARE_SKIP_INSTALL:-0}" == "1" ]]; then
      echo "Missing required modules in $RUNNER_PYTHON and ONNX_NCNN_COMPARE_SKIP_INSTALL=1." >&2
      exit 1
    fi

    if ! install_requirements "$VENV_DIR/bin/pip"; then
      echo "Failed to install required modules for ONNX/NCNN comparison." >&2
      echo "Reuse an existing environment with ONNX_NCNN_COMPARE_PYTHON=/path/to/python or preinstall: ${REQUIRED_MODULES[*]}" >&2
      exit 1
    fi
  fi
fi

RUNNER_BIN_DIR="$(cd "$(dirname "$RUNNER_PYTHON")" && pwd)"
export PATH="$RUNNER_BIN_DIR:$PATH"

"$RUNNER_PYTHON" "$PROJECT_ROOT/scripts/compare_onnx_ncnn.py"
