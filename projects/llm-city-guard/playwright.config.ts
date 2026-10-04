import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Use the installed desktop Google Chrome, rather than Playwright's bundled Chromium.
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'chrome', ...devices['Pixel 5'] },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
});
