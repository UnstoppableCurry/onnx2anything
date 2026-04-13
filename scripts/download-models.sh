#!/bin/bash
# 下载测试模型脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MODELS_DIR="$PROJECT_ROOT/tests/fixtures"

mkdir -p "$MODELS_DIR"

echo "=========================================="
echo "Test Models Download Script"
echo "=========================================="
echo "Target directory: $MODELS_DIR"
echo ""

# 下载函数（带重试）
download_with_retry() {
    local url="$1"
    local output="$2"
    local max_retries=3
    local retry=0

    while [ $retry -lt $max_retries ]; do
        if curl -L --fail --progress-bar -o "$output" "$url" 2>/dev/null; then
            return 0
        fi
        retry=$((retry + 1))
        echo "  Retry $retry/$max_retries..."
        sleep 2
    done
    return 1
}

# YOLO 系列模型
# YOLOv5n (轻量级检测模型, ~3.9MB)
echo "[1/8] Downloading YOLOv5n..."
if [ ! -f "$MODELS_DIR/yolov5n.onnx" ]; then
    download_with_retry \
        "https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5n.onnx" \
        "$MODELS_DIR/yolov5n.onnx" \
        || echo "  Warning: Failed to download YOLOv5n"
fi

# YOLOv5s (标准检测模型, ~14MB)
echo "[2/8] Downloading YOLOv5s..."
if [ ! -f "$MODELS_DIR/yolov5s.onnx" ]; then
    download_with_retry \
        "https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5s.onnx" \
        "$MODELS_DIR/yolov5s.onnx" \
        || echo "  Warning: Failed to download YOLOv5s"
fi

# YOLOv8n (新版轻量级检测模型, ~6.2MB)
echo "[3/8] Downloading YOLOv8n..."
if [ ! -f "$MODELS_DIR/yolov8n.onnx" ]; then
    download_with_retry \
        "https://github.com/ultralytics/assets/releases/download/v8.0.0/yolov8n.onnx" \
        "$MODELS_DIR/yolov8n.onnx" \
        || echo "  Warning: Failed to download YOLOv8n"
fi

# YOLOv8s (新版标准检测模型, ~22.5MB)
echo "[4/8] Downloading YOLOv8s..."
if [ ! -f "$MODELS_DIR/yolov8s.onnx" ]; then
    download_with_retry \
        "https://github.com/ultralytics/assets/releases/download/v8.0.0/yolov8s.onnx" \
        "$MODELS_DIR/yolov8s.onnx" \
        || echo "  Warning: Failed to download YOLOv8s"
fi

# 图像分类模型
# ResNet50 (图像分类基准, ~97.8MB)
echo "[5/8] Downloading ResNet50..."
if [ ! -f "$MODELS_DIR/resnet50-v2-7.onnx" ]; then
    download_with_retry \
        "https://github.com/onnx/models/raw/main/validated/vision/classification/resnet/model/resnet50-v2-7.onnx" \
        "$MODELS_DIR/resnet50-v2-7.onnx" \
        || echo "  Warning: Failed to download ResNet50"
fi

# ResNet18 (轻量级图像分类, ~44.7MB)
echo "[6/8] Downloading ResNet18..."
if [ ! -f "$MODELS_DIR/resnet18-v2-7.onnx" ]; then
    download_with_retry \
        "https://github.com/onnx/models/raw/main/validated/vision/classification/resnet/model/resnet18-v2-7.onnx" \
        "$MODELS_DIR/resnet18-v2-7.onnx" \
        || echo "  Warning: Failed to download ResNet18"
fi

# MobileNetV2 (移动端优化模型, ~13.6MB)
echo "[7/8] Downloading MobileNetV2..."
if [ ! -f "$MODELS_DIR/mobilenetv2-7.onnx" ]; then
    download_with_retry \
        "https://github.com/onnx/models/raw/main/validated/vision/classification/mobilenet/model/mobilenetv2-7.onnx" \
        "$MODELS_DIR/mobilenetv2-7.onnx" \
        || echo "  Warning: Failed to download MobileNetV2"
fi

# EfficientNet-Lite4 (高效移动端模型, ~20MB)
echo "[8/8] Downloading EfficientNet-Lite4..."
if [ ! -f "$MODELS_DIR/efficientnet-lite4.onnx" ]; then
    download_with_retry \
        "https://github.com/onnx/models/raw/main/validated/vision/classification/efficientnet-lite4/model/efficientnet-lite4-11.onnx" \
        "$MODELS_DIR/efficientnet-lite4-11.onnx" \
        || echo "  Warning: Failed to download EfficientNet-Lite4"
fi

echo ""
echo "=========================================="
echo "Download Summary"
echo "=========================================="

# 显示已下载的模型
if [ -d "$MODELS_DIR" ] && [ "$(ls -A "$MODELS_DIR")" ]; then
    echo "Downloaded/Available models:"
    ls -lh "$MODELS_DIR/" | tail -n +2 | awk '{printf "  %-30s %s\n", $9, $5}'
    echo ""
    echo "Total size:"
    du -sh "$MODELS_DIR"
else
    echo "No models downloaded yet."
fi

echo ""
echo "=========================================="
echo "Done!"
echo "=========================================="
echo ""
echo "Note: Some models may have failed to download."
echo "This is normal if GitHub rate limits are exceeded."
echo "Run this script again later to retry failed downloads."

