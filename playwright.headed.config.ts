import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT) || 3000;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  forbidOnly: false,
  retries: 0,
  workers: undefined,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    headless: false,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Headed mode: use real GPU without SwiftShader
          args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"],
        },
      },
    },
  ],
  webServer: {
    command: `npx http-server -p ${port} -c-1 --cors`,
    url: baseURL,
    reuseExistingServer: true,
    // Ensure server process is terminated after tests (SIGTERM then SIGKILL if needed)
    gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
  },
});
