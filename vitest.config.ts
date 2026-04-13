import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // 测试环境配置
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],

    // 测试文件模式
    include: [
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
      'tests/e2e/**/*.{test,spec}.{ts,tsx}',
      'tests/perf/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      'node_modules',
      'dist',
      '**/*.d.ts',
      'tests/fixtures/**/*',
    ],

    // 超时配置
    testTimeout: 60000,        // 单元测试 60 秒
    hookTimeout: 60000,        // hook 超时 60 秒

    // 并发配置
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 4,
        minThreads: 1,
      },
    },

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'apps/web/src/**/*.{ts,tsx}',
        'packages/*/src/**/*.{ts,tsx}',
      ],
      exclude: [
        'node_modules',
        'tests',
        '**/*.d.ts',
        '**/*.config.{ts,js}',
        '**/workers/*.worker.ts', // Worker 代码需要特殊处理
      ],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
    },

    // 报告器配置
    reporters: ['default', 'verbose'],
    outputFile: {
      junit: './test-results/junit.xml',
    },

    // 模拟配置
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,

    // 类型检查
    typecheck: {
      enabled: true,
      checker: 'tsc',
      include: ['tests/**/*.test.ts'],
    },

    // 全局变量
    globalSetup: ['./tests/global-setup.ts'],

    // 环境变量
    env: {
      NODE_ENV: 'test',
      VITE_PYODIDE_INDEX_URL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
    },

    // 快照配置
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true,
    },
    update: false,

    // 失败策略
    bail: 0,
    retry: process.env.CI ? 2 : 0,

    // 慢测试阈值 (ms)
    slowTestThreshold: 5000,
  },

  // 路径解析
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/web/src'),
      '@components': path.resolve(__dirname, './apps/web/src/components'),
      '@hooks': path.resolve(__dirname, './apps/web/src/hooks'),
      '@utils': path.resolve(__dirname, './apps/web/src/utils'),
      '@workers': path.resolve(__dirname, './apps/web/src/workers'),
      '@tests': path.resolve(__dirname, './tests'),
      '@fixtures': path.resolve(__dirname, './tests/fixtures'),
    },
  },

  // esbuild 配置
  esbuild: {
    target: 'es2022',
    jsxInject: `import React from 'react'`,
  },

  // 构建优化
  optimizeDeps: {
    include: ['react', 'react-dom', 'comlink'],
  },

  // 服务器配置 (用于 E2E 测试)
  server: {
    port: 3001,
    strictPort: true,
    open: false,
  },
});
