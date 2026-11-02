import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const testDataDir = mkdtempSync(path.join(tmpdir(), "copex-e2e-"));
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.js",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3002",
    headless: true,
    actionTimeout: 15000,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: `exec env NODE_ENV=production PORT=3002 COPEX_DATA_DIR=${testDataDir} node server/index.js`,
    url: "http://127.0.0.1:3002/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
  timeout: 90000,
});
