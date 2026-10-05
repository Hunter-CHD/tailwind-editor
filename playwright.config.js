import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 20000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8010/tailwind-editor/',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'python -m http.server 8010 --bind 127.0.0.1',
    cwd: '..',
    url: 'http://127.0.0.1:8010/tailwind-editor/',
    reuseExistingServer: true,
  },
});
