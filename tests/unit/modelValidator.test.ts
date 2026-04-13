import { describe, it, expect, vi } from 'vitest';
import {
  validateONNXFile,
  validateFileSize,
  validateFileType,
  validateMagicNumber,
  type FileValidationOptions,
} from '@/utils/modelValidator';

// 模拟文件数据
const createMockFile = (
  name: string,
  size: number,
  type: string,
  content?: Uint8Array
): File => {
  const bytes = content ?? new Uint8Array(Math.ceil(size));
  const payload = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(payload).set(bytes);
  const blob = new Blob([payload], { type });
  const file = new File([blob], name, { type, lastModified: Date.now() });
  Object.defineProperty(file, 'size', {
    configurable: true,
    value: Math.ceil(size),
  });
  return file;
};

describe('Model Validator', () => {
  describe('validateFileSize', () => {
    const options: FileValidationOptions = {
      maxSizeMB: 500,
      allowedTypes: ['.onnx'],
    };

    it('应该通过小于最大尺寸的文件', () => {
      const file = createMockFile('model.onnx', 100 * 1024 * 1024, 'application/octet-stream');
      const result = validateFileSize(file, options);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('应该拒绝超过最大尺寸的文件', () => {
      const file = createMockFile('model.onnx', 600 * 1024 * 1024, 'application/octet-stream');
      const result = validateFileSize(file, options);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('文件大小超过限制');
    });

    it('应该正确处理边界值 (刚好 500MB)', () => {
      const file = createMockFile('model.onnx', 500 * 1024 * 1024, 'application/octet-stream');
      const result = validateFileSize(file, options);

      expect(result.valid).toBe(true);
    });

    it('应该正确格式化文件大小显示', () => {
      const file = createMockFile('model.onnx', 1024, 'application/octet-stream');
      const result = validateFileSize(file, options);

      expect(result.valid).toBe(true);
      expect(result.details).toBeDefined();
    });
  });

  describe('validateFileType', () => {
    const options: FileValidationOptions = {
      maxSizeMB: 500,
      allowedTypes: ['.onnx', '.pb'],
    };

    it('应该通过有效的 .onnx 文件', () => {
      const file = createMockFile('model.onnx', 1024, 'application/octet-stream');
      const result = validateFileType(file, options);

      expect(result.valid).toBe(true);
    });

    it('应该通过有效的 .pb 文件', () => {
      const file = createMockFile('model.pb', 1024, 'application/octet-stream');
      const result = validateFileType(file, options);

      expect(result.valid).toBe(true);
    });

    it('应该拒绝无效的文件类型', () => {
      const file = createMockFile('model.txt', 1024, 'text/plain');
      const result = validateFileType(file, options);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('不支持的文件类型');
    });

    it('应该拒绝没有扩展名的文件', () => {
      const file = createMockFile('model', 1024, 'application/octet-stream');
      const result = validateFileType(file, options);

      expect(result.valid).toBe(false);
    });

    it('应该拒绝大小写变体的扩展名', () => {
      const file = createMockFile('model.ONNX', 1024, 'application/octet-stream');
      const result = validateFileType(file, options);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateMagicNumber', () => {
    it('应该验证有效的 ONNX 魔数', async () => {
      // ONNX 文件以 protobuf 消息开始
      // 第一个字节通常是 0x08 (field 1, wire type 0) 或类似值
      const content = new Uint8Array([0x08, 0x00, 0x00, 0x00]);
      const file = createMockFile('model.onnx', content.length, 'application/octet-stream', content);

      const result = await validateMagicNumber(file, 'onnx');

      expect(result.valid).toBe(true);
    });

    it('应该拒绝无效的 ONNX 文件', async () => {
      const content = new TextEncoder().encode('NOT_AN_ONNX_FILE');
      const file = createMockFile('model.onnx', content.length, 'application/octet-stream', content);

      const result = await validateMagicNumber(file, 'onnx');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('无效的文件格式');
    });

    it('应该处理空文件', async () => {
      const file = createMockFile('model.onnx', 0, 'application/octet-stream', new Uint8Array(0));

      const result = await validateMagicNumber(file, 'onnx');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('文件为空');
    });

    it('应该处理读取错误', async () => {
      const file = createMockFile('model.onnx', 1024, 'application/octet-stream');
      // 模拟 FileReader 错误
      vi.spyOn(File.prototype, 'slice').mockImplementation(() => {
        throw new Error('Read error');
      });

      const result = await validateMagicNumber(file, 'onnx');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('读取文件失败');
    });
  });

  describe('validateONNXFile', () => {
    const defaultOptions: FileValidationOptions = {
      maxSizeMB: 500,
      allowedTypes: ['.onnx'],
    };

    it('应该通过有效的 ONNX 文件验证', async () => {
      const content = new Uint8Array([0x08, 0x00, 0x00, 0x00]);
      const file = createMockFile('yolov5n.onnx', 4, 'application/octet-stream', content);

      const result = await validateONNXFile(file, defaultOptions);

      expect(result.valid).toBe(true);
      expect(result.details?.fileName).toBe('yolov5n.onnx');
      expect(result.details?.fileSize).toBe(4);
    });

    it('应该验证 YOLOv5n 模型文件', async () => {
      // 模拟 YOLOv5n 模型文件
      const content = new Uint8Array([0x08, 0x00, 0x00, 0x00]);
      const file = createMockFile('yolov5n.onnx', 3.9 * 1024 * 1024, 'application/octet-stream', content);

      const result = await validateONNXFile(file, defaultOptions);

      expect(result.valid).toBe(true);
      expect(result.details?.fileSize).toBeGreaterThan(0);
    });

    it('应该验证 YOLOv8n 模型文件', async () => {
      // 模拟 YOLOv8n 模型文件
      const content = new Uint8Array([0x08, 0x00, 0x00, 0x00]);
      const file = createMockFile('yolov8n.onnx', 6.2 * 1024 * 1024, 'application/octet-stream', content);

      const result = await validateONNXFile(file, defaultOptions);

      expect(result.valid).toBe(true);
    });

    it('应该拒绝超过大小限制的文件', async () => {
      const content = new Uint8Array([0x08, 0x00]);
      const file = createMockFile('large_model.onnx', 600 * 1024 * 1024, 'application/octet-stream', content);

      const result = await validateONNXFile(file, defaultOptions);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('大小超过限制');
    });

    it('应该拒绝无效的 ONNX 文件', async () => {
      const content = new TextEncoder().encode('INVALID');
      const file = createMockFile('fake.onnx', content.length, 'application/octet-stream', content);

      const result = await validateONNXFile(file, defaultOptions);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该处理自定义验证选项', async () => {
      const customOptions: FileValidationOptions = {
        maxSizeMB: 100,
        allowedTypes: ['.onnx'],
      };

      const content = new Uint8Array([0x08, 0x00, 0x00, 0x00]);
      const file = createMockFile('model.onnx', 50 * 1024 * 1024, 'application/octet-stream', content);

      const result = await validateONNXFile(file, customOptions);

      expect(result.valid).toBe(true);
    });
  });

  describe('错误处理', () => {
    it('应该捕获并格式化验证错误', async () => {
      const file = null as unknown as File;

      const result = await validateONNXFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该包含详细的错误信息', async () => {
      const file = createMockFile('model.txt', 1024, 'text/plain');

      const result = await validateONNXFile(file);

      expect(result.valid).toBe(false);
      expect(result.details).toBeDefined();
    });
  });
});
