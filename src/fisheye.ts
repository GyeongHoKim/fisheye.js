import { type NormalizedConfig, normalizeOptions, updateOptions } from "./config";
import { TextureProcessor } from "./texture-processor";
import type { FisheyeOptions } from "./types";

/** Browser VideoFrame adapter over the shared WebGPU texture processor. */
export class Fisheye {
  private config: NormalizedConfig;
  private engine: TextureProcessor | undefined;
  private device: GPUDevice | undefined;
  private busy = false;
  private destroyed = false;

  constructor(options: FisheyeOptions = {}) {
    this.config = normalizeOptions(options);
  }

  private async getEngine(): Promise<TextureProcessor> {
    if (this.engine) return this.engine;
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error("WebGPU adapter unavailable");
    const device = await adapter.requestDevice();
    if (this.destroyed) {
      device.destroy();
      throw new Error("Fisheye has been destroyed");
    }
    this.device = device;
    this.engine = new TextureProcessor(device, this.options());
    return this.engine;
  }

  async undistort(frame: VideoFrame): Promise<VideoFrame | VideoFrame[]> {
    if (this.destroyed) throw new Error("Fisheye has been destroyed");
    if (this.busy)
      throw new Error("Await the previous undistort call before processing another frame");
    this.busy = true;
    const frames: VideoFrame[] = [];
    try {
      const engine = await this.getEngine();
      const device = this.device;
      if (!device) throw new Error("GPU device unavailable");
      const input = engine.getInputTexture(frame.displayWidth, frame.displayHeight);
      device.queue.copyExternalImageToTexture({ source: frame }, { texture: input }, [
        frame.displayWidth,
        frame.displayHeight,
      ]);
      const outputs = engine.process(frame.displayWidth, frame.displayHeight);
      for (const texture of outputs) {
        const pixels = await engine.readPixels(texture);
        frames.push(
          new VideoFrame(pixels, {
            format: "RGBA",
            codedWidth: texture.width,
            codedHeight: texture.height,
            timestamp: frame.timestamp,
            ...(frame.duration === null ? {} : { duration: frame.duration }),
          }),
        );
      }
      return this.config.pane ? frames : frames[0];
    } catch (error) {
      for (const output of frames) output.close();
      throw error;
    } finally {
      this.busy = false;
      if (this.destroyed) this.releaseResources();
    }
  }

  private options(): FisheyeOptions {
    const { lens, size, projection, ptz, pane, balance, fovScale } = this.config;
    if (lens.kind === "onvif") return { lens, size, projection, ptz, pane } as FisheyeOptions;
    return { lens, size, projection, ptz, pane, balance, fovScale } as FisheyeOptions;
  }
  updateConfig(options: Partial<FisheyeOptions>): void {
    if (this.destroyed || this.busy) throw new Error("Cannot update a destroyed or busy Fisheye");
    const next = updateOptions(this.config, options);
    this.engine?.updateConfig(options);
    this.config = next;
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.busy) this.releaseResources();
  }

  private releaseResources(): void {
    this.engine?.destroy();
    this.device?.destroy();
    this.engine = undefined;
    this.device = undefined;
  }
}
