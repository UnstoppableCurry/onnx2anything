#!/bin/bash
# Build TNN TnnConverter as a WASM module using Emscripten.
# Run this script inside the Lima VM or Docker container:
#   limactl shell convert-wasm-builder -- bash /workspace/scripts/build-tnn-toolchain-inside-container.sh
#
# Output:
#   /workspace/apps/web/public/toolchains/tnn/TnnConverter.js
#   /workspace/apps/web/public/toolchains/tnn/TnnConverter.wasm
#
# NOTE: TNN binary is named TnnConverter (not convert2tnn). The .mjs bridge
#       loads TnnConverter.js. Symlinks convert2tnn.{js,wasm} point to it for
#       compatibility with any cached URLs.

set -euo pipefail

TNN_ROOT="/workspace/third_party/TNN"
OUTPUT_DIR="/workspace/apps/web/public/toolchains/tnn"
CACHE_DIR="/workspace/.cache-src"
BUILD_DIR="$TNN_ROOT/build-wasm-converter"

mkdir -p "$OUTPUT_DIR"
mkdir -p "$CACHE_DIR"

if [ ! -d "$TNN_ROOT" ]; then
  echo "TNN source not found at $TNN_ROOT"
  echo "Please vendor TNN source first:"
  echo "  git clone --depth=1 https://github.com/Tencent/TNN.git third_party/TNN"
  exit 1
fi

echo "=== Building TNN TnnConverter WASM toolchain ==="
echo "TNN source: $TNN_ROOT"
echo "Output:     $OUTPUT_DIR"

# Ensure native protoc is available (needed for protobuf_generate_cpp in cmake)
if ! command -v protoc &>/dev/null; then
  echo "ERROR: native protoc not found. Install with: sudo apt-get install -y protobuf-compiler"
  exit 1
fi
echo "Native protoc: $(protoc --version)"

# Build protobuf-lite for WASM (reuse if already built by NCNN build)
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

# Build native protoc 21.12 — must match the WASM library version exactly.
# System protoc (3.12.4) is incompatible with protobuf 21.12 headers.
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

# TNN bundles gflags and flatbuffers in its third_party/ directory.
# We use those directly via the TNN cmake system.

echo "Configuring TNN with emcmake..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Provide the WASM-built protobuf to TNN's find_package(Protobuf).
# Use native protoc 21.12 (must match the WASM library headers) for protobuf_generate_cpp().
NATIVE_PROTOC="$NATIVE_PROTOC_21"
PROTOBUF_INCLUDE="$PROTOBUF_SRC/src"
PROTOBUF_LIB="$PROTOBUF_BUILD/libprotobuf-lite.a"

emcmake cmake -G Ninja \
  -DTNN_CPU_ENABLE=ON \
  -DTNN_ARM_ENABLE=OFF \
  -DTNN_ARM82_ENABLE=OFF \
  -DTNN_METAL_ENABLE=OFF \
  -DTNN_OPENCL_ENABLE=OFF \
  -DTNN_CUDA_ENABLE=OFF \
  -DTNN_TENSORRT_ENABLE=OFF \
  -DTNN_OPENVINO_ENABLE=OFF \
  -DTNN_HUAWEI_NPU_ENABLE=OFF \
  -DTNN_RK_NPU_ENABLE=OFF \
  -DTNN_BUILD_SHARED=OFF \
  -DTNN_OPENMP_ENABLE=OFF \
  -DTNN_SYMBOL_HIDE=OFF \
  -DTNN_CONVERTER_ENABLE=ON \
  -DTNN_TEST_ENABLE=OFF \
  -DTNN_UNIT_TEST_ENABLE=OFF \
  -DTNN_BENCHMARK_MODE=OFF \
  -DTNN_QUANTIZATION_ENABLE=OFF \
  -DTNN_EVALUATION_ENABLE=OFF \
  -DTNN_MODEL_CHECK_ENABLE=OFF \
  -DTNN_PROFILER_ENABLE=OFF \
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
  -DCMAKE_CXX_FLAGS="-fexceptions -std=c++14 -DFLATBUFFERS_LOCALE_INDEPENDENT=1" \
  -DCMAKE_EXE_LINKER_FLAGS="\
    -fexceptions \
    -sDISABLE_EXCEPTION_CATCHING=0 \
    -sALLOW_MEMORY_GROWTH=1 \
    -sINITIAL_MEMORY=134217728 \
    -sMAXIMUM_MEMORY=2147483648 \
    -sSTACK_SIZE=8388608 \
    -sEXPORT_NAME=createTnnConverterModule \
    -sMODULARIZE=1 \
    -sEXPORT_ES6=1 \
    -sINVOKE_RUN=0 \
    -sALLOW_TABLE_GROWTH=1 \
    -sERROR_ON_UNDEFINED_SYMBOLS=0 \
    -sNODEJS_CATCH_EXIT=0 \
    -sFORCE_FILESYSTEM=1 \
    -sEXPORTED_RUNTIME_METHODS=FS,callMain" \
  "$TNN_ROOT" >/tmp/tnn-cmake.log 2>&1 || { echo "=== cmake log ==="; cat /tmp/tnn-cmake.log; exit 1; }

echo "Building TnnConverter..."
ninja TnnConverter >/tmp/tnn-build.log 2>&1 || { echo "=== build log (last 100 lines) ==="; tail -100 /tmp/tnn-build.log; exit 1; }

# Strip trailing custom WASM sections (same cleanup as MNN/NCNN)
python3 - <<'PY'
from pathlib import Path

wasm_path = Path('/workspace/third_party/TNN/build-wasm-converter/tools/converter/TnnConverter.wasm')
if not wasm_path.exists():
    raise FileNotFoundError(f"TnnConverter.wasm not found at {wasm_path}")

data = wasm_path.read_bytes()

def read_varuint(buffer: bytes, offset: int):
    result = 0
    shift = 0
    while offset < len(buffer):
        byte = buffer[offset]
        offset += 1
        result |= (byte & 0x7F) << shift
        if byte < 0x80:
            return result, offset
        shift += 7
    raise ValueError('invalid varuint')

offset = 8
last_valid_end = offset
last_non_custom = -1

while offset < len(data):
    section_offset = offset
    section_id = data[offset]
    offset += 1
    size, offset = read_varuint(data, offset)
    end = offset + size
    if end > len(data):
        break
    if section_id != 0:
        if section_id < last_non_custom:
            break
        last_non_custom = section_id
    last_valid_end = end
    offset = end

if last_valid_end < len(data):
    print(f"Trimming {len(data) - last_valid_end} trailing bytes from WASM")
    wasm_path.write_bytes(data[:last_valid_end])
PY

# Copy artifacts to public directory
cp "$BUILD_DIR/tools/converter/TnnConverter.js" "$OUTPUT_DIR/TnnConverter.js"
cp "$BUILD_DIR/tools/converter/TnnConverter.wasm" "$OUTPUT_DIR/TnnConverter.wasm"

# Create browser-ready sentinel
touch "$OUTPUT_DIR/.browser-ready"

echo "=== TNN WASM toolchain built successfully ==="
echo "Artifacts:"
ls -lh "$OUTPUT_DIR/"
