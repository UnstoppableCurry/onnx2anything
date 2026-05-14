#!/bin/bash
# Build Tengine convert_tool as a WASM module using Emscripten.
# Run this script inside the Lima VM:
#   LIMA_HOME=/Volumes/ThunderSSD/lima limactl shell convert-wasm-builder -- bash /workspace/scripts/build-tengine-toolchain-inside-container.sh
#
# Output:
#   /workspace/apps/web/public/toolchains/tengine/TengineConvert.js
#   /workspace/apps/web/public/toolchains/tengine/TengineConvert.wasm

set -euo pipefail

TENGINE_ROOT="/workspace/third_party/Tengine"
OUTPUT_DIR="/workspace/apps/web/public/toolchains/tengine"
CACHE_DIR="/workspace/.cache-src"
BUILD_DIR="$TENGINE_ROOT/build-wasm-converter"

mkdir -p "$OUTPUT_DIR"
mkdir -p "$CACHE_DIR"

if [ ! -d "$TENGINE_ROOT" ]; then
  echo "Tengine source not found at $TENGINE_ROOT"
  echo "Please vendor Tengine source first:"
  echo "  git clone --depth=1 --branch tengine-lite https://github.com/OAID/Tengine.git third_party/Tengine"
  exit 1
fi

echo "=== Building Tengine convert_tool WASM toolchain ==="
echo "Tengine source: $TENGINE_ROOT"
echo "Output:         $OUTPUT_DIR"

# Ensure native protoc is available
if ! command -v protoc &>/dev/null; then
  echo "ERROR: native protoc not found. Install with: sudo apt-get install -y protobuf-compiler"
  exit 1
fi
echo "System protoc: $(protoc --version)"

# Build protobuf-lite for WASM (reuse cache from TNN/NCNN builds if present)
PROTOBUF_SRC="$CACHE_DIR/protobuf-21.12"
PROTOBUF_BUILD="$PROTOBUF_SRC/build-wasm-lite"
PROTOBUF_NATIVE_BUILD="$PROTOBUF_SRC/build-native"

if [ ! -d "$PROTOBUF_SRC" ]; then
  echo "Downloading protobuf 21.12..."
  python3 - <<'PY'
from pathlib import Path
from urllib.request import urlopen
import tarfile

cache_root = Path('/workspace/.cache-src')
archive = cache_root / 'protobuf-v21.12.tar.gz'
if not archive.exists():
    url = 'https://github.com/protocolbuffers/protobuf/archive/refs/tags/v21.12.tar.gz'
    with urlopen(url) as response:
        archive.write_bytes(response.read())

with tarfile.open(archive) as tar:
    tar.extractall(cache_root, filter="data")
print("Extracted protobuf-21.12")
PY
fi

if [ ! -f "$PROTOBUF_NATIVE_BUILD/protoc" ]; then
  echo "Building native protoc 21.12 (must match WASM library version)..."
  mkdir -p "$PROTOBUF_NATIVE_BUILD"
  cd "$PROTOBUF_NATIVE_BUILD"
  cmake -G Ninja \
    -Dprotobuf_BUILD_TESTS=OFF \
    -Dprotobuf_BUILD_SHARED_LIBS=OFF \
    -Dprotobuf_BUILD_PROTOC_BINARIES=ON \
    -Dprotobuf_BUILD_LIBPROTOC=ON \
    -Dprotobuf_MSVC_STATIC_RUNTIME=OFF \
    -DCMAKE_BUILD_TYPE=Release \
    "$PROTOBUF_SRC" >/tmp/protobuf-native-cmake.log 2>&1 || { cat /tmp/protobuf-native-cmake.log; exit 1; }
  ninja protoc >/tmp/protobuf-native-build.log 2>&1 || { cat /tmp/protobuf-native-build.log; exit 1; }
  echo "Native protoc built: $PROTOBUF_NATIVE_BUILD/protoc ($($PROTOBUF_NATIVE_BUILD/protoc --version))"
fi
NATIVE_PROTOC_21="$PROTOBUF_NATIVE_BUILD/protoc"

if [ ! -f "$PROTOBUF_BUILD/libprotobuf-lite.a" ]; then
  echo "Building protobuf-lite for WASM..."
  mkdir -p "$PROTOBUF_BUILD"
  cd "$PROTOBUF_BUILD"

  emcmake cmake -G Ninja \
    -Dprotobuf_BUILD_TESTS=OFF \
    -Dprotobuf_BUILD_SHARED_LIBS=OFF \
    -Dprotobuf_BUILD_PROTOC_BINARIES=OFF \
    -Dprotobuf_BUILD_LIBPROTOC=OFF \
    -Dprotobuf_MSVC_STATIC_RUNTIME=OFF \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_CXX_FLAGS="-pthread" \
    "$PROTOBUF_SRC" >/tmp/protobuf-lite-cmake.log 2>&1 || { cat /tmp/protobuf-lite-cmake.log; exit 1; }

  ninja libprotobuf-lite >/tmp/protobuf-lite-build.log 2>&1 || { cat /tmp/protobuf-lite-build.log; exit 1; }
  echo "protobuf-lite.a built at $PROTOBUF_BUILD/libprotobuf-lite.a"
fi

NATIVE_PROTOC="$NATIVE_PROTOC_21"
PROTOBUF_INCLUDE="$PROTOBUF_SRC/src"
PROTOBUF_LIB="$PROTOBUF_BUILD/libprotobuf-lite.a"

# Also need full libprotobuf (not just lite) because Tengine's proto files use features
# that require the full runtime. Build it if not already present.
PROTOBUF_FULL_BUILD="$PROTOBUF_SRC/build-wasm-full"
if [ ! -f "$PROTOBUF_FULL_BUILD/libprotobuf.a" ]; then
  echo "Building full protobuf for WASM (Tengine needs non-lite)..."
  mkdir -p "$PROTOBUF_FULL_BUILD"
  cd "$PROTOBUF_FULL_BUILD"

  emcmake cmake -G Ninja \
    -Dprotobuf_BUILD_TESTS=OFF \
    -Dprotobuf_BUILD_SHARED_LIBS=OFF \
    -Dprotobuf_BUILD_PROTOC_BINARIES=OFF \
    -Dprotobuf_BUILD_LIBPROTOC=OFF \
    -Dprotobuf_MSVC_STATIC_RUNTIME=OFF \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_CXX_FLAGS="-pthread" \
    "$PROTOBUF_SRC" >/tmp/protobuf-full-cmake.log 2>&1 || { cat /tmp/protobuf-full-cmake.log; exit 1; }

  ninja libprotobuf >/tmp/protobuf-full-build.log 2>&1 || { cat /tmp/protobuf-full-build.log; exit 1; }
  echo "libprotobuf.a built at $PROTOBUF_FULL_BUILD/libprotobuf.a"
fi

# Use full protobuf for Tengine (TF/MXNet protos require reflection features)
PROTOBUF_LIB="$PROTOBUF_FULL_BUILD/libprotobuf.a"

echo "Patching Tengine source for WASM compatibility..."

# cpu.c uses __NR_sched_setaffinity which is a Linux-only syscall not available in WASM.
# The function is only used for thread affinity (irrelevant in a converter tool).
# Stub it out with a no-op for the EMSCRIPTEN target.
CPU_C="$TENGINE_ROOT/source/system/cpu.c"
if grep -q "__NR_sched_setaffinity" "$CPU_C" && ! grep -q "EMSCRIPTEN_stub" "$CPU_C"; then
  sed -i 's/int syscallret = syscall(__NR_sched_setaffinity, pid, sizeof(mask), \&mask);/int syscallret = -1; (void)pid; (void)mask; \/* EMSCRIPTEN_stub *\//g' "$CPU_C"
  echo "  Patched cpu.c: stubbed __NR_sched_setaffinity"
fi

echo "Configuring Tengine convert_tool with emcmake..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

emcmake cmake -G Ninja \
  -DTENGINE_BUILD_CONVERT_TOOL=ON \
  -DTENGINE_BUILD_QUANT_TOOL=OFF \
  -DTENGINE_BUILD_BENCHMARK=OFF \
  -DTENGINE_BUILD_EXAMPLES=OFF \
  -DTENGINE_BUILD_DEMO=OFF \
  -DTENGINE_BUILD_TESTS=OFF \
  -DTENGINE_BUILD_CPP_API=OFF \
  -DTENGINE_ONLINE_REPORT=OFF \
  -DTENGINE_OPENMP=OFF \
  -DTENGINE_ARCH_X86_AVX=OFF \
  -DTENGINE_ARCH_ARM_82=OFF \
  -DTENGINE_ENABLE_ACL=OFF \
  -DTENGINE_ENABLE_CUDA=OFF \
  -DTENGINE_ENABLE_OPENCL=OFF \
  -DTENGINE_ENABLE_OPENDLA=OFF \
  -DTENGINE_ENABLE_TENSORRT=OFF \
  -DTENGINE_ENABLE_TIM_VX=OFF \
  -DTENGINE_ENABLE_TORCH=OFF \
  -DTENGINE_ENABLE_NNIE=OFF \
  -DTENGINE_ENABLE_VULKAN=OFF \
  -DTENGINE_STANDALONE_HCL=OFF \
  -DPROTOBUF_FOUND=ON \
  -DProtobuf_FOUND=ON \
  -DProtobuf_INCLUDE_DIR="$PROTOBUF_INCLUDE" \
  -DProtobuf_INCLUDE_DIRS="$PROTOBUF_INCLUDE" \
  -DPROTOBUF_INCLUDE_DIRS="$PROTOBUF_INCLUDE" \
  -DProtobuf_LIBRARY="$PROTOBUF_LIB" \
  -DProtobuf_LIBRARIES="$PROTOBUF_LIB" \
  -DPROTOBUF_LIBRARIES="$PROTOBUF_LIB" \
  -DProtobuf_PROTOC_EXECUTABLE="$NATIVE_PROTOC" \
  -DPROTOBUF_PROTOC_EXECUTABLE="$NATIVE_PROTOC" \
  -DCMAKE_CXX_FLAGS="-fexceptions -std=c++14 -pthread -Wno-implicit-function-declaration" \
  -DCMAKE_C_FLAGS="-pthread -Wno-implicit-function-declaration" \
  -DCMAKE_EXE_LINKER_FLAGS="\
    -fexceptions \
    -sDISABLE_EXCEPTION_CATCHING=0 \
    -sALLOW_MEMORY_GROWTH=1 \
    -sINITIAL_MEMORY=134217728 \
    -sMAXIMUM_MEMORY=2147483648 \
    -sSTACK_SIZE=8388608 \
    -sEXPORT_NAME=createTengineConvertModule \
    -sMODULARIZE=1 \
    -sEXPORT_ES6=1 \
    -sINVOKE_RUN=0 \
    -sALLOW_TABLE_GROWTH=1 \
    -sERROR_ON_UNDEFINED_SYMBOLS=0 \
    -sNODEJS_CATCH_EXIT=0 \
    -sFORCE_FILESYSTEM=1 \
    -sEXPORTED_RUNTIME_METHODS=FS,callMain \
    -sPTHREADS_DEBUG=0 \
    -sUSE_PTHREADS=1 \
    -sPTHREAD_POOL_SIZE=2" \
  "$TENGINE_ROOT" >/tmp/tengine-cmake.log 2>&1 || { echo "=== cmake log ==="; cat /tmp/tengine-cmake.log; exit 1; }

echo "Building convert_tool..."
ninja convert_tool >/tmp/tengine-build.log 2>&1 || { echo "=== build log (last 100 lines) ==="; tail -100 /tmp/tengine-build.log; exit 1; }

echo "Build succeeded. Locating output files..."
BUILT_JS=$(find "$BUILD_DIR" -name "convert_tool.js" | head -1)
BUILT_WASM=$(find "$BUILD_DIR" -name "convert_tool.wasm" | head -1)

if [ -z "$BUILT_JS" ] || [ -z "$BUILT_WASM" ]; then
  echo "ERROR: Could not find convert_tool.{js,wasm} in build dir"
  find "$BUILD_DIR" -name "*.js" -o -name "*.wasm" 2>/dev/null | head -20
  exit 1
fi

echo "Found: $BUILT_JS"
echo "Found: $BUILT_WASM"

echo "Copying artifacts (no WASM trimming needed for standard Emscripten output)..."

# Copy and rename artifacts
cp "$BUILT_JS"   "$OUTPUT_DIR/TengineConvert.js"
cp "$BUILT_WASM" "$OUTPUT_DIR/TengineConvert.wasm"

touch "$OUTPUT_DIR/.browser-ready"

echo "=== Tengine WASM toolchain built successfully ==="
echo "Artifacts:"
ls -lh "$OUTPUT_DIR/"
