import React from 'react';
import { Loader2, AlertTriangle, X, Clock, RotateCcw } from 'lucide-react';
import { cn } from '../utils/cn';

export type ConversionStage =
  | 'idle'
  | 'loading'
  | 'simplifying'
  | 'converting'
  | 'quantizing'
  | 'finalizing'
  | 'done'
  | 'error'
  | 'cancelled';

const STAGE_LABELS: Record<ConversionStage, string> = {
  idle: '等你开始',
  loading: '准备中',
  simplifying: '整理一下',
  converting: '处理中',
  quantizing: '做量化',
  finalizing: '快好了',
  done: '完成',
  error: '出问题了',
  cancelled: '已取消',
};

interface ProgressTrackerProps {
  stage: ConversionStage;
  percent: number;
  message?: string;
  error?: string;
  elapsedTime?: number; // in seconds
  estimatedTime?: number; // in seconds
  onCancel?: () => void;
  onRetry?: () => void;
  className?: string;
}

/**
 * 格式化时间
 * @param seconds 秒数
 * @returns 格式化后的字符串 (如: "2:30")
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 进度追踪器组件
 * 显示详细的转换进度、阶段指示器、取消按钮
 */
export const ProgressTracker: React.FC<ProgressTrackerProps> = ({
  stage,
  percent,
  message,
  error,
  elapsedTime,
  estimatedTime,
  onCancel,
  onRetry,
  className,
}) => {
  const isActive = stage !== 'idle' && stage !== 'done' && stage !== 'error' && stage !== 'cancelled';
  const isError = stage === 'error';
  const isCancelled = stage === 'cancelled';

  const displayPercent = Math.min(100, Math.max(0, Math.round(percent)));
  const headline = STAGE_LABELS[stage];

  return (
    <div
      className={cn('w-full space-y-4', className)}
      data-testid="conversion-progress"
      data-stage={stage}
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isActive ? (
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            </div>
          ) : isError ? (
            <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
          ) : isCancelled ? (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <X className="w-4 h-4 text-muted-foreground" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div>
            <p className="font-medium">{headline}</p>
            <p className="text-xs text-muted-foreground">
              {isError
                ? '看看下面的原因'
                : isCancelled
                  ? '这次先停下了'
                  : message || '浏览器正在处理，别急。'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isActive && onCancel && (
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              停一下
            </button>
          )}
          {(isError || isCancelled) && onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              再试一次
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">
            {isError ? '失败' : isCancelled ? '已停下' : `${displayPercent}%`}
          </span>
          <span className="text-muted-foreground">
            {elapsedTime !== undefined && (
              <>
                已用 {formatTime(elapsedTime)}
                {estimatedTime !== undefined &&
                  estimatedTime > 0 &&
                  ` / 预计 ${formatTime(estimatedTime)}`}
              </>
            )}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden" data-testid="progress-bar">
          <div
            className={cn(
              'h-full transition-all duration-300 ease-out',
              isError ? 'bg-destructive' : isCancelled ? 'bg-muted-foreground' : 'bg-primary'
            )}
            style={{ width: `${isError || isCancelled ? 100 : displayPercent}%` }}
            data-testid="progress-fill"
          />
        </div>
        {message && !isError && !isCancelled && (
          <p className="text-xs text-muted-foreground">{message}</p>
        )}
      </div>

      {error && (
        <div
          className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg"
          data-testid="conversion-error"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-destructive">出问题了</p>
              <p className="text-sm text-destructive/80 mt-1 break-words">{error}</p>
            </div>
          </div>
          {onRetry && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={onRetry}
                data-testid="retry-conversion"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                再试一次
              </button>
            </div>
          )}
        </div>
      )}

      {isCancelled && (
        <div className="p-4 bg-muted border border-border rounded-lg">
          <div className="flex items-start gap-3">
            <X className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">转换已取消</p>
              <p className="text-sm text-muted-foreground mt-1">
                转换过程已被用户取消，部分文件可能已生成但不可用。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgressTracker;
