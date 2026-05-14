import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { RuntimeFormatMap } from '../lib/formats';
import {
  MAX_MODEL_FILE_SIZE_BYTES,
  getModelSizeLimitMessage,
} from '../lib/modelLimits';

export type ConversionStage =
  | 'idle'
  | 'loading'
  | 'simplifying'
  | 'converting'
  | 'quantizing'
  | 'finalizing'
  | 'done'
  | 'error';

export interface ConversionProgress {
  stage: ConversionStage;
  percent: number;
  message: string;
}

export interface ConversionOptions {
  targetFormat: string;
  quantization: string;
  optimization: boolean;
  simplify?: boolean;
}

export interface ConversionResult {
  buffer: ArrayBuffer;
  filename: string;
  format?: string;
  warnings?: string[];
  metadata?: {
    quantization?: string;
    toolchainId?: string;
    toolchainRuntime?: string;
    [key: string]: unknown;
  };
}

export interface RuntimeInfo {
  environment?: Record<string, unknown>;
  formats?: RuntimeFormatMap;
  status?: string;
}

interface WorkerMessage {
  type: 'progress' | 'result' | 'error' | 'ready' | 'paddle2onnxResult';
  stage?: string;
  percent?: number;
  message?: string;
  buffer?: ArrayBuffer;
  filename?: string;
  error?: string;
  warning?: string;
  result?: Record<string, any> | RuntimeInfo;
}

function deferToast(callback: () => void) {
  setTimeout(callback, 0);
}

export function useConversion() {
  const workerRef = useRef<Worker | null>(null);
  const conversionInFlightRef = useRef(false);
  const paddleResolverRef = useRef<{
    resolve: (buf: ArrayBuffer) => void;
    reject: (err: Error) => void;
  } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState<ConversionProgress>({
    stage: 'idle',
    percent: 0,
    message: '等待开始',
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);

  // 初始化 Worker
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/converter.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const data = event.data;

      switch (data.type) {
        case 'ready':
          if ((data.result as RuntimeInfo | undefined)?.status === 'worker_loaded') {
            worker.postMessage({ type: 'init' });
            break;
          }

          setRuntimeInfo((data.result as RuntimeInfo) ?? null);
          setIsReady(true);
          break;

        case 'progress':
          setProgress({
            stage: data.stage as ConversionStage,
            percent: data.percent || 0,
            message: data.message || '',
          });
          break;

        case 'result':
          conversionInFlightRef.current = false;
          setIsConverting(false);
          setProgress({
            stage: 'done',
            percent: 100,
            message: '转换完成！',
          });
          // If this result is for a pending paddle2onnx call, resolve the promise
          if (paddleResolverRef.current && data.buffer) {
            paddleResolverRef.current.resolve(data.buffer);
            paddleResolverRef.current = null;
            break;
          }
          if (data.buffer && data.filename) {
            const conversionResult = data.result as Record<string, any> | undefined;
            setResult({
              buffer: data.buffer,
              filename: data.filename,
              format: conversionResult?.format,
              warnings: Array.isArray(conversionResult?.warnings)
                ? conversionResult.warnings
                : data.warning
                  ? [data.warning]
                  : undefined,
              metadata: conversionResult?.metadata,
            });
            deferToast(() => toast.success('结果已生成'));
          }
          break;

        case 'error':
          conversionInFlightRef.current = false;
          setIsConverting(false);
          setProgress({
            stage: 'error',
            percent: 0,
            message: '转换失败',
          });
          setError(data.error || '未知错误');
          // Reject any pending paddle2onnx promise
          if (paddleResolverRef.current) {
            paddleResolverRef.current.reject(new Error(data.error || '未知错误'));
            paddleResolverRef.current = null;
          }
          deferToast(() => toast.error(`转换失败: ${data.error}`));
          break;
      }
    };

    worker.onerror = (err) => {
      console.error('Worker error:', err);
      conversionInFlightRef.current = false;
      setError('Worker 初始化失败');
      deferToast(() => toast.error('Worker 初始化失败'));
    };

    // 检查 SharedArrayBuffer 支持
    if (typeof SharedArrayBuffer === 'undefined') {
      deferToast(() => toast.error('您的浏览器不支持 SharedArrayBuffer，请在安全上下文中运行'));
    }

    return () => {
      worker.terminate();
    };
  }, []);

  const startConversion = useCallback(
    async (
      modelBuffer: ArrayBuffer,
      options: ConversionOptions
    ): Promise<void> => {
      if (!workerRef.current) {
        deferToast(() => toast.error('转换器尚未初始化'));
        return;
      }

      if (conversionInFlightRef.current) {
        return;
      }

      if (!isReady) {
        deferToast(() => toast.error('转换环境尚未就绪，请稍后重试'));
        return;
      }

      if (modelBuffer.byteLength > MAX_MODEL_FILE_SIZE_BYTES) {
        const message = getModelSizeLimitMessage();
        setError(message);
        setProgress({
          stage: 'error',
          percent: 0,
          message,
        });
        deferToast(() => toast.error(message));
        return;
      }

      const runtimeCapability = runtimeInfo?.formats?.[options.targetFormat as keyof RuntimeFormatMap];
      if (runtimeCapability && !runtimeCapability.available) {
        const message =
          runtimeCapability.reason ||
          `${options.targetFormat} 工具链当前不可用，请先完成对应的 WASM 编译。`;

        setError(message);
        setProgress({
          stage: 'error',
          percent: 0,
          message,
        });
        deferToast(() => toast.error(message));
        return;
      }

      conversionInFlightRef.current = true;
      setIsConverting(true);
      setError(null);
      setResult(null);
      setProgress({
        stage: 'loading',
        percent: 0,
        message: '正在初始化转换环境...',
      });

      const transferableModelBuffer = modelBuffer.slice(0);

      workerRef.current.postMessage(
        {
          type: 'convert',
          modelBuffer: transferableModelBuffer,
          targetFormat: options.targetFormat,
          quantization: options.quantization,
          optimization: options.optimization,
          options: { simplify: options.simplify ?? false },
        },
        [transferableModelBuffer]
      );
    },
    [isReady, runtimeInfo]
  );

  const convertPaddleToOnnx = useCallback(
    async (modelBuffer: ArrayBuffer, paramsBuffer?: ArrayBuffer): Promise<ArrayBuffer> => {
      if (!workerRef.current) {
        throw new Error('转换器尚未初始化');
      }
      if (!isReady) {
        throw new Error('转换环境尚未就绪，请稍后重试');
      }
      if (paddleResolverRef.current) {
        throw new Error('PaddlePaddle 转换正在进行中');
      }

      return new Promise<ArrayBuffer>((resolve, reject) => {
        paddleResolverRef.current = { resolve, reject };

        const modelCopy = modelBuffer.slice(0);
        const transferables: ArrayBuffer[] = [modelCopy];
        const msg: Record<string, unknown> = {
          type: 'paddle2onnx',
          modelBuffer: modelCopy,
        };

        if (paramsBuffer && paramsBuffer.byteLength > 0) {
          const paramsCopy = paramsBuffer.slice(0);
          transferables.push(paramsCopy);
          msg.paramsBuffer = paramsCopy;
        }

        workerRef.current!.postMessage(msg, transferables);
      });
    },
    [isReady]
  );

  const reset = useCallback(() => {
    conversionInFlightRef.current = false;
    setIsConverting(false);
    setProgress({
      stage: 'idle',
      percent: 0,
      message: '等待开始',
    });
    setError(null);
    setResult(null);
  }, []);

  const downloadResult = useCallback(() => {
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

    deferToast(() => toast.success('文件下载已开始'));
  }, [result]);

  return {
    isReady,
    isConverting,
    progress,
    error,
    result,
    runtimeInfo,
    startConversion,
    convertPaddleToOnnx,
    downloadResult,
    reset,
  };
}
