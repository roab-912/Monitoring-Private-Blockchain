import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: 0, timeout: 45000,
  use: { baseURL: process.env.CONSOLE_URL ?? 'http://127.0.0.1:3000', browserName: 'chromium',
    trace: 'off', screenshot: 'off', video: 'off' },
});
