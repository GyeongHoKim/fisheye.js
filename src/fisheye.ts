import tgpu, { type TgpuBuffer, type TgpuTexture } from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import type { FisheyeConfig, FisheyeOptions } from "./types";

/**
 * Uniform struct for fisheye dewarping parameters (type-safe with layout)
 */
const FisheyeUniforms = d.struct({
  k1: d.f32,
  k2: d.f32,
  k3: d.f32,
  k4: d.f32,
  fov: d.f32,
  centerX: d.f32,
  centerY: d.f32,
  zoom: d.f32,
  width: d.f32,
  height: d.f32,
  inputWidth: d.f32,
  inputHeight: d.f32,
  padding: d.f32,
});

type TgpuRootType = Awaited<ReturnType<typeof tgpu.init>>;

/**
 * Bind group layout for fisheye dewarping compute shader (type-safe access via layout.$)
 */
const fisheyeLayout = tgpu.bindGroupLayout({
  inputTexture: { texture: d.texture2d() },
  outputTexture: { storageTexture: d.textureStorage2d("rgba8unorm") },
  uniforms: { uniform: FisheyeUniforms },
});

/** Input texture props (sampled + render for write(); per TypeGPU docs) */
type InputTextureProps = {
  size: readonly [number, number];
  format: "rgba8unorm";
};

/** Output texture props (storage) */
type OutputTextureProps = {
  size: readonly [number, number];
  format: "rgba8unorm";
};

type InputTextureType = TgpuTexture<InputTextureProps> & {
  usableAsSampled: true;
  usableAsRender: true;
};

type OutputTextureType = TgpuTexture<OutputTextureProps> & {
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
  private bindGroup: ReturnType<TgpuRootType["createBindGroup"]> | null = null;
  private dewarpPipeline: ReturnType<
    TgpuRootType["~unstable"]["createGuardedComputePipeline"]
  > | null = null;
  private readbackBuffers: [GPUBuffer | null, GPUBuffer | null] | null = null;
  private readbackIndex = 0;
  private readbackHasData: [boolean, boolean] = [false, false];
  private readbackBytesPerRow = 0;
  private readbackActualBytesPerRow = 0;
  private pixelBuffer: Uint8Array | null = null;
  private inputTextureSize: [number, number] = [0, 0];
  private outputTextureSize: [number, number] = [0, 0];
  private uniformInputWidth = 0;
  private uniformInputHeight = 0;

  constructor(options: FisheyeOptions = {}) {
    this.config = this.applyDefaults(options);
  }

  /**
   * Apply default values to options
   */
  private applyDefaults(options: FisheyeOptions): FisheyeConfig {
    const k1 = options.k1 ?? 0;
    return {
      k1,
      k2: options.k2 ?? 0,
      k3: options.k3 ?? 0,
      k4: options.k4 ?? 0,
      width: options.width ?? 300,
      height: options.height ?? 150,
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

    this.dewarpPipeline = this.root["~unstable"].createGuardedComputePipeline(
      (x: number, y: number) => {
        "use gpu";

        const p = fisheyeLayout.$.uniforms;
        const outputW = p.width;
        const outputH = p.height;
        const inputW = p.inputWidth;
        const inputH = p.inputHeight;
        const coord = d.vec2i(x, y);

        if (d.f32(x) >= outputW || d.f32(y) >= outputH) {
          return;
        }

        const uv = d.vec2f(
          (d.f32(coord.x) / outputW - 0.5) * 2.0,
          (d.f32(coord.y) / outputH - 0.5) * 2.0,
        );

        const centerX = p.centerX;
        const centerY = p.centerY;
        const centered = uv.sub(d.vec2f(centerX, centerY));
        const r = std.length(centered);
        // Scale r so output corner maps to fov/2, but cap so sampling stays inside input (theta_d <= sqrt(2)).
        const cornerNorm = Math.SQRT2;
        const fovRad = std.min(p.fov * 0.017453293, 3.1);
        const scaleRaw = std.tan(fovRad * 0.5) / cornerNorm;
        const scale = std.min(scaleRaw, 1.0);
        const rScaledForFov = r * scale;

        const theta = std.atan(rScaledForFov);
        const theta2 = theta * theta;
        const theta4 = theta2 * theta2;
        const theta6 = theta4 * theta2;
        const theta8 = theta4 * theta4;
        // OpenCV fisheye: distorted normalized radius = θ_d. x' = (θ_d/r)*a => |(x',y')| = θ_d.
        const thetaDistorted =
          theta * (1.0 + p.k1 * theta2 + p.k2 * theta4 + p.k3 * theta6 + p.k4 * theta8);
        const rDistorted = thetaDistorted;
        const rScaled = rDistorted / p.zoom;

        let distortedUv = d.vec2f(centered.x, centered.y);
        if (r > 0.0001) {
          distortedUv = d.vec2f(centered.x * (rScaled / r), centered.y * (rScaled / r));
        }

        const finalUv = distortedUv.add(d.vec2f(centerX, centerY)).mul(0.5).add(0.5);

        if (finalUv.x >= 0.0 && finalUv.x <= 1.0 && finalUv.y >= 0.0 && finalUv.y <= 1.0) {
          const sampleCoord = d.vec2i(d.i32(finalUv.x * inputW), d.i32(finalUv.y * inputH));
          const color = std.textureLoad(fisheyeLayout.$.inputTexture, sampleCoord, 0);
          std.textureStore(fisheyeLayout.$.outputTexture, coord, color);
        } else {
          std.textureStore(fisheyeLayout.$.outputTexture, coord, d.vec4f(0.0, 0.0, 0.0, 1.0));
        }
      },
    );
  }

  /**
   * Get uniform data from current configuration
   */
  private getUniformData(): d.Infer<typeof FisheyeUniforms> {
    return {
      k1: this.config.k1,
      k2: this.config.k2,
      k3: this.config.k3,
      k4: this.config.k4,
      fov: this.config.fov,
      centerX: this.config.centerX,
      centerY: this.config.centerY,
      zoom: this.config.zoom,
      width: this.config.width,
      height: this.config.height,
      inputWidth: this.uniformInputWidth,
      inputHeight: this.uniformInputHeight,
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

  private async readbackToVideoFrame(
    device: GPUDevice,
    outputTexture: GPUTexture,
    timestamp: number,
  ): Promise<VideoFrame> {
    const readbackBuffers = this.readbackBuffers;

    if (!readbackBuffers) {
      throw new Error("Readback buffer not initialized");
    }

    const writeIndex = this.readbackIndex;
    const readIndex = 1 - writeIndex;
    const writeBuffer = readbackBuffers[writeIndex];
    const readBuffer = readbackBuffers[readIndex];

    if (!writeBuffer || !readBuffer) {
      throw new Error("Readback buffer not initialized");
    }

    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
      { texture: outputTexture },
      { buffer: writeBuffer, bytesPerRow: this.readbackBytesPerRow },
      [this.config.width, this.config.height],
    );
    device.queue.submit([commandEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();

    this.readbackHasData[writeIndex] = true;
    this.readbackIndex = readIndex;

    const bufferToRead = this.readbackHasData[readIndex] ? readBuffer : writeBuffer;

    await bufferToRead.mapAsync(GPUMapMode.READ);
    const mappedData = bufferToRead.getMappedRange();

    const pixelData =
      this.pixelBuffer ?? new Uint8Array(this.config.width * this.config.height * 4);
    const srcView = new Uint8Array(mappedData);

    for (let row = 0; row < this.config.height; row++) {
      const srcOffset = row * this.readbackBytesPerRow;
      const dstOffset = row * this.readbackActualBytesPerRow;
      pixelData.set(
        srcView.subarray(srcOffset, srcOffset + this.readbackActualBytesPerRow),
        dstOffset,
      );
    }

    bufferToRead.unmap();

    return new VideoFrame(pixelData, {
      format: "RGBA",
      codedWidth: this.config.width,
      codedHeight: this.config.height,
      timestamp,
    });
  }

  /**
   * Create input texture (TypeGPU; per official docs: sampled + render for .write(image/VideoFrame)).
   */
  private createInputTexture(root: TgpuRootType, width: number, height: number): InputTextureType {
    const size: readonly [number, number] = [width, height];
    const format: "rgba8unorm" = "rgba8unorm";
    return root["~unstable"].createTexture({ size, format }).$usage("sampled", "render");
  }

  /**
   * Create output storage texture (TypeGPU; type-safe with layout.$)
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

    if (
      !this.inputTexture ||
      this.inputTextureSize[0] !== frame.displayWidth ||
      this.inputTextureSize[1] !== frame.displayHeight
    ) {
      this.inputTexture?.destroy();
      this.inputTexture = this.createInputTexture(root, frame.displayWidth, frame.displayHeight);
      this.inputTextureSize = [frame.displayWidth, frame.displayHeight];
      this.bindGroup = null;
    }

    if (
      !this.outputTexture ||
      this.outputTextureSize[0] !== this.config.width ||
      this.outputTextureSize[1] !== this.config.height
    ) {
      this.outputTexture?.destroy();
      this.readbackBuffers?.[0]?.destroy();
      this.readbackBuffers?.[1]?.destroy();

      this.outputTexture = this.createOutputTexture(root, this.config.width, this.config.height);
      this.readbackBytesPerRow = this.calculateBytesPerRow(this.config.width);
      this.readbackActualBytesPerRow = this.config.width * 4;
      this.pixelBuffer = new Uint8Array(this.config.width * this.config.height * 4);
      this.readbackBuffers = [
        this.createReadbackBuffer(device, this.config.width, this.config.height),
        this.createReadbackBuffer(device, this.config.width, this.config.height),
      ];
      this.readbackIndex = 0;
      this.readbackHasData = [false, false];
      this.outputTextureSize = [this.config.width, this.config.height];
      this.bindGroup = null;
    }

    const inputTexture = this.inputTexture;
    const outputTexture = this.outputTexture;

    if (!inputTexture || !outputTexture) throw new Error("Textures not initialized");

    inputTexture.write(frame);

    this.uniformInputWidth = frame.displayWidth;
    this.uniformInputHeight = frame.displayHeight;
    this.updateUniforms();

    if (!this.bindGroup) {
      this.bindGroup = root.createBindGroup(fisheyeLayout, {
        inputTexture,
        outputTexture,
        uniforms: this.uniformBuffer,
      });
    }

    const bindGroup = this.bindGroup;
    const dewarpPipeline = this.dewarpPipeline;

    if (!dewarpPipeline || !outputTexture) {
      throw new Error("Compute pipeline or output texture not initialized");
    }

    dewarpPipeline.with(bindGroup).dispatchThreads(this.config.width, this.config.height);

    const outputGpuTexture = root.unwrap(outputTexture);
    return this.readbackToVideoFrame(device, outputGpuTexture, frame.timestamp);
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
      this.readbackBuffers?.[0]?.destroy();
      this.readbackBuffers?.[1]?.destroy();
      this.outputTexture = null;
      this.readbackBuffers = null;
      this.readbackIndex = 0;
      this.readbackHasData = [false, false];
      this.outputTextureSize = [0, 0];
      this.readbackBytesPerRow = 0;
      this.readbackActualBytesPerRow = 0;
      this.pixelBuffer = null;
    }
  }

  /**
   * Clean up GPU resources
   */
  destroy(): void {
    this.inputTexture?.destroy();
    this.outputTexture?.destroy();
    this.readbackBuffers?.[0]?.destroy();
    this.readbackBuffers?.[1]?.destroy();
    this.root?.destroy();

    this.inputTexture = null;
    this.outputTexture = null;
    this.readbackBuffers = null;
    this.readbackIndex = 0;
    this.readbackHasData = [false, false];
    this.uniformBuffer = null;
    this.root = null;
    this.bindGroup = null;
    this.dewarpPipeline = null;
    this.readbackBytesPerRow = 0;
    this.readbackActualBytesPerRow = 0;
    this.pixelBuffer = null;
    this.inputTextureSize = [0, 0];
    this.outputTextureSize = [0, 0];
  }
}
