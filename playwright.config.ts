import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  // The suite drives one shared relay network and one IndexedDB origin, so
  // parallel workers would have the boards stepping on each other.
  workers: 1,
  fullyParallel: false,
  /**
   * A board page holds five WebSocket connections to Nostr relays, and Chromium
   * stalls the first navigation of the next context by around 21 seconds once
   * one closes still holding them. It is a harness effect rather than anything
   * a person hits, but it eats most of the default budget, so every test is
   * given room for it.
   */
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
