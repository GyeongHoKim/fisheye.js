import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { FisheyeOptions } from "../src/types";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load test fixture
const testConfig = JSON.parse(readFileSync(join(__dirname, "fixture/test.json"), "utf-8")) as {
  fisheyeOptions: FisheyeOptions;
};

const fisheyeOptions = testConfig.fisheyeOptions;

// Load test image as base64
const testImageBase64 = readFileSync(join(__dirname, "fixture/test.jpg")).toString("base64");

test.describe("Fisheye Dewarp Visual Regression", () => {
  test("dewarp test.jpg with visual regression", async ({ page }) => {
    // Check WebGPU support
    const webGPUSupported = await page.evaluate(() => {
      return "gpu" in navigator;
    });

    test.skip(!webGPUSupported, "WebGPU not supported in this environment");

    // Create HTML page with inline script
    // We use blob URL to ensure secure context for WebGPU
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Fisheye Dewarp Test</title>
</head>
<body>
  <canvas id="outputCanvas"></canvas>
  <script type="module">
    async function runTest() {
      try {
        // Import the built library (relative to project root)
        const { Fisheye, createVideoFrameFromYUV, convertRGBAtoYUV } = await import('../dist/index.js');
        
        // Load test image
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = 'data:image/jpeg;base64,${testImageBase64}';
        });
        
        // Draw image to canvas to get ImageData
        const inputCanvas = document.createElement('canvas');
        inputCanvas.width = img.width;
        inputCanvas.height = img.height;
        const inputCtx = inputCanvas.getContext('2d');
        inputCtx.drawImage(img, 0, 0);
        const imageData = inputCtx.getImageData(0, 0, img.width, img.height);
        
        // Convert RGBA to YUV using utils.ts
        const yuvData = convertRGBAtoYUV(imageData.data, img.width, img.height, 'I420');
        
        // Create VideoFrame using utils.ts
        const inputFrame = createVideoFrameFromYUV(yuvData, {
          format: 'I420',
          width: img.width,
          height: img.height,
          timestamp: 0,
        });
        
        // Create Fisheye dewarper with test options
        const fisheyeOptions = ${JSON.stringify(fisheyeOptions)};
        const dewarper = new Fisheye(fisheyeOptions);
        
        // Dewarp the frame
        const outputFrame = await dewarper.dewarp(inputFrame);
        
        // Render output to canvas
        const outputCanvas = document.getElementById('outputCanvas');
        outputCanvas.width = fisheyeOptions.width;
        outputCanvas.height = fisheyeOptions.height;
        const outputCtx = outputCanvas.getContext('2d');
        outputCtx.drawImage(outputFrame, 0, 0);
        
        // Clean up
        inputFrame.close();
        outputFrame.close();
        dewarper.destroy();
        
        // Signal completion
        window.testComplete = true;
      } catch (error) {
        console.error('Test error:', error);
        window.testError = error.message;
        window.testComplete = true;
      }
    }
    
    runTest();
  </script>
</body>
</html>
    `;

    // Create blob URL for secure context
    const blob = new Blob([htmlContent], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);

    await page.goto(blobUrl);

    // Wait for test completion
    await page.waitForFunction(
      () => (window as Window & { testComplete?: boolean }).testComplete === true,
      {
        timeout: 30000,
      },
    );

    // Check for errors
    const error = await page.evaluate(() => (window as Window & { testError?: string }).testError);
    if (error) {
      throw new Error(`Test failed in browser: ${error}`);
    }

    // Wait for canvas to be ready
    const canvas = page.locator("#outputCanvas");
    await expect(canvas).toBeVisible();

    // Visual regression test
    await expect(canvas).toHaveScreenshot("dewarp-test.png", {
      threshold: 0.2, // Allow 20% pixel difference for GPU/driver variations
    });

    // Clean up blob URL
    await page.evaluate((url) => URL.revokeObjectURL(url), blobUrl);
  });
});
