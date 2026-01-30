import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TestCase {
  camera_id: number;
  scenario: string;
  description: string;
  original_image_path: string;
  dewarped_image_path: string;
  image_width: number;
  image_height: number;
  output_width: number;
  output_height: number;
  camera_matrix: {
    fx: number;
    fy: number;
    cx: number;
    cy: number;
  };
  distortion_coefficients: {
    k1: number;
    k2: number;
    k3: number;
    k4: number;
  };
  projection: "rectilinear" | "equirectangular" | "original";
  balance: number;
  fov_scale: number;
}

interface GpuAdapterInfo {
  vendor?: string;
  architecture?: string;
  error?: string;
}

interface TestWindow extends Window {
  Fisheye: typeof import("../../src/fisheye").Fisheye;
  testReady: boolean;
  webgpuAvailable: boolean;
  gpuAdapterInfo: GpuAdapterInfo | null;
}

function loadTestData(): TestCase[] {
  const dataPath = join(__dirname, "../fixture/test_cases.json");
  const data = readFileSync(dataPath, "utf-8");
  return JSON.parse(data);
}

test.describe("Fisheye E2E - OpenCV Comparison", () => {
  const testCases = loadTestData();

  test("WebGPU loads (adapter available)", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/test/e2e/test-page.html");
    await page.waitForFunction(() => (window as unknown as TestWindow).testReady === true, {
      timeout: 10000,
    });

    const webgpuAvailable = await page.evaluate(
      () => (window as unknown as TestWindow).webgpuAvailable,
    );
    const gpuAdapterInfo = await page.evaluate(
      () => (window as unknown as TestWindow).gpuAdapterInfo,
    );

    if (gpuAdapterInfo) {
      console.log("GPU adapter info:", JSON.stringify(gpuAdapterInfo, null, 2));
    }
    if (pageErrors.length > 0) {
      console.log("Page errors during load:", pageErrors);
    }

    expect(
      webgpuAvailable,
      "WebGPU must be available (Chromium may need --enable-unsafe-webgpu and --use-angle=swiftshader)",
    ).toBe(true);
  });

  for (const testCase of testCases) {
    const testName = `cam${testCase.camera_id}/${testCase.scenario}: ${testCase.description}`;

    test(testName, async ({ page }) => {
      const pageErrors: string[] = [];
      const consoleMessages: { type: string; text: string }[] = [];

      page.on("pageerror", (err) => pageErrors.push(err.message));
      page.on("console", (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));

      await page.goto("/test/e2e/test-page.html");

      try {
        await page.waitForFunction(() => (window as unknown as TestWindow).testReady === true, {
          timeout: 10000,
        });
      } catch (err) {
        const diagnostics = [
          "window.testReady did not become true (page script may have failed).",
          pageErrors.length > 0
            ? `Page errors:\n${pageErrors.map((e) => `  - ${e}`).join("\n")}`
            : "",
          consoleMessages.length > 0
            ? `Console:\n${consoleMessages.map((m) => `  [${m.type}] ${m.text}`).join("\n")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");
        throw new Error(`${diagnostics}\n\nOriginal: ${(err as Error).message}`);
      }

      const webgpuAvailable = await page.evaluate(
        () => (window as unknown as TestWindow).webgpuAvailable,
      );
      expect(webgpuAvailable, "WebGPU must be available for pixel comparison").toBe(true);

      const result = await page.evaluate(
        async ({
          originalPath,
          dewarpedPath,
          cameraMatrix,
          distortionCoeffs,
          outputWidth,
          outputHeight,
          projection,
          balance,
          fovScale,
        }) => {
          const loadImage = async (path: string): Promise<HTMLImageElement> => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = `/test/fixture/${path}`;
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error(`Failed to load: ${path}`));
            });
            return img;
          };

          const imageToImageData = (img: HTMLImageElement): ImageData => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Could not get canvas context");
            ctx.drawImage(img, 0, 0);
            return ctx.getImageData(0, 0, canvas.width, canvas.height);
          };

          const imageToVideoFrame = async (img: HTMLImageElement): Promise<VideoFrame> => {
            const bitmap = await createImageBitmap(img);
            return new VideoFrame(bitmap, { timestamp: 0 });
          };

          const videoFrameToImageData = async (frame: VideoFrame): Promise<ImageData> => {
            const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Could not get canvas context");
            ctx.drawImage(frame, 0, 0);
            return ctx.getImageData(0, 0, frame.displayWidth, frame.displayHeight);
          };

          const Fisheye = (
            window as unknown as { Fisheye: typeof import("../../src/fisheye").Fisheye }
          ).Fisheye;

          // Load images
          const originalImg = await loadImage(originalPath);
          const expectedImg = await loadImage(dewarpedPath);
          const expectedImageData = imageToImageData(expectedImg);

          // Create Fisheye instance with test parameters
          const fisheye = new Fisheye({
            fx: cameraMatrix.fx,
            fy: cameraMatrix.fy,
            cx: cameraMatrix.cx,
            cy: cameraMatrix.cy,
            k1: distortionCoeffs.k1,
            k2: distortionCoeffs.k2,
            k3: distortionCoeffs.k3,
            k4: distortionCoeffs.k4,
            width: outputWidth,
            height: outputHeight,
            balance: balance,
            fovScale: fovScale,
            projection: projection,
          });

          // Process
          const inputFrame = await imageToVideoFrame(originalImg);
          const outputFrame = await fisheye.undistort(inputFrame);
          const resultImageData = await videoFrameToImageData(outputFrame);

          // Cleanup frames
          inputFrame.close();
          outputFrame.close();
          fisheye.destroy();

          // Compare pixels
          const actual = resultImageData.data;
          const expected = expectedImageData.data;

          if (actual.length !== expected.length) {
            return {
              error: `Size mismatch: actual=${actual.length} (${resultImageData.width}x${resultImageData.height}), expected=${expected.length} (${expectedImageData.width}x${expectedImageData.height})`,
              mse: -1,
              psnr: -1,
              maxDiff: -1,
              matchPercent: 0,
            };
          }

          let sumSquaredError = 0;
          let maxDiff = 0;
          let matchCount = 0;
          const threshold = 10; // pixel difference threshold for "match"
          const numPixels = actual.length / 4;

          for (let i = 0; i < actual.length; i += 4) {
            const dr = Math.abs(actual[i] - expected[i]);
            const dg = Math.abs(actual[i + 1] - expected[i + 1]);
            const db = Math.abs(actual[i + 2] - expected[i + 2]);

            sumSquaredError += dr * dr + dg * dg + db * db;
            const pixelDiff = Math.max(dr, dg, db);
            maxDiff = Math.max(maxDiff, pixelDiff);

            if (pixelDiff <= threshold) {
              matchCount++;
            }
          }

          const mse = sumSquaredError / (numPixels * 3);
          const psnr = mse === 0 ? Infinity : 20 * Math.log10(255) - 10 * Math.log10(mse);
          const matchPercent = (matchCount / numPixels) * 100;

          return { mse, psnr, maxDiff, matchPercent, error: null };
        },
        {
          originalPath: testCase.original_image_path,
          dewarpedPath: testCase.dewarped_image_path,
          cameraMatrix: testCase.camera_matrix,
          distortionCoeffs: testCase.distortion_coefficients,
          outputWidth: testCase.output_width,
          outputHeight: testCase.output_height,
          projection: testCase.projection,
          balance: testCase.balance,
          fovScale: testCase.fov_scale,
        },
      );

      console.log(`${testName}:`);
      console.log(
        `  Config: ${testCase.projection}, balance=${testCase.balance}, fovScale=${testCase.fov_scale}`,
      );
      console.log(`  Output: ${testCase.output_width}x${testCase.output_height}`);
      console.log(`  MSE: ${result.mse.toFixed(2)}, PSNR: ${result.psnr.toFixed(2)} dB`);
      console.log(`  Max diff: ${result.maxDiff}, Match: ${result.matchPercent.toFixed(2)}%`);

      if (result.error) {
        throw new Error(result.error);
      }

      // Thresholds for passing (slightly relaxed for different projections)
      expect(result.mse).toBeLessThan(100);
      expect(result.psnr).toBeGreaterThan(30);
      expect(result.matchPercent).toBeGreaterThan(90);
    });
  }
});
