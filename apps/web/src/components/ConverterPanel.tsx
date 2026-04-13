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
              onOptionsChange({ ...options, targetFormat: format });
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
