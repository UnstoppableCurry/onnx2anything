/**
 * 测试工具函数
 * 提供测试辅助功能和模拟数据生成
 */

import type { ConversionResult, ModelInfo } from '@/utils/converter';

/**
 * 创建模拟的 ONNX 模型缓冲区
 */
export function createMockONNXBuffer(size: number = 1024): ArrayBuffer {
  const buffer = new ArrayBuffer(size);
  const view = new Uint8Array(buffer);

  // ONNX 文件魔数 (protobuf 格式开始)
  view[0] = 0x08;
  view[1] = 0x00;

  // 填充一些随机数据
  for (let i = 2; i < Math.min(size, 100); i++) {
    view[i] = Math.floor(Math.random() * 256);
  }

  return buffer;
}

/**
 * 创建 YOLOv5n 模拟模型
 */
export function createYOLOv5nMock(): ArrayBuffer {
  // 约 3.9MB
  return createMockONNXBuffer(3.9 * 1024 * 1024);
}

/**
 * 创建 YOLOv8n 模拟模型
 */
export function createYOLOv8nMock(): ArrayBuffer {
  // 约 6.2MB
  return createMockONNXBuffer(6.2 * 1024 * 1024);
}

/**
 * 创建 ResNet50 模拟模型
 */
export function createResNet50Mock(): ArrayBuffer {
  // 约 97.8MB
  return createMockONNXBuffer(97.8 * 1024 * 1024);
}

/**
 * 创建模拟文件对象
 */
export function createMockFile(
  name: string,
  size: number,
  type: string = 'application/octet-stream',
  content?: Uint8Array
): File {
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
}

/**
 * 创建模拟的 FileList
 */
export function createMockFileList(files: File[]): FileList {
  const dataTransfer = new DataTransfer();
  files.forEach((file) => dataTransfer.items.add(file));
  return dataTransfer.files;
}

/**
 * 模拟转换结果
 */
export function createMockConversionResult(
  format: string = 'tflite',
  success: boolean = true
): ConversionResult {
  return {
    success,
    buffer: success ? new ArrayBuffer(512 * 1024) : new ArrayBuffer(0),
    filename: `model.${format}`,
    format,
    metadata: {
      originalSize: 1024 * 1024,
      convertedSize: success ? 512 * 1024 : 0,
      duration: success ? 5000 : 0,
    },
    warnings: success ? undefined : ['Conversion failed'],
  };
}

/**
 * 模拟模型信息
 */
export function createMockModelInfo(modelType: 'yolov5' | 'yolov8' | 'resnet' = 'yolov5'): ModelInfo {
  const configs = {
    yolov5: {
      irVersion: 8,
      opsetVersion: 12,
      producerName: 'pytorch',
      inputs: [
        { name: 'images', shape: [1, 3, 640, 640], dtype: 'FLOAT' },
      ],
      outputs: [
        { name: 'output0', shape: [1, 25200, 85], dtype: 'FLOAT' },
      ],
      statistics: {
        totalNodes: 245,
        totalInitializers: 124,
        totalParams: 1768456,
        modelSizeMB: 3.9,
      },
      opTypes: {
        Conv: 67,
        BatchNormalization: 58,
        LeakyRelu: 58,
        MaxPool: 3,
        Concat: 23,
        Reshape: 6,
        Resize: 2,
      },
    },
    yolov8: {
      irVersion: 8,
      opsetVersion: 17,
      producerName: 'pytorch',
      inputs: [
        { name: 'images', shape: [1, 3, 640, 640], dtype: 'FLOAT' },
      ],
      outputs: [
        { name: 'output0', shape: [1, 84, 8400], dtype: 'FLOAT' },
      ],
      statistics: {
        totalNodes: 168,
        totalInitializers: 168,
        totalParams: 3151904,
        modelSizeMB: 6.2,
      },
      opTypes: {
        Conv: 66,
        Sigmoid: 66,
        Mul: 66,
        Concat: 22,
        MaxPool: 2,
        Split: 8,
      },
    },
    resnet: {
      irVersion: 7,
      opsetVersion: 13,
      producerName: 'pytorch',
      inputs: [
        { name: 'input', shape: [1, 3, 224, 224], dtype: 'FLOAT' },
      ],
      outputs: [
        { name: 'output', shape: [1, 1000], dtype: 'FLOAT' },
      ],
      statistics: {
        totalNodes: 124,
        totalInitializers: 124,
        totalParams: 25557032,
        modelSizeMB: 97.8,
      },
      opTypes: {
        Conv: 53,
        BatchNormalization: 53,
        Relu: 49,
        MaxPool: 1,
        Add: 16,
        GlobalAveragePool: 1,
        Flatten: 1,
        Gemm: 1,
      },
    },
  };

  return {
    success: true,
    ...configs[modelType],
  };
}

/**
 * 等待指定时间
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 等待条件满足
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await sleep(interval);
  }

  return false;
}

/**
 * 创建可控的 Promise
 */
export function createControlledPromise<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve: (value: T) => void;
  let reject: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve: resolve!, reject: reject! };
}

/**
 * 模拟 Worker 消息
 */
export function createMockWorkerMessage(
  type: 'progress' | 'result' | 'error',
  data: Record<string, unknown>
): MessageEvent {
  return new MessageEvent('message', {
    data: { type, ...data },
  });
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * 生成随机进度更新
 */
export function* generateProgressStages(): Generator<{
  stage: string;
  percent: number;
  message: string;
}> {
  const stages = [
    { stage: 'loading', percent: 10, message: '正在初始化...' },
    { stage: 'simplifying', percent: 30, message: '正在简化模型...' },
    { stage: 'converting', percent: 60, message: '正在转换格式...' },
    { stage: 'quantizing', percent: 80, message: '正在应用量化...' },
    { stage: 'finalizing', percent: 95, message: '正在生成输出...' },
    { stage: 'done', percent: 100, message: '转换完成!' },
  ];

  for (const stage of stages) {
    yield stage;
  }
}

/**
 * 测量函数执行时间
 */
export async function measureTime<T>(
  fn: () => Promise<T> | T
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  return { result, duration };
}

/**
 * 创建性能报告
 */
export function createPerformanceReport(
  testName: string,
  duration: number,
  additionalData?: Record<string, unknown>
): Record<string, unknown> {
  return {
    testName,
    timestamp: new Date().toISOString(),
    duration,
    durationFormatted: `${(duration / 1000).toFixed(2)}s`,
    ...additionalData,
  };
}

/**
 * 验证转换结果
 */
export function validateConversionResult(
  result: ConversionResult,
  expectedFormat: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!result.success) {
    errors.push('Conversion was not successful');
  }

  if (result.format !== expectedFormat) {
    errors.push(`Expected format ${expectedFormat}, got ${result.format}`);
  }

  if (!result.buffer || result.buffer.byteLength === 0) {
    errors.push('Result buffer is empty');
  }

  if (!result.filename) {
    errors.push('Result filename is missing');
  }

  if (result.metadata && result.metadata.convertedSize === 0) {
    errors.push('Converted size is 0');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 模拟网络延迟
 */
export function simulateNetworkDelay(
  minMs: number = 100,
  maxMs: number = 500
): Promise<void> {
  const delay = Math.random() * (maxMs - minMs) + minMs;
  return sleep(delay);
}

/**
 * 重试函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError!;
}

/**
 * 测试夹具路径解析
 */
export function getFixturePath(filename: string): string {
  // 在 Node 环境中使用
  if (typeof process !== 'undefined' && process.cwd) {
    return `${process.cwd()}/tests/fixtures/${filename}`;
  }
  // 在浏览器环境中
  return `/tests/fixtures/${filename}`;
}

/**
 * 生成测试报告
 */
export function generateTestReport(
  results: Array<{ name: string; passed: boolean; duration: number; error?: string }>
): string {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  let report = '\n';
  report += '╔════════════════════════════════════════════════╗\n';
  report += '║           ONNX2Anything 测试报告               ║\n';
  report += '╠════════════════════════════════════════════════╣\n';
  report += `║ 总测试数: ${String(total).padEnd(36)}║\n`;
  report += `║ 通过: ${String(passed).padEnd(40)}║\n`;
  report += `║ 失败: ${String(failed).padEnd(40)}║\n`;
  report += `║ 总耗时: ${formatFileSize(totalDuration).padEnd(37)}║\n`;
  report += '╚════════════════════════════════════════════════╝\n\n';

  if (failed > 0) {
    report += '失败测试:\n';
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        report += `  ✗ ${r.name}\n`;
        if (r.error) {
          report += `    ${r.error}\n`;
        }
      });
    report += '\n';
  }

  return report;
}
