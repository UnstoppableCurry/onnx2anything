import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  File,
  Check,
  FileWarning,
  Loader2,
  X,
} from 'lucide-react';
import { cn, formatFileSize } from '../utils/cn';
import { MAX_MODEL_FILE_SIZE_MB } from '../lib/modelLimits';

export interface ModelFileInfo {
  file: File;
  name: string;
  size: number;
  format: 'onnx' | 'unknown';
  isValid: boolean;
  error?: string;
}

interface ModelUploaderProps {
  onFileSelect: (fileInfo: ModelFileInfo) => void;
  onFileClear?: () => void;
  disabled?: boolean;
  maxSize?: number;
  className?: string;
  resetToken?: number;
}

// ONNX 文件魔数检测
/**
 * 验证 ONNX 文件魔数
 */
async function validateONNXFile(file: File): Promise<boolean> {
  try {
    const header = await file.slice(0, 16).arrayBuffer();
    const bytes = new Uint8Array(header);
    if (bytes.length === 0) return false;

    // ONNX 是 protobuf 序列化，真实文件常见起始字节是 0x08，
    // 但后续字节会随 metadata/field layout 变化，不能只认固定前 4 字节。
    if (bytes[0] === 0x08) return true;

    // 少数导出器可能在文件头部插入额外信息，这里保留扩展名兜底。
    return file.name.toLowerCase().endsWith('.onnx');
  } catch {
    // 如果无法读取魔数，回退到扩展名验证
    return file.name.endsWith('.onnx');
  }
}

/**
 * 检测模型格式
 */
function detectModelFormat(fileName: string): 'onnx' | 'unknown' {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'onnx':
      return 'onnx';
    default:
      return 'unknown';
  }
}

export const ModelUploader: React.FC<ModelUploaderProps> = ({
  onFileSelect,
  onFileClear,
  disabled = false,
  maxSize = MAX_MODEL_FILE_SIZE_MB,
  className,
  resetToken = 0,
}) => {
  const [isValidating, setIsValidating] = useState(false);
  const [fileInfo, setFileInfo] = useState<ModelFileInfo | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndProcessFile = useCallback(
    async (file: File): Promise<ModelFileInfo> => {
      const format = detectModelFormat(file.name);

      // 验证文件类型
      if (format === 'unknown') {
        return {
          file,
          name: file.name,
          size: file.size,
          format,
          isValid: false,
          error: '不支持的文件格式，请上传 ONNX 格式文件 (.onnx)',
        };
      }

      // 验证文件大小
      const maxSizeBytes = maxSize * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        return {
          file,
          name: file.name,
          size: file.size,
          format,
          isValid: false,
          error: `文件大小超过 ${maxSize}MB 限制`,
        };
      }

      // 验证空文件
      if (file.size === 0) {
        return {
          file,
          name: file.name,
          size: file.size,
          format,
          isValid: false,
          error: '文件为空，请选择有效的 ONNX 模型文件',
        };
      }

      // 验证 ONNX 魔数
      const isValidMagic = await validateONNXFile(file);
      if (!isValidMagic) {
        return {
          file,
          name: file.name,
          size: file.size,
          format,
          isValid: false,
          error: '文件格式验证失败，请确保上传的是有效的 ONNX 模型',
        };
      }

      return {
        file,
        name: file.name,
        size: file.size,
        format,
        isValid: true,
      };
    },
    [maxSize]
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setDragError(null);

      if (acceptedFiles.length === 0) {
        return;
      }

      const file = acceptedFiles[0];
      setIsValidating(true);

      try {
        const info = await validateAndProcessFile(file);
        setFileInfo(info);
        onFileSelect(info);
      } finally {
        setIsValidating(false);
      }
    },
    [onFileSelect, validateAndProcessFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
      onDrop,
      accept: {
        'application/octet-stream': ['.onnx'],
      },
      maxSize: maxSize * 1024 * 1024,
      maxFiles: 1,
      disabled: disabled || isValidating,
      onDropRejected: (rejections) => {
        const rejection = rejections[0];
        if (rejection?.errors[0]?.code === 'file-too-large') {
          setDragError(`文件太大，最大支持 ${maxSize}MB`);
        } else {
          setDragError('文件类型不支持，请上传 .onnx 文件');
        }
      },
    });

  const handleClear = useCallback(() => {
    setFileInfo(null);
    setDragError(null);
    onFileClear?.();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [onFileClear]);

  useEffect(() => {
    setFileInfo(null);
    setDragError(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [resetToken]);

  return (
    <div className={cn('w-full space-y-3', className)} data-testid="model-uploader">
      {/* 拖拽上传区域 */}
      <div
        {...getRootProps()}
        data-testid="model-dropzone"
        className={cn(
          'relative border-2 border-dashed rounded-xl p-8',
          'transition-all duration-200 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isDragActive && 'border-primary bg-primary/5 scale-[1.02]',
          !isDragActive && !disabled && 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30',
          disabled && 'opacity-50 cursor-not-allowed',
          fileInfo?.isValid && 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20',
          fileInfo && !fileInfo.isValid && 'border-destructive/50 bg-destructive/5'
        )}
      >
        <input {...getInputProps()} ref={inputRef} data-testid="model-file-input" />

        <div className="flex flex-col items-center justify-center gap-4">
          {isValidating ? (
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 rounded-full bg-muted">
                <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
              </div>
              <p className="text-sm text-muted-foreground">正在验证文件...</p>
            </div>
          ) : fileInfo?.isValid ? (
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <Check className="w-8 h-8" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">{fileInfo.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(fileInfo.size)} • ONNX 模型
                </p>
              </div>
              {!disabled && (
                <p className="text-xs text-muted-foreground">
                  点击或拖拽替换文件
                </p>
              )}
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'p-4 rounded-full transition-colors',
                  isDragActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {isDragActive ? (
                  <File className="w-8 h-8" />
                ) : (
                  <Upload className="w-8 h-8" />
                )}
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">
                  {isDragActive ? '释放以上传' : '点击或拖拽上传 ONNX 模型'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  支持 .onnx 格式，最大 {maxSize}MB
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-0.5 bg-muted rounded">ONNX</span>
                <span>格式检测自动开启</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {(dragError || fileInfo?.error) && (
        <div
          className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
          data-testid="model-upload-error"
        >
          <FileWarning className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">上传失败</p>
            <p className="text-sm text-destructive/80 mt-0.5">
              {dragError || fileInfo?.error}
            </p>
          </div>
          <button
            onClick={handleClear}
            className="p-1 hover:bg-destructive/10 rounded transition-colors"
            data-testid="clear-model-error"
          >
            <X className="w-4 h-4 text-destructive" />
          </button>
        </div>
      )}

      {/* 文件信息卡片 */}
      {fileInfo?.isValid && (
        <div
          className="p-4 bg-muted/50 rounded-lg flex items-center gap-3"
          data-testid="model-file-card"
        >
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <File className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" data-testid="model-file-name">
              {fileInfo.name}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatFileSize(fileInfo.size)}</span>
              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
              <span className="text-green-600 dark:text-green-400">验证通过</span>
            </div>
          </div>
          {!disabled && (
            <button
              onClick={handleClear}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              title="移除文件"
              data-testid="clear-model-file"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ModelUploader;
