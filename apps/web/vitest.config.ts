import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // e2e 目录是 Playwright 的用例，不归 vitest 管
    exclude: [...configDefaults.exclude, 'e2e/**'],
    passWithNoTests: true,
  },
});
