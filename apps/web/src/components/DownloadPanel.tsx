import React, { useCallback } from 'react';
import {
  Download,
  FileCode,
  RotateCcw,
  Check,
} from 'lucide-react';
import { cn, formatFileSize } from '../utils/cn';

export interface ConversionResult {
  buffer: ArrayBuffer;
  filename: string;
  format: string;
  originalSize?: number;
  conversionTime?: number; // in seconds
  warnings?: string[];
  metadata?: {
    modelSize?: number;
    opsetVersion?: number;
    quantization?: string;
  };
}

interface DownloadPanelProps {
  result: ConversionResult | null;
  onReset?: () => void;
  onDownload?: () => void;
  className?: string;
}

/**
 * 转换结果下载面板
 * 显示转换结果信息并提供下载功能
 */
export const DownloadPanel: React.FC<DownloadPanelProps> = ({
  result,
  onReset,
  onDownload,
  className,
}) => {
  const handleDownload = useCallback(() => {
    if (!result) return;

    const blob = new Blob([result.buffer], {
      type: 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onDownload?.();
  }, [result, onDownload]);

  if (!result) {
    return null;
  }

  const convertedSize = result.buffer.byteLength;

  return (
    <div
      className={cn(
        'w-full bg-card rounded-xl border border-border overflow-hidden',
        className
      )}
      data-testid="download-panel"
    >
      <div className="p-4 border-b border-border bg-green-50/50 dark:bg-green-900/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="font-semibold text-green-700 dark:text-green-300">
              转换成功
            </h3>
            <p className="text-xs text-green-600/80 dark:text-green-400/80">
              模型已成功转换为 {result.format.toUpperCase()} 格式
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-muted rounded-lg">
            <FileCode className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-0.5">导出文件</p>
            <p className="font-medium truncate">{result.filename}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">结果大小</p>
            <p className="font-semibold">{formatFileSize(convertedSize)}</p>
          </div>
          {result.originalSize && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">原始大小</p>
              <p className="font-semibold">
                {formatFileSize(result.originalSize)}
              </p>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          文件仅保存在当前浏览器会话里，下载后再关闭页面。
        </p>
      </div>

      <div className="p-4 border-t border-border space-y-3">
        <button
          onClick={handleDownload}
          data-testid="download-result"
          className={cn(
            'w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'shadow-sm hover:shadow-md transition-all active:scale-[0.98]'
          )}
        >
          <Download className="w-5 h-5" />
          下载转换后的模型
        </button>

        <div className="flex gap-2">
          {onReset && (
            <button
              onClick={onReset}
              data-testid="reset-conversion"
              className={cn(
                'flex-1 py-2.5 px-4 rounded-lg font-medium flex items-center justify-center gap-2',
                'border border-border bg-background hover:bg-muted',
                'transition-all active:scale-[0.98]'
              )}
            >
              <RotateCcw className="w-4 h-4" />
              转换其他模型
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DownloadPanel;
