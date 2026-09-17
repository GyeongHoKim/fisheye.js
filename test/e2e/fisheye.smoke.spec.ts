import { expect, test } from "@playwright/test";

test("browser adapter accepts VideoFrame and preserves metadata", async ({ page }) => {
  await page.goto("/test/e2e/test-page.html");
  await page.waitForFunction(
    () => Reflect.get(window, "testReady") === true || Reflect.has(window, "testError"),
  );
  const testError = await page.evaluate(
    () => Reflect.get(window, "testError") as string | undefined,
  );
  expect(testError).toBeUndefined();

  const result = await page.evaluate(async () => {
    const Fisheye = Reflect.get(window, "Fisheye") as typeof import("../../src/fisheye").Fisheye;
    const canvas = new OffscreenCanvas(4, 4);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas unavailable");
    context.fillStyle = "rgb(12, 34, 56)";
    context.fillRect(0, 0, 4, 4);

    const input = new VideoFrame(canvas, { timestamp: 1234, duration: 40 });
    const fisheye = new Fisheye({
      width: 4,
      height: 4,
      projection: { kind: "original" },
    });
    try {
      const output = await fisheye.undistort(input);
      if (Array.isArray(output)) throw new Error("Expected one output frame");
      const value = {
        width: output.displayWidth,
        height: output.displayHeight,
        timestamp: output.timestamp,
        duration: output.duration,
      };
      output.close();
      return value;
    } finally {
      input.close();
      fisheye.destroy();
    }
  });

  expect(result).toEqual({ width: 4, height: 4, timestamp: 1234, duration: 40 });
});
