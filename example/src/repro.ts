/**
 * E2E repro: runs the exact Fisheye.dewarp() path and exposes the result.
 * Used by test/dewarp-typegpu-invariant.spec.ts to assert on the thrown error.
 */

import type { FisheyeOptions } from "@gyeonghokim/fisheye.js";
import { Fisheye } from "@gyeonghokim/fisheye.js";

export type ReproResult = { success: true } | { error: string };

export async function runDewarpRepro(
  imageBase64: string,
  fisheyeOptions: FisheyeOptions,
): Promise<ReproResult> {
  const dataUrl = `data:image/jpeg;base64,${imageBase64}`;

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });

  const bitmap = await createImageBitmap(img);
  const inputFrame = new VideoFrame(bitmap, { timestamp: 0 });

  try {
    const dewarper = new Fisheye(fisheyeOptions);
    const outputFrame = await dewarper.dewarp(inputFrame);
    inputFrame.close();
    outputFrame.close();
    dewarper.destroy();
    return { success: true };
  } catch (e) {
    inputFrame.close();
    const err = e instanceof Error ? e : new Error(String(e));
    const message = err.stack ?? err.message;
    return { error: message };
  }
}

declare global {
  interface Window {
    __runDewarpRepro: typeof runDewarpRepro;
  }
}

window.__runDewarpRepro = runDewarpRepro;
