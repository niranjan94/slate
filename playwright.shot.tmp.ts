import { defineConfig, devices } from "@playwright/test";
const PORT = 3210;
export default defineConfig({
  testDir: "tests/mobile-tmp", workers: 1, reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [{ name: "pixel", use: { ...devices["Pixel 7"] } }],
  webServer: { command: `pnpm build && pnpm start --port ${PORT}`, url: `http://localhost:${PORT}`, reuseExistingServer: true, timeout: 240_000 },
});
