#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Building wasm-converter package from source..."
npm --prefix "$PROJECT_ROOT/packages/wasm-converter" run build
