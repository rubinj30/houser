import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

loadEnvConfig(process.cwd());

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const usesLocalServer = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(baseURL);
const localPort = new URL(baseURL).port || "3000";
const hasAuthenticatedTestAccount = Boolean(process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD);
const usableEnv = (value: string | undefined) => value && value !== "[SENSITIVE]";
const localServerEnv = {
  ...process.env,
  // Public-shell tests never authenticate. These fallbacks let them run in
  // isolated worktrees where Vercel intentionally withholds sensitive values.
  NEXT_PUBLIC_SUPABASE_URL: usableEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
    ? process.env.NEXT_PUBLIC_SUPABASE_URL!
    : "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: usableEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    : "playwright-public-shell-key",
};

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
    {
      name: "public-mobile",
      testMatch: /account-creation\.spec\.ts/,
      use: { browserName: "chromium", viewport: { width: 360, height: 800 } },
    },
    { name: "auth", testMatch: /auth\.setup\.ts/ },
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 360, height: 800 },
        storageState: hasAuthenticatedTestAccount ? "e2e/.auth/user.json" : undefined,
      },
      dependencies: ["auth"],
      testIgnore: [/auth\.setup\.ts/, /account-creation\.spec\.ts/],
    },
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: hasAuthenticatedTestAccount ? "e2e/.auth/user.json" : undefined,
      },
      dependencies: ["auth"],
      testIgnore: [/auth\.setup\.ts/, /account-creation\.spec\.ts/],
    },
  ],
  webServer: usesLocalServer ? {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${localPort}`,
    env: localServerEnv,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  } : undefined,
});
