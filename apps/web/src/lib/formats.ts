export type TargetFormat =
  | 'tflite'
  | 'openvino'
  | 'ncnn'
  | 'mnn'
  | 'paddlelite';

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
    description: '适用于 Intel 硬件加速',
    detailedDescription:
      'OpenVINO 面向 Intel CPU、GPU 和 NPU，适合 PC、边缘盒子和部分工业推理场景。',
    status: 'beta',
    platforms: ['Intel CPU', 'Intel GPU', 'Intel NPU', 'ARM'],
    features: ['Intel 硬件深度优化', '支持 IR 输出', '适配边缘部署'],
    limitations: ['浏览器端 WASM 工具链成本高', '当前建议走 native/container fallback'],
  },
  {
    value: 'ncnn',
    label: 'NCNN',
    shortLabel: 'NCNN',
    description: '腾讯开源移动端推理框架',
    detailedDescription:
      'NCNN 专注移动端部署，输出 `.param + .bin` 结构，适合 Android、iOS 和跨平台轻量推理场景。',
    status: 'beta',
    platforms: ['Android', 'iOS', 'Linux', 'Windows', 'macOS'],
    features: ['无第三方运行时依赖', '体积小巧', '适合端侧部署'],
    limitations: ['需预编译 onnx2ncnn 的 WASM 工具链', '量化链路需继续补齐'],
  },
  {
    value: 'mnn',
    label: 'MNN',
    shortLabel: 'MNN',
    description: '阿里巴巴开源移动端推理框架',
    detailedDescription:
      'MNN 适合移动端和轻量边缘设备，输出单个 `.mnn` 模型，支持多后端调度。',
    status: 'beta',
    platforms: ['Android', 'iOS', 'Linux', 'Windows', 'macOS'],
    features: ['单文件模型产物', '面向端侧性能优化', '支持多后端推理'],
    limitations: ['需预编译 MNNConvert 的 WASM 工具链', '当前前置保护已临时放宽到 100MB 以便手动测试，但大模型在浏览器里仍可能 OOM'],
  },
  {
    value: 'paddlelite',
    label: 'Paddle Lite',
    shortLabel: 'PaddleLite',
    description: '飞桨移动端推理框架',
    detailedDescription:
      'Paddle Lite 适配 ARM 和轻量边缘设备，适用于 Paddle 生态模型和部分国产硬件场景。',
    status: 'beta',
    platforms: ['Android', 'iOS', 'ARM Linux', 'x86 Linux'],
    features: ['轻量部署', '多后端执行', '适配 Paddle 生态'],
    limitations: ['前半段 ONNX -> Paddle 仍依赖 x2paddle + paddle Python 运行时', '当前建议走 native/container export'],
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
