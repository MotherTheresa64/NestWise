import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 60000, workers: 1, use: { baseURL: 'http://localhost:8081', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'npm run start:local -w @nestwise/api', url: 'http://localhost:3001/health', reuseExistingServer: !process.env.CI },
    { command: 'node scripts/serve-web.mjs', url: 'http://localhost:8081', reuseExistingServer: !process.env.CI },
  ],
});
