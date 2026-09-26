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
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8080',
    ...devices['Pixel 7'],
    permissions: ['microphone'],
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
