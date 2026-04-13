#!/bin/bash

set -euo pipefail

cd /workspace/third_party/MNN
mkdir -p build-wasm-converter
cd build-wasm-converter

emcmake cmake -G Ninja \
  -DMNN_BUILD_CONVERTER=ON \
  -DMNN_BUILD_SHARED_LIBS=OFF \
  -DMNN_BUILD_TOOLS=ON \
  -DMNN_BUILD_QUANTOOLS=OFF \
  -DMNN_BUILD_BENCHMARK=OFF \
  -DMNN_BUILD_TEST=OFF \
  -DMNN_OPENCL=OFF \
  -DMNN_VULKAN=OFF \
  -DMNN_METAL=OFF \
  -DMNN_CUDA=OFF \
  -DMNN_TENSORRT=OFF \
  -DMNN_COREML=OFF \
  -DMNN_NNAPI=OFF \
  -DMNN_BUILD_LLM=OFF \
  -DMNN_CONVERTER_ENABLE_TENSORFLOW=OFF \
  -DMNN_CONVERTER_ENABLE_CAFFE=OFF \
  -DMNN_CONVERTER_ENABLE_TFLITE=OFF \
  -DMNN_LOW_MEMORY=ON \
  -DMNN_USE_SSE=OFF \
  -DMNN_AVX2=OFF \
  -DMNN_AVX512=OFF \
  -DCMAKE_CXX_FLAGS="-fexceptions" \
  -DCMAKE_EXE_LINKER_FLAGS="-fexceptions -sDISABLE_EXCEPTION_CATCHING=0 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=268435456 -sMAXIMUM_MEMORY=2147483648" \
  .. >/tmp/mnn-cmake.log 2>&1 || { cat /tmp/mnn-cmake.log; exit 1; }

ninja MNNConvert >/tmp/mnn-build.log 2>&1 || { cat /tmp/mnn-build.log; exit 1; }

python3 - <<'PY'
from pathlib import Path

wasm_path = Path('/workspace/third_party/MNN/build-wasm-converter/MNNConvert.wasm')
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
    wasm_path.write_bytes(data[:last_valid_end])
PY

wasm-emscripten-finalize MNNConvert.wasm -o MNNConvert.finalized.wasm >/tmp/mnn-finalize.json 2>/tmp/mnn-finalize.err || {
  cat /tmp/mnn-finalize.err
  exit 1
}
mv MNNConvert.finalized.wasm MNNConvert.wasm

mkdir -p /workspace/apps/web/public/toolchains/mnn
cp /workspace/third_party/MNN/build-wasm-converter/MNNConvert.js /workspace/apps/web/public/toolchains/mnn/MNNConvert.js
cp /workspace/third_party/MNN/build-wasm-converter/MNNConvert.wasm /workspace/apps/web/public/toolchains/mnn/MNNConvert.wasm

python3 - <<'PY'
from pathlib import Path

target = Path('/workspace/apps/web/public/toolchains/mnn/MNNConvert.js')
source = target.read_text()

prefix = """var Module = {
  noInitialRun: true
};
"""
if source.startswith("var Module=typeof Module!="):
    source = prefix + source

if "const __dirname = new URL('.', import.meta.url).pathname.replace(/\\/$/, '');" not in source:
    source = source.replace(
        "var scriptDirectory=\"\";",
        "var scriptDirectory=\"\";const __dirname = new URL('.', import.meta.url).pathname.replace(/\\/$/, '');",
        1,
    )

if "export default Module;" not in source:
    source += "\nexport default Module;\n"

target.write_text(source)
PY
