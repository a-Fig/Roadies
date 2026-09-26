import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Use the preinstalled Chromium when there is one (cloud dev containers).
const chromium = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  // CI runs headless on a shared runner: keep the terse list output but also
  // write an HTML report (with embedded traces) so a failure is debuggable
  // from the uploaded artifact instead of only from the log.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:8080',
    ...devices['Pixel 7'],
    locale: 'en-US',
    permissions: ['microphone'],
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: chromium,
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: [
    {
      command: 'bash scripts/livekit-dev.sh',
      port: 7880,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run build && npx tsx server/src/index.ts',
      url: 'http://localhost:8080/healthz',
      reuseExistingServer: true,
      timeout: 120_000,
      env: { RECOGNIZER: 'fake', DEV_ENDPOINTS: '1' },
    },
  ],
});
