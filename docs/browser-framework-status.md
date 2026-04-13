# Browser framework status

更新时间：2026-04-10

## 当前用户范围

本轮用户已明确收敛为：

- 保留：NCNN / MNN / TFLite / Paddle Lite
- 放弃：OpenVINO / TensorRT / Core ML

因此下面的“浏览器状态”与“网页主入口暴露范围”只围绕这 4 条链路维护。

## 当前结论

- **浏览器直转已可用**
  - NCNN
  - MNN
- **已做 native 一致性验证，但暂不开放浏览器直转**
  - TFLite / LiteRT
  - Paddle Lite

## 为什么 TFLite 还不能放回网页主入口

### 当前仓库内的真实 blocker

当前实现依赖 Pyodide + `micropip.install("onnx>=1.15.0")`。  
但 Pyodide / micropip 只能直接安装：

- PyPI 上的 pure Python wheel
- 或 Pyodide 自己构建的 wasm wheel

而 `onnx` 不在当前 Pyodide 官方内建包列表中，且浏览器里会直接报：

- `Can't find a pure Python 3 wheel for 'onnx>=1.15.0'`

所以当前仓库里的 **ONNX -> TFLite 浏览器转换链** 不是小 bug，而是**依赖模型本身不满足 Pyodide 分发条件**。

### 官方资料指向

- Pyodide packages list:
  - https://pyodide.org/en/stable/usage/packages-in-pyodide.html
- Pyodide FAQ / micropip pure-python wheel 说明:
  - https://pyodide.org/en/stable/usage/faq.html#why-can-t-micropip-find-a-pure-python-wheel
- LiteRT conversion overview:
  - https://ai.google.dev/edge/litert/conversion/overview
- LiteRT Web 官方页面:
  - https://ai.google.dev/edge/litert/web

### 关键判断

LiteRT 官方转换 / Web 文档当前重点是：

- 把 **PyTorch / TensorFlow / JAX** 模型转成 LiteRT/TFLite
- 在浏览器里**运行** `.tflite`
- 不是在浏览器里提供现成的 **ONNX -> TFLite** 转换流水线

因此，除非后续：

1. 自己为 Pyodide 构建 `onnx` / `onnx2tf` / 相关依赖的 wasm wheel  
或
2. 找到不依赖这套 Python 栈的全新浏览器转换方案

否则当前 TFLite 应继续保持：

- **native-verified**
- **browser-not-ready**

### 本地 spike 结论

2026-04-10 已在本地用 `pyodide-build` 做过一次前置验证：

- 可以通过 `pyodide skeleton pypi onnx` 生成 `onnx` recipe
- 但在真正开始编 `onnx` 之前，就必须先拉起完整 Pyodide cross-build 环境与 Emscripten SDK
- 这说明 TFLite 浏览器直转若继续推进，本质上已经是“**自建 Pyodide wheel 链**”级别的专项工作，而不是修当前页面里的小 bug

当前最现实的结论仍然是：

- **TFLite native 已验证**
- **TFLite browser 仍未打通**

### 2026-04-13 进一步 spike：首个实际构建阻塞

本地继续把这条路往前推后，已经不再停留在“理论上要自建 wheel”：

- 已安装并激活 Pyodide 交叉编译环境
- 已安装 Emscripten `3.1.58`
- 已把 `onnx` 的 Pyodide recipe 推到真实构建阶段

当前遇到的**首个明确技术阻塞**是：

- `onnx` 1.21.0 在 Pyodide 构建里进入 CMake 阶段后失败
- 失败点是 `find_package(Python3 ...)`
- 报错为：
  - `Could NOT find Python3 (missing: Python3_INCLUDE_DIRS Development.Module Development.SABIModule)`

也就是说，当前阻塞已经从“缺 wheel”推进到了：

- **ONNX 本身的 CMake / Python 开发头 / cross-build 适配问题**

这说明 TFLite 浏览器直转下一步若继续推进，需要处理的不是页面层逻辑，而是：

1. `onnx` 在 Pyodide 下的 CMake 构建适配
2. 之后才轮到 `onnx2tf` / TensorFlow 侧依赖

## 为什么 Paddle Lite 还不能放回网页主入口

### 当前仓库内的真实 blocker

当前仓库已经把 `opt.js/.wasm` 跑通了，但这只是：

- **Paddle inference model -> Paddle Lite `.nb`**

而不是完整的：

- **ONNX -> Paddle Lite**

官方链路要求第三方模型先走 X2Paddle。

### 官方资料指向

- X2Paddle 官方文档：
  - https://www.paddlepaddle.org.cn/inference/master/user_guides/x2paddle.html
- X2Paddle 推理迁移文档（含 `--to_lite=True` 示例）：
  - https://www.paddlepaddle.org.cn/documentation/zh/guides/model_convert/convert_with_x2paddle_cn.html
- Paddle Lite opt 文档：
  - https://www.paddlepaddle.org.cn/lite/v2.12/user_guides/model_optimize_tool.html

### 关键判断

Paddle 官方文档已经说明：

- ONNX 模型要先用 **X2Paddle**
- 再转成 Paddle / Paddle Lite 产物

所以仅把 `opt` 编成 wasm 并不能解决浏览器全链路问题。  
当前 Paddle Lite 仍应保持：

- **native-verified**
- **browser-not-ready**

## 旧版本 Paddle Lite 是否能绕开当前 blocker

当前没有证据表明旧版本能绕开。

官网迁移文档与本地仓库内旧版文档都延续同一条路线：

1. 第三方模型（如 ONNX）先走 **X2Paddle**
2. 再通过 `opt` 生成 Paddle Lite 产物

也就是说，旧版本并没有提供一个：

- 纯浏览器
- 纯 ONNX 输入
- 不依赖 `x2paddle + paddle`

的浏览器直转捷径。

所以“切老版本 Paddle Lite”当前不能解决浏览器直转问题。

## 当前建议

- 浏览器主入口继续只暴露**真实可跑通**的格式
  - NCNN
  - MNN
- TFLite / Paddle Lite 继续保留 native 导出脚本与一致性验证
- 后续若继续攻 TFLite，需要先决定是否接受：
  - 自建 Pyodide wasm wheels
  - 或彻底放弃 Pyodide 方案重做浏览器链

## 当前可执行入口

### 浏览器直转

- NCNN：网页主入口直接选择
- MNN：网页主入口直接选择

### native-only 导出

```bash
# TFLite
npm run export:tflite:native -- <modelPath> <outPath>

# Paddle Lite
npm run export:paddlelite:native -- <modelPath> <outPath>

# MNN（需要强制走 native 时）
npm run export:mnn:native -- <modelPath> <outPath>
```

示例：

```bash
npm run export:tflite:native -- apps/web/public/verify/generated/ppocrv3_dbnet_no_identity.onnx /tmp/dbnet.tflite
npm run export:paddlelite:native -- apps/web/public/verify/generated/ppocrv3_dbnet_no_identity.onnx /tmp/dbnet.nb
npm run export:mnn:native -- apps/web/public/verify/generated/ppocrv3_dbnet_no_identity.onnx /tmp/dbnet.mnn
```

### 一致性验证

```bash
# 全量 real-model 对齐
npm run test:compare:edge:real-model

# 仅验证 MNN
node scripts/compare_edge_framework_outputs.mjs --real-model --frameworks=mnn
```
