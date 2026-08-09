import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(path.join(__dirname, ".env.test"));
} catch {
  // .env.test not present (e.g. CI sets real env vars directly) — ignore.
}
try {
  // .env carries VITE_SUPABASE_URL and the anon key. The fixture needs both to
  // mint a fresh session per test; several specs used to load this themselves.
  // Both values are inlined into the public bundle at build time, so neither is
  // a secret. Loaded second so .env.test wins on any overlap.
  const before = { ...process.env };
  process.loadEnvFile(path.join(__dirname, ".env"));
  for (const k of Object.keys(before)) if (before[k] !== undefined) process.env[k] = before[k];
} catch {
  // a clean clone has no .env — tests that need it assert on its absence
}

export default defineConfig({
  testDir: "./tests",
  // Must NOT be the default "test-results". Playwright wipes its outputDir at
  // the start of every run, and test-results/ also holds the APK suite's
  // results and the combined report — so a web run was silently deleting the
  // Android half of the report seconds after it was generated.
  outputDir: "./test-results/playwright",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // one test opens a real external Stripe tab — parallel workers
              // fight over browser resources and cause unrelated timeouts.
              // Robustness over speed here, per project preference.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["./tests/support/step-reporter.mjs"],
  ],

  use: {
    baseURL: process.env.TEST_BASE_URL || "https://idisagree.trolleysolution.com",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.js/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(__dirname, "playwright", ".auth", "user.json"),
      },
      dependencies: ["setup"],
    },
  ],
});
