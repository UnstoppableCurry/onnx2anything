#!/bin/bash

set -euo pipefail

SRC_ROOT="/workspace/third_party/Paddle-Lite"
BUILD_DIR="${PADDLELITE_WASM_BUILD_DIR:-$SRC_ROOT/build-wasm-opt-probe}"
PUBLIC_DIR="/workspace/apps/web/public/toolchains/paddlelite"
TOOLCHAIN_FILE="/usr/share/emscripten/cmake/Modules/Platform/Emscripten.cmake"

mkdir -p "$PUBLIC_DIR"

configure_if_needed() {
  if [ -f "$BUILD_DIR/CMakeCache.txt" ]; then
    echo "Reusing existing Paddle Lite wasm build dir: $BUILD_DIR"
    return
  fi

  echo "Configuring Paddle Lite wasm opt build in $BUILD_DIR ..."
  rm -rf "$BUILD_DIR"
  cmake -S "$SRC_ROOT" -B "$BUILD_DIR" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN_FILE" \
    -DEMSCRIPTEN_FORCE_COMPILERS=ON \
    -DLITE_ON_MODEL_OPTIMIZE_TOOL=ON \
    -DLITE_BUILD_EXTRA=ON \
    -DLITE_BUILD_TAILOR=OFF \
    -DLITE_WITH_LOG=ON \
    -DLITE_WITH_LIGHT_WEIGHT_FRAMEWORK=OFF \
    -DLITE_WITH_X86=OFF \
    -DLITE_WITH_ARM=OFF \
    -DLITE_WITH_OPENCL=OFF \
    -DLITE_WITH_METAL=OFF \
    -DLITE_WITH_XPU=OFF \
    -DLITE_WITH_NNADAPTER=OFF \
    -DLITE_WITH_OPENMP=OFF \
    -DLITE_WITH_CV=OFF \
    -DLITE_WITH_JAVA=OFF \
    -DLITE_WITH_STATIC_LIB=OFF \
    -DLITE_WITH_PYTHON=OFF \
    -DLITE_WITH_TRAIN=OFF \
    -DWITH_TESTING=OFF \
    -DWITH_MKL=OFF \
    -DWITH_AVX=OFF \
    -DWITH_ARM_DOTPROD=OFF \
    -DWITH_NODE_RAW_FS=OFF
}

build_opt() {
  echo "Building Paddle Lite wasm opt ..."
  cmake --build "$BUILD_DIR" --target opt -- -j"$(nproc)"
}

sync_artifacts() {
  local js_src="$BUILD_DIR/lite/api/opt.js"
  local wasm_src="$BUILD_DIR/lite/api/opt.wasm"

  if [ ! -f "$js_src" ] || [ ! -f "$wasm_src" ]; then
    echo "Missing expected Paddle Lite wasm artifacts:"
    echo "  $js_src"
    echo "  $wasm_src"
    return 1
  fi

  cp "$js_src" "$PUBLIC_DIR/paddle_lite_opt.js"
  cp "$wasm_src" "$PUBLIC_DIR/paddle_lite_opt.wasm"
  rm -f "$PUBLIC_DIR/.browser-ready"
}

configure_if_needed
build_opt
sync_artifacts

echo "Paddle Lite wasm back-half artifacts are now present:"
echo "  /workspace/apps/web/public/toolchains/paddlelite/paddle_lite_opt.js"
echo "  /workspace/apps/web/public/toolchains/paddlelite/paddle_lite_opt.wasm"
echo "Remaining blockers (still true, so no .browser-ready marker is written):"
echo "  1. These artifacts only cover Paddle inference model -> .nb (the opt back-half)."
echo "  2. Browser-side ONNX -> PaddleLite still needs x2paddle + paddle for the ONNX -> Paddle front-half."
echo "  3. The low-level wasm runtime can now be wrapped/loaded, but the user-facing ONNX -> PaddleLite browser path remains intentionally disabled until the front-half exists."
