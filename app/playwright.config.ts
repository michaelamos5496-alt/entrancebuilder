import { defineConfig } from "@playwright/test";

/**
 * Browser end-to-end tests run against a PRODUCTION build (what users get), in local development mode
 * (no Supabase credentials), using the machine's installed Chrome so no browser download is needed.
 *   npm run e2e         (builds, starts the server, runs the tests)
 *   E2E_BASE_URL=http://localhost:3100 npm run e2e   (use a server you already started)
 */
const PORT = 3200;
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  outputDir: "./e2e/.results",
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: external
    ? undefined
    : { command: `npm run build && npx next start -p ${PORT}`, url: `http://localhost:${PORT}`, reuseExistingServer: true, timeout: 240_000 },
});
