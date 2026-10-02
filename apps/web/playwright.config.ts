import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

/**
 * 端到端测试：同时拉起后端（NODE_ENV=test，读 .env.test 或 CI 环境变量）和前端开发服务器，
 * 用真实浏览器走注册、加好友、聊天、群聊、演示账号这几条关键路径。
 * 桌面项目跑业务流程（chat.spec.ts），手机项目用 Pixel 7 的视口和触屏跑手机上才有的交互（mobile.spec.ts）。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 40_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'zh-CN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testMatch: 'chat.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testMatch: 'mobile.spec.ts', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @beechat/server dev',
      cwd: '../..',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !isCI,
      timeout: 90_000,
      env: { NODE_ENV: 'test' },
    },
    {
      command: 'pnpm --filter @beechat/web dev',
      cwd: '../..',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
      timeout: 90_000,
    },
  ],
});
