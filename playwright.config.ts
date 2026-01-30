import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT) || 3000;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Chromium WebGPU: enable-unsafe-webgpu (required), ignore-gpu-blocklist (CI/headless),
          // use-angle=swiftshader (software GPU for WebGL; WebGPU/Dawn may use SwiftShader via Vulkan)
          args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
        },
      },
    },
  ],
  webServer: {
    command: `npx http-server -p ${port} -c-1 --cors`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // Ensure server process is terminated after tests (SIGTERM then SIGKILL if needed)
    gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
  },
});
