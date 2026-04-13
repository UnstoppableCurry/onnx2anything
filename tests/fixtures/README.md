# ONNX2Anything 测试模型

本目录包含用于测试的 ONNX 模型文件。

## 测试模型清单

### YOLO 系列

| 模型 | 来源 | 大小 | 输入尺寸 | 算子 |
|------|------|------|----------|------|
| yolov5n.onnx | ultralytics/yolov5 | 3.9MB | 640x640 | Conv, MaxPool, Concat, Reshape, Resize |
| yolov8n.onnx | ultralytics/ultralytics | 6.2MB | 640x640 | Conv, C2f, SPPF, Upsample |
| yolov5s.onnx | ultralytics/yolov5 | 14.0MB | 640x640 | Conv, BatchNorm, LeakyReLU |
| yolov8s.onnx | ultralytics/ultralytics | 22.5MB | 640x640 | Conv, SiLU, Concat |

### 分类模型

| 模型 | 来源 | 大小 | 输入尺寸 | 算子 |
|------|------|------|----------|------|
| resnet50.onnx | pytorch/vision | 97.8MB | 224x224 | Conv, BatchNorm, ReLU, AdaptiveAvgPool |
| mobilenetv2.onnx | pytorch/vision | 13.5MB | 224x224 | Conv, DepthwiseConv, ReLU6 |

### 轻量测试模型

| 模型 | 用途 | 大小 | 描述 |
|------|------|------|------|
| dummy_minimal.onnx | 单元测试 | 1KB | 最小 ONNX 模型，用于快速测试 |
| dummy_conv.onnx | 单元测试 | 10KB | 仅包含 Conv 层的简单模型 |
| dummy_quant.onnx | 量化测试 | 50KB | 用于测试 INT8/FP16 量化 |

## 模型获取方式

### 从 PyTorch 导出

```python
import torch

# YOLOv5n 导出
model = torch.hub.load('ultralytics/yolov5', 'yolov5n')
model.eval()
dummy_input = torch.randn(1, 3, 640, 640)
torch.onnx.export(model, dummy_input, 'yolov5n.onnx',
    opset_version=12,
    input_names=['images'],
    output_names=['output0'],
    dynamic_axes={'images': {0: 'batch'}, 'output0': {0: 'batch'}}
)

# YOLOv8n 导出
from ultralytics import YOLO
model = YOLO('yolov8n.pt')
model.export(format='onnx')
```

### 使用生成脚本

```bash
# 生成测试模型
python tests/fixtures/generate_dummy_models.py

# 生成特定模型
python tests/fixtures/generate_dummy_models.py --model yolov5n
python tests/fixtures/generate_dummy_models.py --model yolov8n
```

## 验证模型

```python
import onnx

# 加载并验证
model = onnx.load('yolov5n.onnx')
onnx.checker.check_model(model)

# 获取模型信息
print(f"IR Version: {model.ir_version}")
print(f"Opset: {model.opset_import[0].version}")
print(f"Nodes: {len(model.graph.node)}")
```

## 模型要求

### 用于单元测试
- 文件大小 < 1MB
- 结构简单
- 转换速度快

### 用于集成测试
- 真实模型结构
- 大小 1-50MB
- 覆盖主要算子

### 用于性能测试
- 大模型 (>50MB)
- 复杂图结构
- 多种算子组合

## 注意事项

1. **版权问题**: 测试模型遵循原项目许可
2. **存储限制**: Git 不存储大模型文件，使用 Git LFS
3. **CI/CD**: CI 环境中使用最小测试模型
4. **本地开发**: 开发者需自行下载完整测试模型

## 生成脚本说明

`generate_dummy_models.py` 可以生成以下模型：

- **minimal**: 最简单的有效 ONNX 模型
- **conv_only**: 仅包含卷积层
- **yolo_like**: 模拟 YOLO 结构的简化模型
- **resnet_like**: 模拟 ResNet 结构的简化模型

运行脚本时会自动验证生成的模型。
