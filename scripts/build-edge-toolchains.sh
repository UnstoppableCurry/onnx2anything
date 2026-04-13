#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

targets=(ncnn mnn openvino paddlelite)

for target in "${targets[@]}"; do
  bash "$SCRIPT_DIR/build-edge-toolchain.sh" "$target"
done
