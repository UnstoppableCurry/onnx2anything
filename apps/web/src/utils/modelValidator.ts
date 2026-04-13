/**
 * 模型验证工具
 */

import { MAX_MODEL_FILE_SIZE_MB } from '../lib/modelLimits';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  details?: {
    fileName: string;
    fileSize: number;
    fileType: string;
  };
}

export interface FileValidationOptions {
  maxSizeMB: number;
  allowedTypes: string[];
}

/**
 * 验证文件大小
 */
export function validateFileSize(
  file: File,
  options: FileValidationOptions
): ValidationResult {
  const maxSizeBytes = options.maxSizeMB * 1024 * 1024;

  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `文件大小超过限制 (${options.maxSizeMB}MB)`,
      details: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      },
    };
  }

  return {
    valid: true,
    details: {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    },
  };
}

/**
 * 验证文件类型
 */
export function validateFileType(
  file: File,
  options: FileValidationOptions
): ValidationResult {
  const extension = file.name.toLowerCase().split('.').pop();
  const allowedExtensions = options.allowedTypes.map((t) =>
    t.toLowerCase().replace('.', '')
  );

  if (!extension || !allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `不支持的文件类型: .${extension || 'none'}`,
      details: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      },
    };
  }

  return {
    valid: true,
    details: {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    },
  };
}

/**
 * 验证 ONNX 魔数
 */
export async function validateMagicNumber(
  file: File,
  _expectedType: string
): Promise<ValidationResult> {
  try {
    if (file.size === 0) {
      return {
        valid: false,
        error: '文件为空',
        details: {
          fileName: file.name,
          fileSize: 0,
          fileType: file.type,
        },
      };
    }

    const header = await file.slice(0, 8).arrayBuffer();
    const headerBytes = new Uint8Array(header);

    // ONNX 文件以 protobuf 格式开始，第一个字节通常是 0x08
    if (headerBytes[0] !== 0x08 && headerBytes[0] !== 0x00) {
      return {
        valid: false,
        error: '无效的文件格式 (ONNX 魔数不匹配)',
        details: {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        },
      };
    }

    return {
      valid: true,
      details: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: `读取文件失败: ${error instanceof Error ? error.message : '未知错误'}`,
      details: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      },
    };
  }
}

/**
 * 完整 ONNX 文件验证
 */
export async function validateONNXFile(
  file: File | null,
  options?: FileValidationOptions
): Promise<ValidationResult> {
  if (!file) {
    return {
      valid: false,
      error: '未提供文件',
    };
  }

  const defaultOptions: FileValidationOptions = {
    maxSizeMB: MAX_MODEL_FILE_SIZE_MB,
    allowedTypes: ['.onnx'],
  };

  const opts = options || defaultOptions;

  // 验证大小
  const sizeResult = validateFileSize(file, opts);
  if (!sizeResult.valid) {
    return sizeResult;
  }

  // 验证类型
  const typeResult = validateFileType(file, opts);
  if (!typeResult.valid) {
    return typeResult;
  }

  // 验证魔数
  const magicResult = await validateMagicNumber(file, 'onnx');
  if (!magicResult.valid) {
    return magicResult;
  }

  return {
    valid: true,
    details: {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    },
  };
}
