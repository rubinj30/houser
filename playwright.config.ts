import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

loadEnvConfig(process.cwd());

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const usesLocalServer = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(baseURL);
const localPort = new URL(baseURL).port || "3000";
const hasAuthenticatedTestAccount = Boolean(process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "auth", testMatch: /auth\.setup\.ts/ },
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        storageState: hasAuthenticatedTestAccount ? "e2e/.auth/user.json" : undefined,
      },
      dependencies: ["auth"],
      testIgnore: /auth\.setup\.ts/,
    },
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: hasAuthenticatedTestAccount ? "e2e/.auth/user.json" : undefined,
      },
      dependencies: ["auth"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: usesLocalServer ? {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${localPort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  } : undefined,
});
