#!/bin/bash

set -euo pipefail

mkdir -p /workspace/.cache-src

if [ ! -d /workspace/.cache-src/protobuf-21.12 ]; then
  python3 - <<'PY'
from pathlib import Path
from urllib.request import urlopen
import tarfile

cache_root = Path('/workspace/.cache-src')
archive = cache_root / 'protobuf-v21.12.tar.gz'
if not archive.exists():
    with urlopen('https://github.com/protocolbuffers/protobuf/archive/refs/tags/v21.12.tar.gz') as response:
        archive.write_bytes(response.read())

with tarfile.open(archive) as tar:
    tar.extractall(cache_root)
PY
fi

rm -rf /tmp/onnx2ncnn-lite
mkdir -p /tmp/onnx2ncnn-lite

python3 - <<'PY'
from pathlib import Path

src = Path('/workspace/third_party/ncnn/tools/onnx/onnx.proto').read_text()
if 'option optimize_for = LITE_RUNTIME;' not in src:
    src = src.replace('syntax = "proto2";', 'syntax = "proto2";\n\noption optimize_for = LITE_RUNTIME;')
Path('/tmp/onnx2ncnn-lite/onnx.proto').write_text(src)

cpp = Path('/workspace/third_party/ncnn/tools/onnx/onnx2ncnn.cpp').read_text()
cpp = cpp.replace('#include <google/protobuf/message.h>\n', '')
cpp = cpp.replace('#include <google/protobuf/text_format.h>\n', '')
Path('/tmp/onnx2ncnn-lite/onnx2ncnn.cpp').write_text(cpp)
PY

protoc -I /tmp/onnx2ncnn-lite --cpp_out=/tmp/onnx2ncnn-lite /tmp/onnx2ncnn-lite/onnx.proto

cd /workspace/.cache-src/protobuf-21.12
mkdir -p build-wasm-lite
cd build-wasm-lite

emcmake cmake -G Ninja \
  -Dprotobuf_BUILD_TESTS=OFF \
  -Dprotobuf_BUILD_SHARED_LIBS=OFF \
  -Dprotobuf_BUILD_PROTOC_BINARIES=OFF \
  -Dprotobuf_BUILD_LIBPROTOC=OFF \
  -Dprotobuf_MSVC_STATIC_RUNTIME=OFF \
  -DCMAKE_BUILD_TYPE=Release \
  .. >/tmp/protobuf-lite-cmake.log 2>&1 || { cat /tmp/protobuf-lite-cmake.log; exit 1; }

ninja libprotobuf-lite >/tmp/protobuf-lite-build.log 2>&1 || { cat /tmp/protobuf-lite-build.log; exit 1; }

em++ -O3 -std=c++17 \
  -I/tmp/onnx2ncnn-lite \
  -I/workspace/.cache-src/protobuf-21.12/src \
  -I/workspace/.cache-src/protobuf-21.12/build-wasm-lite \
  /tmp/onnx2ncnn-lite/onnx2ncnn.cpp \
  /tmp/onnx2ncnn-lite/onnx.pb.cc \
  /workspace/.cache-src/protobuf-21.12/build-wasm-lite/libprotobuf-lite.a \
  -o /workspace/apps/web/public/toolchains/ncnn/onnx2ncnn.js \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 \
  -sINVOKE_RUN=0 \
  -sEXPORTED_RUNTIME_METHODS=FS,callMain \
  -sEXIT_RUNTIME=1 >/tmp/onnx2ncnn-link.log 2>&1 || { cat /tmp/onnx2ncnn-link.log; exit 1; }

python3 - <<'PY'
from pathlib import Path

target = Path('/workspace/apps/web/public/toolchains/ncnn/onnx2ncnn.js')
source = target.read_text()
needle = 'var _scriptDir = import.meta.url;'
replacement = """var _scriptDir = import.meta.url;
  const __dirname = new URL('.', import.meta.url).pathname.replace(/\/$/, '');"""
if needle in source and replacement not in source:
    source = source.replace(needle, replacement, 1)
    target.write_text(source)
PY
