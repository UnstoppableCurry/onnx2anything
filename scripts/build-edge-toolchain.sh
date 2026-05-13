#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PUBLIC_TOOLCHAIN_ROOT="$PROJECT_ROOT/apps/web/public/toolchains"
NCNN_SOURCE_ROOT="$PROJECT_ROOT/third_party/ncnn/build-wasm/tools"
CONTAINER_NAME="${TOOLCHAIN_CONTAINER_NAME:-wasm-builder}"
TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: scripts/build-edge-toolchain.sh <ncnn|mnn|openvino|paddlelite|tnn>"
  exit 1
fi

mkdir -p "$PUBLIC_TOOLCHAIN_ROOT/ncnn"
mkdir -p "$PUBLIC_TOOLCHAIN_ROOT/modules"

sync_ncnn_artifacts() {
  if [ -d "$NCNN_SOURCE_ROOT" ]; then
    echo "Syncing existing NCNN wasm helper artifacts..."
    for file in ncnnoptimize.js ncnnoptimize.wasm ncnn2mem.js ncnn2mem.wasm ncnnmerge.js ncnnmerge.wasm; do
      if [ -f "$NCNN_SOURCE_ROOT/$file" ]; then
        cp "$NCNN_SOURCE_ROOT/$file" "$PUBLIC_TOOLCHAIN_ROOT/ncnn/$file"
      fi
    done
  fi
}

try_build_ncnn_onnx() {
  if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    echo "Container $CONTAINER_NAME is not running; skipping live NCNN build."
    return 0
  fi

  echo "Attempting ONNX->NCNN wasm build inside $CONTAINER_NAME ..."
  set +e
  docker exec "$CONTAINER_NAME" bash /workspace/scripts/build-ncnn-toolchain-inside-container.sh
  build_status=$?
  set -e

  if [ $build_status -eq 0 ]; then
    echo "NCNN onnx2ncnn build completed."
  else
    echo "NCNN onnx2ncnn build did not complete. Manifest will keep NCNN as build-required."
  fi
}

case "$TARGET" in
  ncnn)
    sync_ncnn_artifacts
    try_build_ncnn_onnx
    ;;
  mnn)
    set +e
    docker exec "$CONTAINER_NAME" bash /workspace/scripts/build-mnn-toolchain-inside-container.sh
    build_status=$?
    set -e
    if [ $build_status -eq 0 ]; then
      echo "MNN browser toolchain build completed."
    else
      echo "MNN browser toolchain build did not complete. Manifest will keep MNN as build-required."
    fi
    ;;
  openvino)
    set +e
    docker exec "$CONTAINER_NAME" bash /workspace/scripts/build-openvino-toolchain-inside-container.sh
    build_status=$?
    set -e
    if [ $build_status -eq 0 ]; then
      echo "OpenVINO browser toolchain build completed."
    else
      echo "OpenVINO browser toolchain build did not complete. Manifest will keep OpenVINO as build-required."
    fi
    ;;
  paddlelite)
    set +e
    docker exec "$CONTAINER_NAME" bash /workspace/scripts/build-paddlelite-toolchain-inside-container.sh
    build_status=$?
    set -e
    if [ $build_status -eq 0 ]; then
      echo "Paddle Lite wasm opt back-half artifacts built."
      echo "Manifest will remain build-required until ONNX -> Paddle front-half is solved and .browser-ready is created."
    else
      echo "Paddle Lite browser toolchain build did not complete. Manifest will keep Paddle Lite as build-required."
    fi
    ;;
  tnn)
    set +e
    docker exec "$CONTAINER_NAME" bash /workspace/scripts/build-tnn-toolchain-inside-container.sh
    build_status=$?
    set -e
    if [ $build_status -eq 0 ]; then
      echo "TNN browser toolchain build completed."
    else
      echo "TNN browser toolchain build did not complete. Manifest will keep TNN as build-required."
    fi
    ;;
  *)
    echo "Unknown target: $TARGET"
    echo "Usage: scripts/build-edge-toolchain.sh <ncnn|mnn|openvino|paddlelite|tnn>"
    exit 1
    ;;
esac

node "$PROJECT_ROOT/scripts/generate-toolchain-manifest.mjs"

echo "Toolchain assets synchronized under $PUBLIC_TOOLCHAIN_ROOT"
