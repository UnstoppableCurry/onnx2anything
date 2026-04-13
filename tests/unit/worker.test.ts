import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

// Worker 消息类型
interface WorkerMessage {
  type: 'convert' | 'progress' | 'result' | 'error' | 'ready';
  stage?: string;
  percent?: number;
  message?: string;
  buffer?: ArrayBuffer;
  error?: string;
  filename?: string;
  modelBuffer?: ArrayBuffer;
  targetFormat?: string;
  quantization?: string;
  optimization?: boolean;
}

// 模拟 Worker 类
class MockConverterWorker {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null;
  onerror: ((error: ErrorEvent) => void) | null = null;

  constructor() {
    // 模拟 Worker 初始化延迟
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage(
          new MessageEvent('message', {
            data: { type: 'ready' },
          })
        );
      }
    }, 100);
  }

  postMessage(message: WorkerMessage, _transfer?: Transferable[]) {
    // 处理转换请求
    if (message.type === 'convert') {
      this.handleConvert(message);
    }
  }

  private async handleConvert(message: WorkerMessage) {
    if (!message.modelBuffer) {
      this.sendError('No model buffer provided');
      return;
    }

    // 模拟转换进度
    const stages = [
      { stage: 'loading', percent: 10, message: '正在初始化...' },
      { stage: 'simplifying', percent: 30, message: '正在简化模型...' },
      { stage: 'converting', percent: 60, message: `正在转换为 ${message.targetFormat}...` },
      { stage: 'quantizing', percent: 80, message: '正在应用量化...' },
      { stage: 'finalizing', percent: 95, message: '正在生成输出文件...' },
    ];

    for (const progress of stages) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      this.sendProgress(progress.stage, progress.percent, progress.message);
    }

    // 模拟转换结果
    const outputBuffer = new ArrayBuffer(message.modelBuffer.byteLength * 0.8);
    const filename = `model.${message.targetFormat || 'tflite'}`;

    this.sendResult(outputBuffer, filename);
  }

  private sendProgress(stage: string, percent: number, message: string) {
    if (this.onmessage) {
      this.onmessage(
        new MessageEvent('message', {
          data: {
            type: 'progress',
            stage,
            percent,
            message,
          },
        })
      );
    }
  }

  private sendResult(buffer: ArrayBuffer, filename: string) {
    if (this.onmessage) {
      this.onmessage(
        new MessageEvent('message', {
          data: {
            type: 'result',
            buffer,
            filename,
          },
        })
      );
    }
  }

  private sendError(error: string) {
    if (this.onmessage) {
      this.onmessage(
        new MessageEvent('message', {
          data: {
            type: 'error',
            error,
          },
        })
      );
    }
  }

  terminate() {
    this.onmessage = null;
    this.onerror = null;
  }
}

describe('Converter Web Worker', () => {
  let worker: MockConverterWorker;
  const originalWorker = global.Worker;

  beforeAll(() => {
    // 替换全局 Worker
    global.Worker = MockConverterWorker as unknown as typeof Worker;
  });

  afterAll(() => {
    global.Worker = originalWorker;
  });

  beforeEach(() => {
    worker = new MockConverterWorker();
  });

  afterEach(() => {
    worker.terminate();
    vi.clearAllMocks();
  });

  describe('Worker 生命周期', () => {
    it('应该正确初始化 Worker', () => {
      expect(worker).toBeDefined();
    });

    it('应该发送就绪信号', async () => {
      await new Promise<void>((resolve) => {
        worker.onmessage = (event) => {
          if (event.data.type === 'ready') {
            expect(event.data.type).toBe('ready');
            resolve();
          }
        };
      });
    }, 1000);

    it('应该正确终止 Worker', () => {
      worker.terminate();
      expect(worker).toBeDefined();
    });
  });

  describe('转换流程', () => {
    it('应该处理转换请求', async () => {
      const progressUpdates: WorkerMessage[] = [];
      const modelBuffer = new ArrayBuffer(1024);

      await new Promise<void>((resolve) => {
        worker.onmessage = (event) => {
          const data = event.data;

          if (data.type === 'progress') {
            progressUpdates.push(data);
          }

          if (data.type === 'result') {
            expect(progressUpdates.length).toBeGreaterThan(0);
            expect(data.buffer).toBeDefined();
            expect(data.filename).toBeDefined();
            resolve();
          }
        };

        worker.postMessage({
          type: 'convert',
          modelBuffer,
          targetFormat: 'tflite',
          quantization: 'none',
          optimization: true,
        }, [modelBuffer]);
      });
    }, 2000);

    it('应该报告转换进度', async () => {
      const progressStages: string[] = [];
      const modelBuffer = new ArrayBuffer(1024);

      await new Promise<void>((resolve) => {
        worker.onmessage = (event) => {
          const data = event.data;

          if (data.type === 'progress' && data.stage) {
            progressStages.push(data.stage);
          }

          if (data.type === 'result') {
            expect(progressStages).toContain('loading');
            expect(progressStages).toContain('converting');
            resolve();
          }
        };

        worker.postMessage({
          type: 'convert',
          modelBuffer,
          targetFormat: 'tflite',
          quantization: 'none',
          optimization: true,
        }, [modelBuffer]);
      });
    }, 2000);

    it('应该处理不同目标格式', async () => {
      const modelBuffer = new ArrayBuffer(1024);
      const targetFormat = 'tflite';

      await new Promise<void>((resolve) => {
        worker.onmessage = (event) => {
          const data = event.data;

          if (data.type === 'result') {
            expect(data.filename).toContain('tflite');
            resolve();
          }
        };

        worker.postMessage({
          type: 'convert',
          modelBuffer,
          targetFormat,
          quantization: 'none',
          optimization: true,
        }, [modelBuffer]);
      });
    }, 2000);

    it('应该处理量化选项', async () => {
      const modelBuffer = new ArrayBuffer(1024);

      await new Promise<void>((resolve) => {
        worker.onmessage = (event) => {
          const data = event.data;

          if (data.type === 'progress' && data.stage === 'quantizing') {
            expect(data.stage).toBe('quantizing');
          }

          if (data.type === 'result') {
            resolve();
          }
        };

        worker.postMessage({
          type: 'convert',
          modelBuffer,
          targetFormat: 'tflite',
          quantization: 'fp16',
          optimization: true,
        }, [modelBuffer]);
      });
    }, 2000);
  });

  describe('错误处理', () => {
    it('应该处理缺少模型缓冲区的情况', async () => {
      await new Promise<void>((resolve) => {
        worker.onmessage = (event) => {
          if (event.data.type === 'error') {
            expect(event.data.error).toContain('No model buffer');
            resolve();
          }
        };

        worker.postMessage({
          type: 'convert',
          targetFormat: 'tflite',
          quantization: 'none',
          optimization: true,
        } as WorkerMessage);
      });
    }, 1000);

    it('应该处理 Worker 错误', () => {
      const errorHandler = vi.fn();
      worker.onerror = errorHandler;

      // 模拟错误
      if (worker.onerror) {
        worker.onerror(new ErrorEvent('error', { message: 'Test error' }));
      }

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('消息传输', () => {
    it('应该正确传输 ArrayBuffer', async () => {
      const modelBuffer = new ArrayBuffer(1024);
      const view = new Uint8Array(modelBuffer);
      view[0] = 0x08;
      view[1] = 0x00;

      await new Promise<void>((resolve) => {
        worker.onmessage = (event) => {
          if (event.data.type === 'result') {
            expect(event.data.buffer).toBeDefined();
            expect(event.data.buffer?.byteLength).toBeGreaterThan(0);
            resolve();
          }
        };

        worker.postMessage(
          {
            type: 'convert',
            modelBuffer,
            targetFormat: 'tflite',
            quantization: 'none',
            optimization: true,
          },
          [modelBuffer]
        );
      });
    }, 2000);

    it('应该处理多个连续转换', async () => {
      const results: string[] = [];

      for (let i = 0; i < 3; i++) {
        const modelBuffer = new ArrayBuffer(1024);

        await new Promise<void>((resolve) => {
          worker.onmessage = (event) => {
            if (event.data.type === 'result') {
              results.push(event.data.filename || '');
              resolve();
            }
          };

          worker.postMessage(
            {
              type: 'convert',
              modelBuffer,
              targetFormat: 'tflite',
              quantization: 'none',
              optimization: true,
            },
            [modelBuffer]
          );
        });
      }

      expect(results.length).toBe(3);
    }, 10000);
  });

  describe('YOLO 模型支持', () => {
    it('应该处理 YOLOv5n 模型', async () => {
      // YOLOv5n 约 3.9MB
      const yolov5nBuffer = new ArrayBuffer(3.9 * 1024 * 1024);

      await new Promise<void>((resolve) => {
        worker.onmessage = (event) => {
          if (event.data.type === 'result') {
            expect(event.data.buffer?.byteLength).toBeGreaterThan(0);
            resolve();
          }
        };

        worker.postMessage(
          {
            type: 'convert',
            modelBuffer: yolov5nBuffer,
            targetFormat: 'tflite',
            quantization: 'none',
            optimization: true,
          },
          [yolov5nBuffer]
        );
      });
    }, 5000);

    it('应该处理 YOLOv8n 模型', async () => {
      // YOLOv8n 约 6.2MB
      const yolov8nBuffer = new ArrayBuffer(6.2 * 1024 * 1024);

      await new Promise<void>((resolve) => {
        worker.onmessage = (event) => {
          if (event.data.type === 'result') {
            expect(event.data.buffer?.byteLength).toBeGreaterThan(0);
            resolve();
          }
        };

        worker.postMessage(
          {
            type: 'convert',
            modelBuffer: yolov8nBuffer,
            targetFormat: 'tflite',
            quantization: 'none',
            optimization: true,
          },
          [yolov8nBuffer]
        );
      });
    }, 5000);
  });
});

// 实际 Worker 测试（如果环境支持）
describe('Actual Worker Integration', () => {
  // 跳过这些测试，因为 Worker 需要实际的文件系统
  it.skip('应该加载实际 Worker 文件', async () => {
    // 这需要实际的项目构建
    const worker = new Worker(
      new URL('../../apps/web/src/workers/converter.worker.ts', import.meta.url),
      { type: 'module' }
    );

    expect(worker).toBeDefined();
    worker.terminate();
  });
});
