import { defineConfig } from "@playwright/test";
process.env.TZ = "Asia/Kolkata";
export default defineConfig({
  testDir: "/home/user/Claude/e2e",
  testMatch: /(section-nav|analytics-consent)\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  workers: 1,
  use: { baseURL: "http://localhost:3000", launchOptions: { executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args: ["--no-sandbox"] } },
  webServer: {
    command: "npm run dev",
    cwd: "/home/user/Claude",
    url: "http://localhost:3000",
    timeout: 180_000,
    reuseExistingServer: true,
  },
});
