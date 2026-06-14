import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://127.0.0.1:${PORT}`;
// Isolated, ephemeral data dir so e2e never touches a real inventory.
const e2eDataDir = path.join(process.cwd(), ".e2e-data");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run start",
    url: `${baseURL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: { DATA_DIR: e2eDataDir, NODE_ENV: "production" },
  },
});
