import type { GlobalSetupContext } from 'vitest/node';

/**
 * 全局测试设置
 * 在所有测试套件运行之前执行一次
 */

// 测试服务器实例
let testServer: { close: () => Promise<void> } | null = null;

export default async function setup(_context: GlobalSetupContext) {
  console.log('🚀 Starting global test setup...');

  // 设置测试环境变量
  process.env.NODE_ENV = 'test';
  process.env.VITEST = 'true';
  process.env.VITE_PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/';

  // 创建测试输出目录
  const fs = await import('fs');
  const path = await import('path');
  const testResultsDir = path.join(process.cwd(), 'test-results');
  const coverageDir = path.join(process.cwd(), 'coverage');

  if (!fs.existsSync(testResultsDir)) {
    fs.mkdirSync(testResultsDir, { recursive: true });
  }

  if (!fs.existsSync(coverageDir)) {
    fs.mkdirSync(coverageDir, { recursive: true });
  }

  // 验证测试模型目录
  const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
    console.log('📁 Created test fixtures directory');
  }

  console.log('✅ Global test setup complete');

  return async () => {
    console.log('🧹 Cleaning up global test setup...');

    if (testServer) {
      await testServer.close();
      testServer = null;
    }

    console.log('✅ Global cleanup complete');
  };
}

// 模块级别的设置（如果文件被直接导入）
export const globalSetup = setup;
