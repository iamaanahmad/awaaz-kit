import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${PORT}`;

// Build both apps with the scripted speech provider and no Appwrite config (local-only),
// then serve them on one origin under /order/ and /bill/.
const buildEnv = {
  VITE_SPEECH_PROVIDER: 'scripted',
  VITE_APPWRITE_ENDPOINT: '',
  VITE_APPWRITE_PROJECT_ID: '',
};

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: true,
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
      use: {
        ...devices['Pixel 7'],
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
      },
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
