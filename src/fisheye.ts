import tgpu, { type TgpuBuffer, type TgpuTexture } from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import type { FisheyeConfig, FisheyeOptions } from "./types";

/**
 * Uniform struct for fisheye dewarping parameters
 */
const FisheyeUniforms = d.struct({
  distortion: d.f32,
  fov: d.f32,
  centerX: d.f32,
  centerY: d.f32,
  zoom: d.f32,
  width: d.f32,
  height: d.f32,
  padding: d.f32,
});

type TgpuRootType = Awaited<ReturnType<typeof tgpu.init>>;

/**
 * Bind group layout for fisheye dewarping compute shader
 */
const fisheyeLayout = tgpu.bindGroupLayout({
  inputTexture: { texture: d.texture2d() },
  outputTexture: { storageTexture: d.textureStorage2d("rgba8unorm") },
  uniforms: { uniform: FisheyeUniforms },
});

// Type definitions for textures with proper usage flags
type SampledTextureProps = {
  size: readonly [number, number];
  format: "rgba8unorm";
};

type StorageTextureProps = {
  size: readonly [number, number];
  format: "rgba8unorm";
};

type InputTextureType = TgpuTexture<SampledTextureProps> & {
  usableAsSampled: true;
};

type OutputTextureType = TgpuTexture<StorageTextureProps> & {
  usableAsStorage: true;
};

type UniformBufferType = TgpuBuffer<typeof FisheyeUniforms> & {
  usableAsUniform: true;
};

/**
 * Fisheye dewarper using WebGPU via TypeGPU (Pure GPGPU)
 *
 * @example
 * ```ts
 * const dewarper = new Fisheye({
 *   distortion: 0.5,
 *   width: 1920,
 *   height: 1080,
 * });
 *
 * const dewarpedFrame = await dewarper.dewarp(videoFrame);
 * ```
 */
export class Fisheye {
  private config: FisheyeConfig;
  private root: TgpuRootType | null = null;
  private uniformBuffer: UniformBufferType | null = null;
  private inputTexture: InputTextureType | null = null;
  private outputTexture: OutputTextureType | null = null;
  private readbackBuffer: GPUBuffer | null = null;
  private inputTextureSize: [number, number] = [0, 0];
  private outputTextureSize: [number, number] = [0, 0];

  constructor(options: FisheyeOptions = {}) {
    this.config = this.applyDefaults(options);
  }

  /**
   * Apply default values to options
   */
  private applyDefaults(options: FisheyeOptions): FisheyeConfig {
    return {
      distortion: options.distortion ?? 0.5,
      width: options.width ?? 640,
      height: options.height ?? 480,
      fov: options.fov ?? 180,
      centerX: options.centerX ?? 0,
      centerY: options.centerY ?? 0,
      zoom: options.zoom ?? 1.0,
    };
  }

  /**
   * Initialize TypeGPU root and resources
   */
  private async initialize(): Promise<void> {
    if (this.root) {
      return;
    }

    this.root = await tgpu.init();

    // Create uniform buffer with TypeGPU for type-safe data handling
    this.uniformBuffer = this.root
      .createBuffer(FisheyeUniforms, this.getUniformData())
      .$usage("uniform");
  }

  /**
   * Get uniform data from current configuration
   */
  private getUniformData(): d.Infer<typeof FisheyeUniforms> {
    return {
      distortion: this.config.distortion,
      fov: this.config.fov,
      centerX: this.config.centerX,
      centerY: this.config.centerY,
      zoom: this.config.zoom,
      width: this.config.width,
      height: this.config.height,
      padding: 0,
    };
  }

  /**
   * Update uniform buffer with current configuration
   */
  private updateUniforms(): void {
    if (!this.uniformBuffer) {
      return;
    }
    this.uniformBuffer.write(this.getUniformData());
  }

  /**
   * Create input texture with proper typing
   */
  private createInputTexture(root: TgpuRootType, width: number, height: number): InputTextureType {
    const size: readonly [number, number] = [width, height];
    const format: "rgba8unorm" = "rgba8unorm";
    return root["~unstable"].createTexture({ size, format }).$usage("sampled");
  }

  /**
   * Create output texture with proper typing (storage only, no render needed for GPGPU)
   */
  private createOutputTexture(
    root: TgpuRootType,
    width: number,
    height: number,
  ): OutputTextureType {
    const size: readonly [number, number] = [width, height];
    const format: "rgba8unorm" = "rgba8unorm";
    return root["~unstable"].createTexture({ size, format }).$usage("storage");
  }

  /**
   * Calculate bytes per row with proper alignment (256-byte alignment for WebGPU)
   */
  private calculateBytesPerRow(width: number): number {
    const bytesPerPixel = 4; // RGBA8
    const unalignedBytesPerRow = width * bytesPerPixel;
    // WebGPU requires 256-byte alignment for buffer copies
    return Math.ceil(unalignedBytesPerRow / 256) * 256;
  }

  /**
   * Create or recreate readback buffer for GPU to CPU data transfer
   */
  private createReadbackBuffer(device: GPUDevice, width: number, height: number): GPUBuffer {
    const bytesPerRow = this.calculateBytesPerRow(width);
    const bufferSize = bytesPerRow * height;

    return device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }

  /**
   * Dewarp a VideoFrame
   *
   * @param frame - Input VideoFrame with fisheye distortion
   * @returns Dewarped VideoFrame
   */
  async dewarp(frame: VideoFrame): Promise<VideoFrame> {
    await this.initialize();

    if (!this.root || !this.uniformBuffer) {
      throw new Error("GPU resources not initialized");
    }

    // Capture root for type narrowing
    const root = this.root;
    const device = root.device;

    // Create or recreate input texture if dimensions changed
    if (
      !this.inputTexture ||
      this.inputTextureSize[0] !== frame.displayWidth ||
      this.inputTextureSize[1] !== frame.displayHeight
    ) {
      this.inputTexture?.destroy();
      this.inputTexture = this.createInputTexture(root, frame.displayWidth, frame.displayHeight);
      this.inputTextureSize = [frame.displayWidth, frame.displayHeight];
    }

    // Create or recreate output texture and readback buffer if config dimensions changed
    if (
      !this.outputTexture ||
      this.outputTextureSize[0] !== this.config.width ||
      this.outputTextureSize[1] !== this.config.height
    ) {
      this.outputTexture?.destroy();
      this.readbackBuffer?.destroy();

      this.outputTexture = this.createOutputTexture(root, this.config.width, this.config.height);
      this.readbackBuffer = this.createReadbackBuffer(
        device,
        this.config.width,
        this.config.height,
      );
      this.outputTextureSize = [this.config.width, this.config.height];
    }

    // Capture for type narrowing
    const inputTexture = this.inputTexture;
    const outputTexture = this.outputTexture;
    const readbackBuffer = this.readbackBuffer;

    if (!readbackBuffer) {
      throw new Error("Readback buffer not initialized");
    }

    // Write VideoFrame to input texture
    inputTexture.write(frame);

    // Create bind group with TypeGPU using texture views
    const inputView = inputTexture.createView(d.texture2d());
    const outputView = outputTexture.createView(d.textureStorage2d("rgba8unorm"));

    const bindGroup = root.createBindGroup(fisheyeLayout, {
      inputTexture: inputView,
      outputTexture: outputView,
      uniforms: this.uniformBuffer,
    });

    // Create and execute the compute pipeline using guarded compute pipeline
    const dewarpPipeline = root["~unstable"].createGuardedComputePipeline(
      (x: number, y: number) => {
        "use gpu";

        const inputTex = fisheyeLayout.$.inputTexture;
        const outputTex = fisheyeLayout.$.outputTexture;
        const params = fisheyeLayout.$.uniforms;

        const dims = std.textureDimensions(inputTex);
        const coord = d.vec2i(x, y);

        // Early exit if outside texture bounds
        if (x >= dims.x || y >= dims.y) {
          return;
        }

        // Normalize coordinates to [-1, 1]
        const uv = d.vec2f(
          (d.f32(coord.x) / d.f32(dims.x) - 0.5) * 2.0,
          (d.f32(coord.y) / d.f32(dims.y) - 0.5) * 2.0,
        );

        // Apply center offset
        const centered = uv.sub(d.vec2f(params.centerX, params.centerY));

        // Calculate radius from center
        const r = std.length(centered);

        // Apply fisheye distortion correction: r' = r * (1 + k1 * r^2)
        const rDistorted = r * (1.0 + params.distortion * r * r);

        // Apply zoom
        const rScaled = rDistorted / params.zoom;

        // Convert back to texture coordinates
        let distortedUv = centered;
        if (r > 0.0001) {
          distortedUv = centered.mul(rScaled / r);
        }

        // Add center offset back and denormalize
        const finalUv = distortedUv.add(d.vec2f(params.centerX, params.centerY)).mul(0.5).add(0.5);

        // Sample from input texture if within bounds
        if (finalUv.x >= 0.0 && finalUv.x <= 1.0 && finalUv.y >= 0.0 && finalUv.y <= 1.0) {
          const sampleCoord = d.vec2i(
            d.i32(finalUv.x * d.f32(dims.x)),
            d.i32(finalUv.y * d.f32(dims.y)),
          );
          const color = std.textureLoad(inputTex, sampleCoord, 0);
          std.textureStore(outputTex, coord, color);
        } else {
          // Black for out of bounds
          std.textureStore(outputTex, coord, d.vec4f(0.0, 0.0, 0.0, 1.0));
        }
      },
    );

    // Execute the compute shader
    dewarpPipeline.with(bindGroup).dispatchThreads(this.config.width, this.config.height);

    // Copy texture to readback buffer for CPU access
    const bytesPerRow = this.calculateBytesPerRow(this.config.width);
    const outputGpuTexture = root.unwrap(outputTexture);

    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
      { texture: outputGpuTexture },
      { buffer: readbackBuffer, bytesPerRow },
      [this.config.width, this.config.height],
    );
    device.queue.submit([commandEncoder.finish()]);

    // Map buffer and read data
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const mappedData = readbackBuffer.getMappedRange();

    // Create RGBA data array, handling row alignment
    const bytesPerPixel = 4;
    const actualBytesPerRow = this.config.width * bytesPerPixel;
    const pixelData = new Uint8Array(this.config.width * this.config.height * bytesPerPixel);

    const srcView = new Uint8Array(mappedData);
    for (let row = 0; row < this.config.height; row++) {
      const srcOffset = row * bytesPerRow;
      const dstOffset = row * actualBytesPerRow;
      pixelData.set(srcView.subarray(srcOffset, srcOffset + actualBytesPerRow), dstOffset);
    }

    readbackBuffer.unmap();

    // Create VideoFrame directly from RGBA data (pure GPGPU, no canvas)
    return new VideoFrame(pixelData, {
      format: "RGBA",
      codedWidth: this.config.width,
      codedHeight: this.config.height,
      timestamp: frame.timestamp,
    });
  }

  /**
   * Update configuration
   */
  updateConfig(options: Partial<FisheyeOptions>): void {
    this.config = this.applyDefaults({ ...this.config, ...options });
    this.updateUniforms();

    // Recreate output texture and readback buffer if size changed
    if (options.width || options.height) {
      this.outputTexture?.destroy();
      this.readbackBuffer?.destroy();
      this.outputTexture = null;
      this.readbackBuffer = null;
      this.outputTextureSize = [0, 0];
    }
  }

  /**
   * Clean up GPU resources
   */
  destroy(): void {
    this.inputTexture?.destroy();
    this.outputTexture?.destroy();
    this.readbackBuffer?.destroy();
    this.root?.destroy();

    this.inputTexture = null;
    this.outputTexture = null;
    this.readbackBuffer = null;
    this.uniformBuffer = null;
    this.root = null;
    this.inputTextureSize = [0, 0];
    this.outputTextureSize = [0, 0];
  }
}
