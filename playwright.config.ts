import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1138, height: 985 }
      }
    }
  ],
  webServer: {
    command:
      "npx vite preview --config vite.config.example.ts --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/workspace.html",
    reuseExistingServer: false,
    timeout: 30_000
  }
});
