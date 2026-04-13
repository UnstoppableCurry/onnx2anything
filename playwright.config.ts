import { defineConfig, devices } from '@playwright/test';

const chromiumOnlyProject = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
];

const crossBrowserProjects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'firefox',
    use: { ...devices['Desktop Firefox'] },
  },
  {
    name: 'webkit',
    use: { ...devices['Desktop Safari'] },
  },
  {
    name: 'Mobile Chrome',
    use: { ...devices['Pixel 5'] },
  },
  {
    name: 'Mobile Safari',
    use: { ...devices['iPhone 12'] },
  },
];

/**
 * Playwright 配置
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* 每个测试的最长运行时间 */
  timeout: 120 * 1000, // 120 秒

  /* 全局设置 */
  globalSetup: './tests/global-setup.ts',

  expect: {
    /* 断言超时时间 */
    timeout: 10000,
  },

  /* 在 CI 中只运行一次，本地可以重试失败的测试 */
  retries: process.env.CI ? 2 : 0,

  /* 工作者数量，设置为不并行以保持稳定 */
  workers: 1,

  /* 报告器配置 */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/playwright-results.json' }],
    ['list'],
  ],

  /* 共享配置 */
  use: {
    /* 基础 URL */
    baseURL: 'http://localhost:5173',

    /* 收集 trace */
    trace: 'on-first-retry',

    /* 截图 */
    screenshot: 'only-on-failure',

    /* 视频 */
    video: 'on-first-retry',

    /* 动作超时 */
    actionTimeout: 15000,

    /* 导航超时 */
    navigationTimeout: 30000,
  },

  /* 项目配置 */
  projects: process.env.PLAYWRIGHT_ALL_BROWSERS
    ? crossBrowserProjects
    : chromiumOnlyProject,

  /* 本地开发服务器配置 */
  webServer: {
    command:
      'npm run build:wasm && npm run build:toolchains:manifest && cd apps/web && vite --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
