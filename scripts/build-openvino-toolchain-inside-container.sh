#!/bin/bash

set -euo pipefail

echo "OpenVINO browser-side conversion still lacks a practical Emscripten build path."
echo "Current source root: /workspace/third_party/openvino/tools/ovc"
echo "Expected future artifacts:"
echo "  /workspace/apps/web/public/toolchains/openvino/ovc.js"
echo "  /workspace/apps/web/public/toolchains/openvino/ovc.wasm"
echo "Immediate blocker: OVC is a Python-heavy conversion stack, not a single native CLI like onnx2ncnn/MNNConvert."
exit 1
