export type TargetFormat =
  | 'tflite'
  | 'openvino'
  | 'ncnn'
  | 'mnn'
  | 'paddlelite'
  | 'tnn'
  | 'tengine';

export type FormatStatus = 'ready' | 'beta' | 'coming';
export type RuntimeAvailability = 'available' | 'requires-toolchain' | 'unavailable';

export interface BaseFormatDefinition {
  value: TargetFormat;
  label: string;
  shortLabel: string;
  description: string;
  detailedDescription: string;
  status: FormatStatus;
  platforms: string[];
  features: string[];
  limitations?: string[];
}

export interface RuntimeFormatCapability {
  available: boolean;
  runtime: RuntimeAvailability;
  wasmSupported: boolean;
  reason?: string;
}

export type RuntimeFormatMap = Partial<Record<TargetFormat, RuntimeFormatCapability>>;

export interface ResolvedFormatDefinition extends BaseFormatDefinition {
  runtimeCapability: RuntimeFormatCapability;
}

const unavailableByDefault = (): RuntimeFormatCapability => ({
  available: false,
  runtime: 'requires-toolchain',
  wasmSupported: false,
});

export const BASE_FORMAT_DEFINITIONS: BaseFormatDefinition[] = [
  {
    value: 'tflite',
    label: 'TensorFlow Lite',
    shortLabel: 'TFLite',
    description: '适用于 Android 和嵌入式设备',
    detailedDescription:
      'TensorFlow Lite 是 Google 推出的轻量级机器学习推理框架，专为移动设备和嵌入式设备优化。支持 GPU Delegate、NNAPI 和常见量化流程。',
    status: 'ready',
    platforms: ['Android', 'iOS', '嵌入式 Linux', 'MCU'],
    features: [
      '支持 FP16 / INT8 / 动态量化',
      '适合移动端和轻量边缘设备',
      '可配合模型简化流程降低体积',
    ],
    limitations: ['某些 ONNX 算子在浏览器内转换链路中仍可能失败', '大模型转换耗时较长'],
  },
  {
    value: 'openvino',
    label: 'OpenVINO',
    shortLabel: 'OpenVINO',
    description: '适用于 Intel CPU / NPU 的 CPU-only 导出链路',
    detailedDescription:
      'OpenVINO 当前在本项目中以 CPU-only / native fallback 为主，适合 Intel CPU、部分 NPU 和边缘盒子部署场景。',
    status: 'beta',
    platforms: ['Intel CPU', 'Intel NPU', 'x86 Linux', 'ARM'],
    features: ['IR 输出', '边缘部署友好', '支持 native/container fallback'],
    limitations: ['当前不提供浏览器内 GPU 绑定导出', '浏览器端 WASM 工具链成本高，现阶段建议走 native fallback'],
  },
  {
    value: 'ncnn',
    label: 'NCNN',
    shortLabel: 'NCNN',
    description: '腾讯开源 CPU-only 轻量推理框架',
    detailedDescription:
      'NCNN 专注移动端和边缘端 CPU-only 部署，输出 `.param + .bin` 结构，适合 Android、iOS 和跨平台轻量推理场景。',
    status: 'beta',
    platforms: ['Android', 'iOS', 'Linux', 'Windows', 'macOS'],
    features: ['无第三方运行时依赖', '体积小巧', '适合端侧 CPU 部署'],
    limitations: ['需预编译 onnx2ncnn 的 WASM 工具链', '当前能力矩阵不包含 TensorRT 或其他 GPU 绑定后端'],
  },
  {
    value: 'mnn',
    label: 'MNN',
    shortLabel: 'MNN',
    description: '阿里巴巴开源 CPU-only 轻量推理框架',
    detailedDescription:
      'MNN 适合移动端和轻量边缘设备的 CPU-only 部署，输出单个 `.mnn` 模型，支持浏览器链路与 native fallback 协同。',
    status: 'beta',
    platforms: ['Android', 'iOS', 'Linux', 'Windows', 'macOS'],
    features: ['单文件模型产物', '面向端侧性能优化', '支持浏览器导出 + native fallback'],
    limitations: ['需预编译 MNNConvert 的 WASM 工具链', '大模型在浏览器里仍可能 OOM，且当前能力矩阵明确排除 GPU/TensorRT 绑定后端'],
  },
  {
    value: 'paddlelite',
    label: 'Paddle Lite',
    shortLabel: 'PaddleLite',
    description: '飞桨 CPU-only 端侧推理框架',
    detailedDescription:
      'Paddle Lite 适配 ARM 和轻量边缘设备的 CPU-only 部署，适用于 Paddle 生态模型和部分国产硬件场景。',
    status: 'beta',
    platforms: ['Android', 'iOS', 'ARM Linux', 'x86 Linux'],
    features: ['轻量部署', 'native/container fallback 已验证', '适配 Paddle 生态'],
    limitations: ['前半段 ONNX -> Paddle 仍依赖 x2paddle + paddle Python 运行时', '当前能力矩阵明确排除 TensorRT / GPU 绑定后端'],
  },
  {
    value: 'tnn',
    label: 'TNN',
    shortLabel: 'TNN',
    description: '腾讯开源跨平台推理框架，支持 Android / iOS / ARM',
    detailedDescription:
      'TNN（Tencent Neural Network）是腾讯开源的高性能跨平台推理框架，支持 Android、iOS、macOS 和嵌入式 Linux。输出 `.tnnproto + .tnnmodel` 双文件结构，适合移动端和边缘设备部署。',
    status: 'beta',
    platforms: ['Android', 'iOS', 'Linux', 'macOS', 'Windows'],
    features: ['双文件输出（.tnnproto + .tnnmodel）', '适合移动端 CPU-only 部署', '腾讯内部大规模验证'],
    limitations: ['需预编译 convert2tnn 的 WASM 工具链', 'GPU 绑定后端暂不包含'],
  },
  {
    value: 'tengine',
    label: 'Tengine',
    shortLabel: 'Tengine',
    description: 'OAID 开源 ARM 端侧推理框架，适合 IoT 和嵌入式设备',
    detailedDescription:
      'Tengine 是 OPEN AI LAB (OAID) 开源的轻量级端侧推理框架，专为 ARM Cortex-A 和嵌入式 AI 芯片优化。输出单一 `.tmfile` 格式，支持 Android、Linux、RISC-V 等平台。',
    status: 'beta',
    platforms: ['Android', 'Linux', 'ARM Cortex-A', 'RISC-V', 'IoT'],
    features: ['单文件输出（.tmfile）', '专为 ARM IoT 场景优化', '轻量级运行时'],
    limitations: ['需预编译 convert_tool 的 WASM 工具链', 'GPU 后端暂不包含'],
  },
];

export function getBaseFormatDefinition(format: TargetFormat): BaseFormatDefinition {
  const match = BASE_FORMAT_DEFINITIONS.find((item) => item.value === format);
  if (!match) {
    throw new Error(`Unknown target format: ${format}`);
  }
  return match;
}

export function resolveFormatDefinitions(runtimeMap: RuntimeFormatMap = {}): ResolvedFormatDefinition[] {
  return BASE_FORMAT_DEFINITIONS.map((definition) => ({
    ...definition,
    runtimeCapability: runtimeMap[definition.value] ?? unavailableByDefault(),
  }));
}

type PythonFormatInfo = {
  wasm_supported?: boolean;
  runtime_status?: string;
  runtime_reason?: string;
};

export function mergeRuntimeFormats(
  pythonFormats: Partial<Record<TargetFormat, PythonFormatInfo>> = {},
  runtimeFormats: RuntimeFormatMap = {}
): RuntimeFormatMap {
  const merged: RuntimeFormatMap = {};

  for (const definition of BASE_FORMAT_DEFINITIONS) {
    const pythonInfo = pythonFormats[definition.value];
    const runtimeInfo = runtimeFormats[definition.value];
    const pythonAvailable = Boolean(pythonInfo?.wasm_supported);

    if (runtimeInfo) {
      merged[definition.value] = runtimeInfo;
      continue;
    }

    if (pythonAvailable) {
      merged[definition.value] = {
        available: true,
        runtime: 'available',
        wasmSupported: true,
        reason: pythonInfo?.runtime_reason,
      };
      continue;
    }

    merged[definition.value] = {
      available: false,
      runtime: definition.status === 'coming' ? 'unavailable' : 'requires-toolchain',
      wasmSupported: false,
      reason: pythonInfo?.runtime_reason,
    };
  }

  return merged;
}
