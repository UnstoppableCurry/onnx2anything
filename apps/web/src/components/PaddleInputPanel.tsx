import React, { useCallback, useRef, useState } from 'react';
import { Upload, File, X, ArrowRight, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn, formatFileSize } from '../utils/cn';

export interface PaddleInputPanelProps {
  onOnnxReady: (onnxBuffer: ArrayBuffer, filename: string) => void;
  convertPaddleToOnnx: (modelBuffer: ArrayBuffer, paramsBuffer?: ArrayBuffer) => Promise<ArrayBuffer>;
  disabled?: boolean;
  className?: string;
  resetToken?: number;
}

type ConvertStatus = 'idle' | 'converting' | 'done' | 'error';

export const PaddleInputPanel: React.FC<PaddleInputPanelProps> = ({
  onOnnxReady,
  convertPaddleToOnnx,
  disabled = false,
  className,
  resetToken = 0,
}) => {
  const [pdmodelFile, setPdmodelFile] = useState<File | null>(null);
  const [pdiparamsFile, setPdiparamsFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ConvertStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const pdmodelRef = useRef<HTMLInputElement>(null);
  const pdiparamsRef = useRef<HTMLInputElement>(null);

  // Reset when resetToken changes
  React.useEffect(() => {
    setPdmodelFile(null);
    setPdiparamsFile(null);
    setStatus('idle');
    setError(null);
    setErrorDetails(null);
    if (pdmodelRef.current) pdmodelRef.current.value = '';
    if (pdiparamsRef.current) pdiparamsRef.current.value = '';
  }, [resetToken]);

  const handlePdmodelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPdmodelFile(file);
    setStatus('idle');
    setError(null);
    setErrorDetails(null);
  }, []);

  const handlePdiparamsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPdiparamsFile(file);
    setStatus('idle');
    setError(null);
    setErrorDetails(null);
  }, []);

  const handleClearPdmodel = useCallback(() => {
    setPdmodelFile(null);
    if (pdmodelRef.current) pdmodelRef.current.value = '';
    setStatus('idle');
    setError(null);
    setErrorDetails(null);
  }, []);

  const handleClearPdiparams = useCallback(() => {
    setPdiparamsFile(null);
    if (pdiparamsRef.current) pdiparamsRef.current.value = '';
  }, []);

  const handleConvert = useCallback(async () => {
    if (!pdmodelFile) return;

    setStatus('converting');
    setError(null);
    setErrorDetails(null);

    try {
      const modelBuffer = await pdmodelFile.arrayBuffer();
      let paramsBuffer: ArrayBuffer | undefined;
      if (pdiparamsFile) {
        paramsBuffer = await pdiparamsFile.arrayBuffer();
      }

      const onnxBuffer = await convertPaddleToOnnx(modelBuffer, paramsBuffer);
      setStatus('done');

      const baseName = pdmodelFile.name.replace(/\.pdmodel$/i, '');
      onOnnxReady(onnxBuffer, `${baseName}.onnx`);
    } catch (err) {
      setStatus('error');
      const msg = err instanceof Error ? err.message : String(err);
      // Check for the "not available in browser" error and surface recommendation
      if (msg.includes('paddle2onnx') || msg.includes('Pyodide') || msg.includes('polygraphy')) {
        setError('paddle2onnx 当前无法在浏览器中运行');
        setErrorDetails(
          '依赖项 polygraphy 尚未提供 WASM 兼容 wheel。\n' +
          '请在本地使用: pip install paddle2onnx && ' +
          'paddle2onnx --model_dir <dir> --model_filename model.pdmodel ' +
          '--params_filename model.pdiparams --save_file output.onnx'
        );
      } else {
        setError(msg);
      }
    }
  }, [pdmodelFile, pdiparamsFile, convertPaddleToOnnx, onOnnxReady]);

  const canConvert = !!pdmodelFile && status !== 'converting' && !disabled;

  return (
    <div className={cn('space-y-4', className)} data-testid="paddle-input-panel">
      {/* .pdmodel file */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          模型文件 <span className="text-muted-foreground font-normal">(.pdmodel)</span>
          <span className="text-destructive ml-1">*</span>
        </label>

        {pdmodelFile ? (
          <div
            className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border"
            data-testid="pdmodel-file-card"
          >
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded">
              <File className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{pdmodelFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(pdmodelFile.size)}</p>
            </div>
            <button
              onClick={handleClearPdmodel}
              disabled={disabled || status === 'converting'}
              className="p-1.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
              data-testid="clear-pdmodel-file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <label
            className={cn(
              'flex items-center gap-3 p-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
              'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            data-testid="pdmodel-upload-label"
          >
            <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">点击选择 .pdmodel 文件</span>
            <input
              ref={pdmodelRef}
              type="file"
              accept=".pdmodel"
              className="sr-only"
              disabled={disabled}
              onChange={handlePdmodelChange}
              data-testid="pdmodel-file-input"
            />
          </label>
        )}
      </div>

      {/* .pdiparams file (optional) */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          参数文件 <span className="text-muted-foreground font-normal">(.pdiparams，可选)</span>
        </label>

        {pdiparamsFile ? (
          <div
            className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border"
            data-testid="pdiparams-file-card"
          >
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded">
              <File className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{pdiparamsFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(pdiparamsFile.size)}</p>
            </div>
            <button
              onClick={handleClearPdiparams}
              disabled={disabled || status === 'converting'}
              className="p-1.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
              data-testid="clear-pdiparams-file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <label
            className={cn(
              'flex items-center gap-3 p-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
              'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            data-testid="pdiparams-upload-label"
          >
            <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">点击选择 .pdiparams 文件（静态图模型必须提供）</span>
            <input
              ref={pdiparamsRef}
              type="file"
              accept=".pdiparams"
              className="sr-only"
              disabled={disabled}
              onChange={handlePdiparamsChange}
              data-testid="pdiparams-file-input"
            />
          </label>
        )}
      </div>

      {/* Convert button */}
      <button
        onClick={handleConvert}
        disabled={!canConvert}
        data-testid="paddle2onnx-convert-btn"
        className={cn(
          'w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all',
          canConvert
            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md active:scale-[0.98]'
            : 'bg-muted text-muted-foreground cursor-not-allowed'
        )}
      >
        {status === 'converting' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            正在转换为 ONNX...
          </>
        ) : status === 'done' ? (
          <>
            <CheckCircle className="w-4 h-4" />
            已转换为 ONNX，重新转换
          </>
        ) : (
          <>
            <ArrowRight className="w-4 h-4" />
            转换为 ONNX
          </>
        )}
      </button>

      {/* Status messages */}
      {status === 'done' && (
        <div
          className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
          data-testid="paddle2onnx-success"
        >
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-300">
            PaddlePaddle → ONNX 转换成功！可继续选择输出格式。
          </p>
        </div>
      )}

      {status === 'error' && error && (
        <div
          className="space-y-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
          data-testid="paddle2onnx-error"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
          {errorDetails && (
            <pre className="text-xs text-destructive/80 whitespace-pre-wrap break-all font-mono leading-relaxed pl-6">
              {errorDetails}
            </pre>
          )}
        </div>
      )}

      {/* Format hint */}
      <p className="text-xs text-muted-foreground">
        支持静态图格式（新版 .pdmodel + .pdiparams）和旧版格式（__model__ + __params__，请分别重命名为对应扩展名后上传）。
      </p>
    </div>
  );
};

export default PaddleInputPanel;
