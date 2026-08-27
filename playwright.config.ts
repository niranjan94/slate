import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  /**
   * A board page holds five WebSocket connections to Nostr relays, and Chromium
   * stalls the first navigation of the next context by around 21 seconds once
   * one closes still holding them. Nothing a person meets, since it takes a
   * whole browser context torn down and rebuilt, but it dominates a run, which
   * is what the unusually long per test budget below is for.
   *
   * That stall is per browser, so workers wait through it alongside each other
   * rather than in turn. Kept to a handful rather than the core count, because
   * each worker opens its own five connections to relays that owe this suite
   * nothing. Boards no longer contend for a namespace: every test draws its own
   * random room code, and IndexedDB has always been per context.
   */
  workers: 4,
  fullyParallel: true,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
      testIgnore: ["**/encoding.spec.ts", "**/mobile.spec.ts"],
    },
    // Touch is dispatched over CDP, so a phone sized Chromium is the only project
    // that can drive the surface the way a finger does.
    {
      name: "mobile",
      use: devices["Pixel 7"],
      testMatch: "**/mobile.spec.ts",
    },
    // One spec only: image encoding is the one behaviour that differs by engine in a
    // way Chromium cannot reveal, and a second full pass is not worth the minutes.
    {
      name: "webkit",
      use: devices["Desktop Safari"],
      testMatch: "**/encoding.spec.ts",
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
