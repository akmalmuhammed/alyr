import { defineConfig } from "@playwright/test";
import { WEB } from "./support/env";

// The journeys that must never break (ALY-122). They run against the real stack and nothing is
// faked: PostgreSQL, the API in local mode (it hands back sign-in codes, and has the simulator
// channel), and the web app as `next build` made it. Start those first (README.md, or the `e2e`
// workflow in .github/workflows/e2e.yml, which is the reference).
//
// Two projects run the same test bodies at two widths. `desktop` runs everything; `phone` (390 px)
// runs only what is tagged @phone, so the sign-up and the order page are proved on a phone as
// well without writing them twice.
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  // Every test makes its own people and business, so tests do not wait for each other. The few
  // that change the demo shop's switches live in one file, which runs in order.
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  // A journey that fails once and passes on a second try is a flaky test, not a pass: one retry
  // only keeps a trace of it (the CI run says "flaky"), it never hides it.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "report" }]]
    : [["list"]],
  outputDir: "results",
  use: {
    baseURL: WEB,
    // Customers' and owners' pages are read in English unless a test switches the language.
    locale: "en-US",
    timezoneId: "Asia/Qatar",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1280, height: 800 } },
    },
    {
      name: "phone",
      grep: /@phone/,
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
});
