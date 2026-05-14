import React from 'react';
import { FileArchive, Layers } from 'lucide-react';
import { cn } from '../utils/cn';
import type { ToolchainManifestEntry } from '../types/toolchains';
import {
  isToolchainSelectable,
} from '../utils/toolchains';

export type TargetFormat = string;
export type QuantizationType = 'none' | 'fp16' | 'int8' | 'dynamic';
export type OptimizationLevel = 'none' | 'basic' | 'aggressive';

export interface ConversionOptions {
  targetFormat: TargetFormat;
  quantization: QuantizationType;
  optimization: boolean;
  optimizationLevel: OptimizationLevel;
  dynamicShapes: boolean;
  inputShape?: string;
  calibrateDataset?: 'none' | 'random' | 'custom';
  verboseLogging: boolean;
  simplify: boolean;
}

export interface ConverterPanelProps {
  options: ConversionOptions;
  formats: ToolchainManifestEntry[];
  onOptionsChange: (options: ConversionOptions) => void;
  onConvert: () => void;
  isConverting: boolean;
  hasModel: boolean;
  isReady?: boolean;
  className?: string;
}

export const DEFAULT_OPTIONS: ConversionOptions = {
  targetFormat: 'ncnn',
  quantization: 'none',
  optimization: true,
  optimizationLevel: 'basic',
  dynamicShapes: false,
  calibrateDataset: 'random',
  verboseLogging: false,
  simplify: false,
};

const QUANTIZATION_OPTIONS: Record<string, QuantizationType[]> = {
  ncnn: ['none', 'fp16'],
  mnn: ['none', 'fp16', 'int8'],
  tnn: ['none', 'fp16'],
  tengine: ['none'],
};

const QUANTIZATION_LABELS: Record<QuantizationType, string> = {
  none: '无量化',
  fp16: 'FP16 半精度',
  int8: 'INT8 整数量化',
  dynamic: '动态量化',
};

export const ConverterPanel: React.FC<ConverterPanelProps> = ({
  options,
  formats,
  onOptionsChange,
  onConvert,
  isConverting,
  hasModel,
  isReady = true,
  className,
}) => {
  const quantOptions = QUANTIZATION_OPTIONS[options.targetFormat] ?? ['none'];
  const showQuantSelect = quantOptions.length > 1;

  return (
    <div className={cn('space-y-5', className)}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <label className="text-sm font-medium">你想导出成什么格式</label>
        </div>
        <select
          value={options.targetFormat}
          name="targetFormat"
          data-testid="target-format-select"
          onChange={(event) => {
            const format = event.target.value;
            const formatInfo = formats.find((entry) => entry.id === format);
            if (formatInfo && isToolchainSelectable(formatInfo)) {
              const newQuantOptions = QUANTIZATION_OPTIONS[format] ?? ['none'];
              const newQuantization = newQuantOptions.includes(options.quantization)
                ? options.quantization
                : 'none';
              onOptionsChange({ ...options, targetFormat: format, quantization: newQuantization });
            }
          }}
          disabled={isConverting || formats.length === 0}
          className={cn(
            'w-full rounded-lg border border-border bg-background px-3 py-3 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-primary/30',
            (isConverting || formats.length === 0) && 'cursor-not-allowed opacity-60'
          )}
        >
          {formats.map((format) => {
            return (
              <option key={format.id} value={format.id}>
                {format.label}
              </option>
            );
          })}
        </select>
        <p className="text-xs text-muted-foreground">
          不知道选哪个就保持默认：<span className="font-medium text-foreground">NCNN</span>。
        </p>
      </div>

      {showQuantSelect && (
        <div className="space-y-2">
          <label className="text-sm font-medium">量化选项</label>
          <select
            value={options.quantization}
            name="quantization"
            data-testid="quantization-select"
            onChange={(event) => {
              onOptionsChange({ ...options, quantization: event.target.value as QuantizationType });
            }}
            disabled={isConverting}
            className={cn(
              'w-full rounded-lg border border-border bg-background px-3 py-3 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary/30',
              isConverting && 'cursor-not-allowed opacity-60'
            )}
          >
            {quantOptions.map((q) => (
              <option key={q} value={q}>{QUANTIZATION_LABELS[q] ?? q}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <input
          type="checkbox"
          id="simplify-checkbox"
          data-testid="simplify-checkbox"
          checked={options.simplify}
          onChange={(event) => onOptionsChange({ ...options, simplify: event.target.checked })}
          disabled={isConverting}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border accent-primary"
        />
        <div>
          <label htmlFor="simplify-checkbox" className="text-sm font-medium cursor-pointer">
            转换前简化模型 (onnxsim)
          </label>
          <p className="text-xs text-muted-foreground mt-0.5">
            使用 onnx-simplifier 移除冗余节点，可提升转换成功率
          </p>
        </div>
      </div>

      <button
        onClick={onConvert}
        data-testid="start-conversion"
        disabled={!hasModel || isConverting || !isReady}
        className={cn(
          'w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all',
          hasModel && !isConverting && isReady
            ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md active:scale-[0.98]'
            : 'bg-muted text-muted-foreground cursor-not-allowed'
        )}
      >
        {isConverting ? (
          <>
            <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            转换中...
          </>
        ) : (
          <>
            <FileArchive className="w-5 h-5" />
            {isReady ? '开始转换' : '转换环境加载中'}
          </>
        )}
      </button>
    </div>
  );
};

export default ConverterPanel;
