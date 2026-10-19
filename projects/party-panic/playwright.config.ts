import process from 'node:process';
import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: 'tests/e2e',
    timeout: 60000,
    webServer: {
        command: 'npm run dev -- --port 5173',
        url: 'http://127.0.0.1:5173/party-panic/',
        reuseExistingServer: !process.env.CI,
        timeout: 30000
    },
    fullyParallel: false,
    workers: 1,
    use: {
        baseURL: process.env.PARTY_URL || 'http://127.0.0.1:5173/party-panic/',
        headless: true,
        proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined,
        launchOptions: {
            executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
            args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
        },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]]
});
