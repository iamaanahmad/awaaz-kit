import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${PORT}`;

// Build both apps exactly as they ship (on-device Shruti voice, model not downloaded until the
// user asks) with no Appwrite config (local-only), then serve them on one origin under /order/
// and /bill/. VITE_SPEECH_PROVIDER is cleared so a developer's .env cannot change what is tested.
const buildEnv = {
  VITE_SPEECH_PROVIDER: '',
  VITE_APPWRITE_ENDPOINT: '',
  VITE_APPWRITE_PROJECT_ID: '',
};

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /voice-.*\.e2e\.ts$/,
      use: {
        ...devices['Pixel 7'],
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
      },
    },
    {
      // The voice journeys run the real speech model (WASM, CPU-heavy). Run them after every
      // other journey has finished, so they never starve those of CPU and cause timeouts.
      name: 'voice',
      testMatch: /voice-.*\.e2e\.ts$/,
      dependencies: ['chromium'],
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `pnpm build && node tests/e2e/serve-combined.mjs ${PORT}`,
    url: `${baseURL}/order/`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: buildEnv,
  },
});
