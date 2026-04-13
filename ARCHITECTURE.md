# ONNX2Anything 技术架构设计

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Environment                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    React Frontend                        │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │
│  │  │ Model Upload │  │ Converter UI │  │ Download     │   │    │
│  │  │ Component    │  │ Controls     │  │ Component    │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                WASM Runtime Layer                        │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │           Pyodide (Python 3.11 WASM)             │    │    │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │    │    │
│  │  │  │ onnx        │  │ onnx2tf     │  │ tf2tflite│ │    │    │
│  │  │  │ onnx-simplif│  │ onnxmltools │  │ coreml   │ │    │    │
│  │  │  └─────────────┘  └─────────────┘  └──────────┘ │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │        Virtual File System (MEMFS)               │    │    │
│  │  │         (模型文件临时存储)                        │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 技术选型分析

### 2.1 WASM Runtime 选择

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| **Pyodide** | 完整的 Python 生态，直接支持 onnx2tf 等工具 | 体积大 (~30MB)，加载慢 | ✅ 选用 - 生态完整 |
| AssemblyScript | 体积小，性能好 | 需要重写所有转换逻辑 | ❌ 工作量太大 |
| Rust + wasm-bindgen | 性能好，内存安全 | Python 生态无法复用 | ❌ 需要重新实现 |
| ONNX Runtime Web | 官方支持，专门针对 ONNX | 只有推理，没有转换功能 | ❌ 不满足需求 |

### 2.2 架构模式

**主线程 + Worker 模式**
```
Main Thread:
  └── React UI (负责渲染和用户交互)
  └── 通过 Comlink 与 Worker 通信

Web Worker:
  └── Pyodide Runtime (避免阻塞 UI)
  └── 所有转换逻辑在 Worker 中执行
  └── 通过 postMessage 返回进度和结果
```

## 3. 核心模块设计

### 3.1 转换器架构

```typescript
// 核心转换器接口
interface ModelConverter {
  readonly name: string;
  readonly targetFormat: string;
  readonly supportedOps: string[];
  
  convert(
    modelBuffer: ArrayBuffer,
    options: ConversionOptions
  ): Promise<ConversionResult>;
}

// 转换选项
interface ConversionOptions {
  targetFormat: 'tflite' | 'coreml' | 'openvino';
  quantization?: 'none' | 'fp16' | 'int8';
  optimization?: boolean;
  dynamicShapes?: boolean;
}

// 转换结果
interface ConversionResult {
  buffer: ArrayBuffer;
  format: string;
  metadata: ModelMetadata;
  warnings?: string[];
}
```

### 3.2 Python 转换脚本架构

```python
# converters/onnx_converter.py
class ONNXConverter:
    """ONNX 模型转换器基类"""
    
    def __init__(self):
        self.temp_dir = '/tmp/onnx_convert'
    
    def simplify_onnx(self, model_path: str) -> str:
        """使用 onnx-simplifier 简化模型"""
        import onnxsim
        model = onnx.load(model_path)
        model_simp, check = onnxsim.simplify(model)
        if check:
            onnx.save(model_simp, model_path)
        return model_path
    
    def convert_to_tflite(
        self, 
        onnx_path: str,
        quantize: bool = False
    ) -> bytes:
        """转换为 TFLite"""
        from onnx2tf import convert
        # ... 转换逻辑
        
    def convert_to_coreml(
        self, 
        onnx_path: str
    ) -> bytes:
        """转换为 Core ML"""
        import coremltools as ct
        # ... 转换逻辑
```

## 4. 数据流设计

### 4.1 转换流程

```
1. 用户上传 ONNX 模型
   ↓
2. 前端验证文件 (magic number, size < 500MB)
   ↓
3. 传输到 Web Worker 的虚拟文件系统
   ↓
4. Pyodide 加载模型，进行 onnx-simplifier 预处理
   ↓
5. 执行目标格式转换 (onnx2tf / onnxmltools)
   ↓
6. 如有需要，执行量化 (INT8/FP16)
   ↓
7. 从虚拟文件系统读取结果
   ↓
8. 传输回主线程，提供下载
```

### 4.2 进度反馈机制

```typescript
// Worker 中的进度报告
self.postMessage({
  type: 'progress',
  stage: 'simplifying',  // loading | simplifying | converting | quantizing | done
  percent: 45,
  message: 'Optimizing ONNX graph...'
});
```

## 5. 性能优化策略

### 5.1 加载优化

| 策略 | 实现方式 | 预期效果 |
|------|----------|----------|
| Pyodide 预加载 | `<link rel="preload">` | 首屏加载 -3s |
| 按需加载包 | `micropip.install()` 动态导入 | 减少初始体积 |
| WebAssembly Streaming | `WebAssembly.instantiateStreaming()` | 编译时间 -50% |
| Service Worker 缓存 | Cache Pyodide 和 wheels | 二次访问秒开 |

### 5.2 运行时优化

| 策略 | 实现方式 | 预期效果 |
|------|----------|----------|
| Worker 池 | 维护 2-3 个 Pyodide Worker | 并发处理多模型 |
| 流式转换 | 分块处理大模型 | 支持 >500MB 模型 |
| 内存管理 | 及时清理虚拟文件系统 | 避免内存泄漏 |

## 6. 测试策略

### 6.1 测试模型矩阵

```yaml
# 测试模型配置
test_models:
  yolov5n:
    source: "ultralytics/yolov5"
    size: "3.9MB"
    ops: ["Conv", "MaxPool", "Concat", "Reshape", "Resize"]
    
  yolov8n:
    source: "ultralytics/ultralytics"  
    size: "6.2MB"
    ops: ["Conv", "C2f", "SPPF", "Upsample"]
    
  resnet50:
    source: "pytorch/vision"
    size: "97.8MB"
    ops: ["Conv", "BatchNorm", "ReLU", "AdaptiveAvgPool"]
```

### 6.2 验证流程

```
转换后验证:
1. 模型结构验证 - 使用 netron 对比节点
2. 数值精度验证 - 相同输入，输出差异 < 1e-5
3. 推理速度基准 - 在目标设备上测试 FPS
```

## 7. 技术风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Pyodide 包太大 | 首屏慢 | 懒加载 + 进度条 + 预加载 |
| WASM 内存限制 | 大模型无法处理 | 分块处理 + 文件大小提示 |
| 转换时间长 | 用户等待 | 进度实时反馈 + 取消按钮 |
| 浏览器兼容性 | Safari 限制 | 功能检测 + 降级提示 |
| 转换失败 | 模型不支持 | 详细的错误日志 + 建议 |

## 8. 目录结构实现

```
onnx2anything/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   │   ├── ModelUploader.tsx      # 模型上传
│       │   │   ├── ConverterPanel.tsx     # 转换控制面板
│       │   │   ├── ProgressTracker.tsx    # 进度追踪
│       │   │   └── ModelViewer.tsx        # 模型可视化
│       │   ├── workers/
│       │   │   └── converter.worker.ts    # Pyodide Worker
│       │   ├── hooks/
│       │   │   ├── usePyodide.ts          # Pyodide 管理
│       │   │   └── useConversion.ts       # 转换逻辑
│       │   └── utils/
│       │       └── modelValidator.ts      # 模型验证
│       ├── public/
│       │   └── pyodide/                   # Pyodide 静态资源
│       └── package.json
│
├── packages/
│   └── wasm-converter/
│       ├── python/
│       │   ├── converters/
│       │   │   ├── __init__.py
│       │   │   ├── tflite_converter.py
│       │   │   └── coreml_converter.py
│       │   ├── utils/
│       │   │   └── model_utils.py
│       │   └── entry.py                   # Pyodide 入口
│       └── package.json
│
├── tests/
│   ├── fixtures/
│   │   ├── yolov5n.onnx
│   │   ├── yolov8n.onnx
│   │   └── resnet50.onnx
│   ├── unit/
│   └── e2e/
│
└── docker/
    ├── pyodide-builder/                   # 自定义 Pyodide 构建
    └── dev.yml
```

## 9. 关键依赖版本

```json
{
  "pyodide": "^0.25.0",
  "comlink": "^4.4.1",
  "onnx": "1.15.0",
  "onnx-simplifier": "0.4.0",
  "onnx2tf": "1.22.0",
  "tensorflow": "2.15.0",
  "coremltools": "7.0"
}
```

## 10. 开发里程碑

### Phase 1: 基础架构 (Week 1)
- [x] 环境配置和 Docker 设置
- [x] Pyodide 集成和 Worker 架构
- [x] 基础文件上传/下载功能

### Phase 2: ONNX 转 TFLite (Week 2)
- [ ] onnx2tf 在 Pyodide 中的集成
- [ ] TFLite 转换流程实现
- [ ] YOLOv5 测试验证

### Phase 3: 扩展格式 (Week 3)
- [ ] Core ML 转换支持
- [ ] INT8/FP16 量化支持
- [ ] 更多测试模型

### Phase 4: 优化和发布 (Week 4)
- [ ] 性能优化
- [ ] 错误处理和用户反馈
- [ ] 文档完善
