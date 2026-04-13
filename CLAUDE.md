# ONNX2Anything WASM 转换器

一个浏览器端运行的 ONNX 模型在线转换工具，基于 WebAssembly 技术，无需服务器即可完成 ONNX 到多种端侧推理框架格式的转换。

## 项目概述

### 核心功能
- 纯浏览器端模型转换（无需上传模型到服务器）
- 支持 ONNX 到 TFLite、Core ML、OpenVINO 等格式的转换
- 使用 WASM 技术实现接近原生的性能
- 针对 YOLO 等主流模型优化

### 技术栈
- **核心运行时**: Pyodide (Python WASM runtime)
- **前端框架**: React + TypeScript
- **UI组件**: shadcn/ui
- **转换引擎**: onnx2tf, onnx-simplifier, onnxmltools
- **打包工具**: Rollup / Vite
- **容器化**: Docker + Docker Compose

## 环境配置

### 系统要求
```
操作系统: macOS 14+ / Linux / Windows (WSL2)
内存: 至少 8GB RAM（推荐 16GB）
磁盘: SSD，至少 50GB 可用空间
```

### Docker 安装

#### macOS (使用 Homebrew)
```bash
# 安装 Homebrew（如果未安装）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Docker Desktop
brew install --cask docker

# 启动 Docker
open -a Docker

# 验证安装
docker --version
docker-compose --version
```

#### 手动配置 Docker

1. **下载 Docker Desktop**
   - 访问 https://www.docker.com/products/docker-desktop
   - 下载适用于 macOS 的 ARM64 (Apple Silicon) 或 AMD64 版本

2. **配置 Docker 资源**
   - 打开 Docker Desktop → Settings → Resources
   - Memory: 8GB (推荐 12GB)
   - CPUs: 4
   - Disk: 至少 50GB

### 项目依赖安装

```bash
# 克隆项目
cd /Volumes/SSD/projects  # 或你的SSD路径
git clone <repo-url> onnx2anything
cd onnx2anything

# 使用 Docker 构建开发环境
docker-compose -f docker/dev.yml up -d

# 或使用本地 Node.js 环境
npm install
```

### Python WASM 依赖

```bash
# Pyodide 预构建包（浏览器自动加载）
# 主要包清单:
# - onnx==1.15.0
# - onnx-simplifier
# - onnx2tf
# - tensorflow
# - torch (CPU版本)
```

## 目录结构

```
onnx2anything/
├── apps/
│   └── web/                 # React + TypeScript 前端
├── packages/
│   ├── core/               # 核心 WASM 转换逻辑
│   ├── converters/         # 各类格式转换器
│   └── ui/                 # 共享 UI 组件
├── docker/
│   ├── dev.yml             # 开发环境配置
│   └── prod.yml            # 生产环境配置
├── tests/
│   ├── models/             # 测试模型 (YOLO等)
│   └── e2e/                # 端到端测试
└── CLAUDE.md               # 本文件
```

## 开发工作流

### 启动开发服务器
```bash
# 使用 Docker
docker-compose -f docker/dev.yml up

# 本地开发
npm run dev
```

### 构建 WASM 模块
```bash
# 构建 Pyodide 自定义包
npm run build:wasm

# 构建完整项目
npm run build
```

### 运行测试
```bash
# 单元测试
npm run test

# YOLO 模型转换测试
npm run test:yolo

# 所有格式转换测试
npm run test:converters
```

## 支持的转换格式

| 源格式 | 目标格式 | 状态 | 备注 |
|--------|----------|------|------|
| ONNX | TFLite | ✅ | 完整支持，包括量化 |
| ONNX | Core ML | ✅ | 适用于 Apple 设备 |
| ONNX | OpenVINO | 🔄 | 计划中 |
| ONNX | TensorRT | 🔄 | 计划中 |
| ONNX | NCNN | 🔄 | 计划中 |
| ONNX | MNN | 🔄 | 计划中 |

## 测试基准模型

### YOLO 系列
- **YOLOv5n**: 轻量级检测，用于快速验证
- **YOLOv5s**: 标准检测模型
- **YOLOv8n**: 最新版本轻量模型
- **YOLOv8s**: 标准性能模型

### 其他测试模型
- ResNet50: 图像分类基准
- MobileNetV2: 移动端优化模型
- BERT-base: NLP 模型（可选）

## 性能指标

### 转换速度目标（MacBook Pro M3）
- YOLOv5n: < 30秒
- YOLOv5s: < 60秒
- ResNet50: < 45秒

### 内存使用
- 峰值内存: < 2GB
- 推荐浏览器: Chrome 120+, Safari 17+, Edge 120+

## 注意事项

1. **模型大小限制**: 浏览器内存限制，建议 < 500MB 的 ONNX 模型
2. **量化支持**: INT8 量化在 WASM 中可能需要较长时间
3. **浏览器兼容性**: 需要 SharedArrayBuffer 支持
4. **CORS**: 本地开发需要配置 CORS headers

## 参考资料

### 相关项目
- [onnx2tf](https://github.com/PINTO0309/onnx2tf) - ONNX to TFLite 转换器
- [onnxmltools](https://github.com/onnx/onnxmltools) - ONNX 转换工具集
- [onnx-simplifier](https://github.com/daquexian/onnx-simplifier) - ONNX 模型简化
- [Pyodide](https://pyodide.org/) - Python WASM runtime

### 文档链接
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript.html)
- [TensorFlow Lite Converter](https://www.tensorflow.org/lite/convert)
- [Core ML Tools](https://apple.github.io/coremltools/)

## 更新日志

### 2025-04-04
- 项目初始化
- 创建技术架构设计
- 配置 Docker 开发环境
