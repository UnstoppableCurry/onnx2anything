/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom" />

import { expect, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// 扩展 expect 以支持 jest-dom 匹配器
expect.extend(matchers);

// 全局测试配置
beforeAll(() => {
  // 设置全局测试环境
  setupTestEnvironment();
});

// 每个测试后清理
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// 设置测试环境
function setupTestEnvironment() {
  // 模拟 window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // 模拟 IntersectionObserver
  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: MockIntersectionObserver,
  });

  // 模拟 ResizeObserver
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: MockResizeObserver,
  });

  // 模拟 Web Worker
  class MockWorker {
    url: string;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((error: ErrorEvent) => void) | null = null;

    constructor(stringUrl: string | URL) {
      this.url = stringUrl.toString();
    }

    postMessage(_message: unknown, _transfer?: Transferable[]) {
      // 模拟 Worker 行为
      setTimeout(() => {
        if (this.onmessage) {
          this.onmessage(new MessageEvent('message', {
            data: { type: 'ready' },
          }));
        }
      }, 0);
    }

    terminate() {
      // 清理资源
    }

    addEventListener(_type: string, _listener: EventListener) {
      // 事件监听
    }

    removeEventListener(_type: string, _listener: EventListener) {
      // 移除事件监听
    }
  }
  global.Worker = MockWorker as unknown as typeof Worker;

  // 模拟 SharedArrayBuffer (如果不支持)
  if (typeof SharedArrayBuffer === 'undefined') {
    global.SharedArrayBuffer = class SharedArrayBuffer {
      constructor(length: number) {
        return new ArrayBuffer(length);
      }
    } as unknown as typeof SharedArrayBuffer;
  }

  // 模拟 Blob
  if (typeof globalThis.Blob === 'undefined') {
    class MockBlob {
      parts: BlobPart[];
      options: BlobPropertyBag;

      constructor(blobParts?: BlobPart[], options?: BlobPropertyBag) {
        this.parts = blobParts || [];
        this.options = options || {};
      }

      slice(start?: number, end?: number, contentType?: string): Blob {
        return new Blob(this.parts.slice(start, end), { type: contentType });
      }

      text(): Promise<string> {
        return Promise.resolve(
          this.parts.map((p) => (typeof p === 'string' ? p : '')).join('')
        );
      }

      arrayBuffer(): Promise<ArrayBuffer> {
        const str = this.parts.map((p) => (typeof p === 'string' ? p : '')).join('');
        const buf = new ArrayBuffer(str.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < str.length; i++) {
          view[i] = str.charCodeAt(i);
        }
        return Promise.resolve(buf);
      }
    }

    (globalThis as any).Blob = MockBlob as unknown as typeof Blob;
  }

  if (typeof globalThis.File === 'undefined') {
    class MockFile extends Blob {
      name: string;
      lastModified: number;
      webkitRelativePath: string;

      constructor(
        bits: BlobPart[],
        name: string,
        options: FilePropertyBag = {}
      ) {
        super(bits, options);
        this.name = name;
        this.lastModified = options.lastModified || Date.now();
        this.webkitRelativePath = '';
      }
    }

    (globalThis as any).File = MockFile as unknown as typeof File;
  }

  // 模拟 URL.createObjectURL
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = vi.fn();

  // 模拟 fetch
  global.fetch = vi.fn();

  // 模拟 navigator
  Object.defineProperty(global, 'navigator', {
    writable: true,
    value: {
      userAgent: 'Mozilla/5.0 (Test Environment)',
      platform: 'MacIntel',
      hardwareConcurrency: 4,
      deviceMemory: 8,
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue(''),
      },
    },
  });

  // 模拟 console 方法（可选）
  const originalConsole = { ...console };
  global.console = {
    ...originalConsole,
    log: vi.fn((...args) => originalConsole.log(...args)),
    warn: vi.fn((...args) => originalConsole.warn(...args)),
    error: vi.fn((...args) => originalConsole.error(...args)),
    debug: vi.fn((...args) => originalConsole.debug(...args)),
  };
}

// 导出测试工具
export { expect, vi };
