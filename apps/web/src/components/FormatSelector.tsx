import React from 'react';
import {
  Smartphone,
  Cpu,
  Rocket,
  Zap,
  Check,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { cn } from '../utils/cn';

export type TargetFormat = 'tflite' | 'openvino' | 'ncnn' | 'mnn' | 'paddlelite' | 'tnn';

export interface FormatOption {
  value: TargetFormat;
  label: string;
  shortLabel: string;
  description: string;
  detailedDescription: string;
  status: 'ready' | 'coming' | 'beta';
  platforms: string[];
  features: string[];
  limitations?: string[];
}

export const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'tflite',
    label: 'TensorFlow Lite',
    shortLabel: 'TFLite',
    description: '适用于 Android 和嵌入式设备',
    detailedDescription:
      'TensorFlow Lite 是 Google 推出的轻量级机器学习推理框架，专为移动设备和嵌入式设备优化。支持 GPU 加速和 NNAPI。',
    status: 'ready',
    platforms: ['Android', 'iOS', '嵌入式 Linux', 'MCU'],
    features: [
      '支持 GPU 加速 (GPU Delegate)',
      '支持 NNAPI (Android Neural Networks API)',
      '支持量化 (INT8, FP16)',
      '支持 XNNPACK 优化',
    ],
    limitations: ['某些 ONNX 算子可能不支持', '动态形状限制'],
  },
  {
    value: 'openvino',
    label: 'OpenVINO',
    shortLabel: 'OpenVINO',
    description: '适用于 Intel 硬件加速',
    detailedDescription:
      'Intel OpenVINO 工具包专为 Intel 硬件优化，支持 CPU、GPU、VPU 等多种设备加速推理。',
    status: 'beta',
    platforms: ['Intel CPU', 'Intel GPU', 'Intel NPU', 'ARM'],
    features: [
      'Intel 硬件深度优化',
      '支持动态输入尺寸',
      '模型优化工具 (MO)',
      '支持 INT8 量化',
      '跨平台支持',
    ],
    limitations: ['Intel 硬件效果最佳', '转换时间较长'],
  },
  {
    value: 'ncnn',
    label: 'NCNN',
    shortLabel: 'NCNN',
    description: '腾讯开源移动端推理框架',
    detailedDescription:
      'NCNN 是腾讯开源的高性能神经网络推理框架，专为移动端优化，无第三方依赖，体积小巧。',
    status: 'beta',
    platforms: ['Android', 'iOS', 'Linux', 'Windows', 'macOS'],
    features: [
      '无第三方依赖',
      '支持 Vulkan GPU 加速',
      'ARM NEON 优化',
      '体积小巧 (核心 < 1MB)',
      '支持 int8 量化推理',
    ],
    limitations: ['算子支持相对较少', '社区支持有限'],
  },
  {
    value: 'mnn',
    label: 'MNN',
    shortLabel: 'MNN',
    description: '阿里巴巴开源移动端推理框架',
    detailedDescription:
      'MNN (Matrix-based Neural Network) 是阿里巴巴开源的轻量级深度学习推理引擎，支持异构设备调度。',
    status: 'beta',
    platforms: ['Android', 'iOS', 'Linux', 'Windows', 'macOS'],
    features: [
      '异构设备调度',
      '支持 Metal (iOS)',
      '支持 OpenCL',
      '支持 Vulkan',
      '模型压缩功能',
    ],
    limitations: ['文档相对较少', '算子兼容性待验证'],
  },
  {
    value: 'paddlelite',
    label: 'Paddle Lite',
    shortLabel: 'PaddleLite',
    description: '飞桨移动端推理框架',
    detailedDescription:
      'Paddle Lite 是飞桨在移动端与边缘设备上的轻量化推理引擎，支持 ARM、x86 与多种端侧硬件。',
    status: 'beta',
    platforms: ['Android', 'iOS', 'ARM Linux', 'x86 Linux'],
    features: [
      '支持 ARM/FP16 优化',
      '轻量部署与子图融合',
      '支持多后端执行',
      '适配 Paddle 生态模型',
      '面向端侧性能优化',
    ],
    limitations: ['ONNX 直转链路复杂', '工具链 WASM 化成本高'],
  },
  {
    value: 'tnn' as TargetFormat,
    label: 'TNN',
    shortLabel: 'TNN',
    description: '腾讯开源跨平台推理框架',
    detailedDescription:
      'TNN (Tencent Neural Network) 是腾讯开源的高性能跨平台推理框架，输出 `.tnnproto + .tnnmodel` 双文件，适合 Android、iOS 和嵌入式 Linux 部署。',
    status: 'beta',
    platforms: ['Android', 'iOS', 'Linux', 'macOS', 'Windows'],
    features: [
      'CPU-only 轻量部署',
      '双文件输出（.tnnproto + .tnnmodel）',
      '腾讯内部大规模验证',
      '支持量化推理 (FP16)',
    ],
    limitations: ['需预编译 convert2tnn WASM 工具链', '浏览器端当前处于实验阶段'],
  },
];

export interface FormatSelectorProps {
  value: TargetFormat;
  onChange: (value: TargetFormat) => void;
  disabled?: boolean;
  showDetails?: boolean;
  className?: string;
}

/**
 * 目标格式选择组件
 * 带图标、描述和详细信息的格式选择器
 */
export const FormatSelector: React.FC<FormatSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  showDetails = true,
  className,
}) => {
  const selectedFormat = FORMAT_OPTIONS.find((f) => f.value === value);

  const getIcon = (format: TargetFormat, isSelected: boolean) => {
    const iconClass = cn(
      'w-5 h-5',
      isSelected ? 'text-primary' : 'text-muted-foreground'
    );

    switch (format) {
      case 'tflite':
        return <Smartphone className={iconClass} />;
      case 'openvino':
        return <Cpu className={iconClass} />;
      case 'ncnn':
        return <Rocket className={iconClass} />;
      case 'mnn':
        return <Zap className={iconClass} />;
      case 'tnn':
        return <Cpu className={iconClass} />;
      default:
        return <Smartphone className={iconClass} />;
    }
  };

  const getStatusBadge = (status: FormatOption['status']) => {
    switch (status) {
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded">
            <Check className="w-3 h-3" />
            可用
          </span>
        );
      case 'beta':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 rounded">
            <AlertCircle className="w-3 h-3" />
            Beta
          </span>
        );
      case 'coming':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
            <Clock className="w-3 h-3" />
            即将推出
          </span>
        );
    }
  };

  return (
    <div className={cn('w-full space-y-4', className)}>
      {/* 格式选项网格 */}
      <div className="grid gap-2">
        {FORMAT_OPTIONS.map((format) => {
          const isSelected = value === format.value;
          const isAvailable = format.status === 'ready' || format.status === 'beta';

          return (
            <button
              key={format.value}
              onClick={() => isAvailable && !disabled && onChange(format.value)}
              disabled={!isAvailable || disabled}
              className={cn(
                'relative flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-muted-foreground/25',
                !isAvailable && 'opacity-50 cursor-not-allowed',
                disabled && 'cursor-not-allowed'
              )}
            >
              {/* 图标 */}
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                  isSelected
                    ? 'bg-primary/10'
                    : 'bg-muted'
                )}
              >
                {getIcon(format.value, isSelected)}
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{format.label}</span>
                  <span className="text-xs text-muted-foreground">
                    ({format.shortLabel})
                  </span>
                  {getStatusBadge(format.status)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format.description}
                </p>
              </div>

              {/* 选中指示器 */}
              {isSelected && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 详细信息面板 */}
      {showDetails && selectedFormat && (
        <div className="p-4 bg-muted/50 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-3">
            {getIcon(selectedFormat.value, true)}
            <h4 className="font-medium">{selectedFormat.label}</h4>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            {selectedFormat.detailedDescription}
          </p>

          {/* 支持平台 */}
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              支持平台
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selectedFormat.platforms.map((platform) => (
                <span
                  key={platform}
                  className="text-[10px] px-2 py-0.5 bg-background rounded border border-border"
                >
                  {platform}
                </span>
              ))}
            </div>
          </div>

          {/* 特性列表 */}
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              主要特性
            </p>
            <ul className="space-y-1">
              {selectedFormat.features.slice(0, 3).map((feature, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 text-xs text-muted-foreground"
                >
                  <Check className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 限制说明 */}
          {selectedFormat.limitations && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                注意事项
              </p>
              <ul className="space-y-1">
                {selectedFormat.limitations.map((limitation, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-xs text-muted-foreground"
                  >
                    <AlertCircle className="w-3 h-3 text-yellow-500 shrink-0 mt-0.5" />
                    <span>{limitation}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FormatSelector;
