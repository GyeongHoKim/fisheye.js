import tgpu, { type TgpuBuffer, type TgpuTexture } from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import type { FisheyeConfig, FisheyeOptions } from "./types";

const FisheyeUniforms = d.struct({
  fx: d.f32,
  fy: d.f32,
  cx: d.f32,
  cy: d.f32,
  k1: d.f32,
  k2: d.f32,
  k3: d.f32,
  k4: d.f32,
  newFx: d.f32,
  newFy: d.f32,
  newCx: d.f32,
  newCy: d.f32,
  outputWidth: d.f32,
  outputHeight: d.f32,
  inputWidth: d.f32,
  inputHeight: d.f32,
  projection: d.f32,
  _pad1: d.f32,
  _pad2: d.f32,
  _pad3: d.f32,
});

type TgpuRootType = Awaited<ReturnType<typeof tgpu.init>>;

const fisheyeLayout = tgpu.bindGroupLayout({
  inputTexture: { texture: d.texture2d() },
  outputTexture: { storageTexture: d.textureStorage2d("rgba8unorm") },
  uniforms: { uniform: FisheyeUniforms },
});

type InputTextureProps = {
  size: readonly [number, number];
  format: "rgba8unorm";
};

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

interface NewCameraMatrix {
  newFx: number;
  newFy: number;
  newCx: number;
  newCy: number;
}

/**
 * Fisheye undistortion using WebGPU via TypeGPU.
 * Implements OpenCV fisheye model (Kannala-Brandt).
 */
export class Fisheye {
  private config: FisheyeConfig;
  private root: TgpuRootType | null = null;
  private uniformBuffer: UniformBufferType | null = null;
  private inputTexture: InputTextureType | null = null;
  private outputTexture: OutputTextureType | null = null;
  private bindGroup: ReturnType<TgpuRootType["createBindGroup"]> | null = null;
  private pipeline: ReturnType<TgpuRootType["~unstable"]["createGuardedComputePipeline"]> | null =
    null;
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
  private cachedNewCameraMatrix: NewCameraMatrix | null = null;

  constructor(options: FisheyeOptions = {}) {
    this.config = this.applyDefaults(options);
  }

  private applyDefaults(options: FisheyeOptions): FisheyeConfig {
    const width = options.width ?? 300;
    const height = options.height ?? 150;

    return {
      k1: options.k1 ?? 0,
      k2: options.k2 ?? 0,
      k3: options.k3 ?? 0,
      k4: options.k4 ?? 0,
      width,
      height,
      balance: Math.max(0, Math.min(1, options.balance ?? 0.0)),
      fovScale: options.fovScale ?? 1.0,
      projection: options.projection ?? "rectilinear",
      mount: options.mount ?? "ceiling",
      fx: options.fx,
      fy: options.fy,
      cx: options.cx,
      cy: options.cy,
    };
  }

  /** Undistort a point using Newton's method (OpenCV fisheye inverse). */
  private undistortPointNormalized(
    distortedX: number,
    distortedY: number,
    k1: number,
    k2: number,
    k3: number,
    k4: number,
  ): [number, number] {
    const thetaD = Math.sqrt(distortedX * distortedX + distortedY * distortedY);
    const thetaDClipped = Math.min(Math.max(-Math.PI / 2, thetaD), Math.PI / 2);

    if (Math.abs(thetaDClipped) < 1e-8) {
      return [distortedX, distortedY];
    }

    let theta = thetaDClipped;
    for (let i = 0; i < 20; i++) {
      const theta2 = theta * theta;
      const theta4 = theta2 * theta2;
      const theta6 = theta4 * theta2;
      const theta8 = theta4 * theta4;

      const f = theta * (1 + k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8) - thetaDClipped;
      const fPrime = 1 + 3 * k1 * theta2 + 5 * k2 * theta4 + 7 * k3 * theta6 + 9 * k4 * theta8;

      const thetaFix = f / fPrime;
      theta = theta - thetaFix;

      if (Math.abs(thetaFix) < 1e-10) {
        break;
      }
    }

    const scale = Math.tan(theta) / thetaDClipped;
    return [distortedX * scale, distortedY * scale];
  }

  private undistortPixelToNormalized(
    px: number,
    py: number,
    fx: number,
    fy: number,
    cx: number,
    cy: number,
  ): [number, number] {
    const xNorm = (px - cx) / fx;
    const yNorm = (py - cy) / fy;
    return this.undistortPointNormalized(
      xNorm,
      yNorm,
      this.config.k1,
      this.config.k2,
      this.config.k3,
      this.config.k4,
    );
  }

  /** Compute new camera matrix (OpenCV estimateNewCameraMatrixForUndistortRectify). */
  private computeNewCameraMatrix(inputWidth: number, inputHeight: number): NewCameraMatrix {
    const w = inputWidth;
    const h = inputHeight;
    const fx = this.config.fx ?? inputWidth;
    const fy = this.config.fy ?? inputWidth;
    const cx = this.config.cx ?? inputWidth / 2;
    const cy = this.config.cy ?? inputHeight / 2;
    const balance = this.config.balance;
    const fovScale = this.config.fovScale;

    const points: [number, number][] = [
      [w / 2, 0],
      [w, h / 2],
      [w / 2, h],
      [0, h / 2],
    ];

    const undistortedPoints = points.map(([px, py]) =>
      this.undistortPixelToNormalized(px, py, fx, fy, cx, cy),
    );

    let centerX = 0;
    let centerY = 0;
    for (const [x, y] of undistortedPoints) {
      centerX += x;
      centerY += y;
    }
    centerX /= undistortedPoints.length;
    centerY /= undistortedPoints.length;

    const aspectRatio = fx / fy;
    const cn: [number, number] = [centerX, centerY * aspectRatio];
    const scaledPoints = undistortedPoints.map(
      ([x, y]) => [x, y * aspectRatio] as [number, number],
    );

    let minX = Number.MAX_VALUE;
    let maxX = -Number.MAX_VALUE;
    let minY = Number.MAX_VALUE;
    let maxY = -Number.MAX_VALUE;

    for (const [x, y] of scaledPoints) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    const f1 = (w * 0.5) / (cn[0] - minX);
    const f2 = (w * 0.5) / (maxX - cn[0]);
    const f3 = (h * 0.5 * aspectRatio) / (cn[1] - minY);
    const f4 = (h * 0.5 * aspectRatio) / (maxY - cn[1]);

    const fMin = Math.min(f1, f2, f3, f4);
    const fMax = Math.max(f1, f2, f3, f4);

    let f = balance * fMin + (1.0 - balance) * fMax;
    if (fovScale > 0) {
      f *= 1.0 / fovScale;
    }

    const newCx = -cn[0] * f + w * 0.5;
    const newCy = (-cn[1] * f) / aspectRatio + h * 0.5;

    const rx = this.config.width / w;
    const ry = this.config.height / h;

    return {
      newFx: f * rx,
      newFy: (f / aspectRatio) * ry,
      newCx: newCx * rx,
      newCy: newCy * ry,
    };
  }

  private async initialize(): Promise<void> {
    if (this.root) {
      return;
    }

    this.root = await tgpu.init();
    this.uniformBuffer = this.root
      .createBuffer(FisheyeUniforms, this.getUniformData())
      .$usage("uniform");

    this.pipeline = this.root["~unstable"].createGuardedComputePipeline((x: number, y: number) => {
      "use gpu";

      const p = fisheyeLayout.$.uniforms;
      const outputW = p.outputWidth;
      const outputH = p.outputHeight;
      const inputW = p.inputWidth;
      const inputH = p.inputHeight;
      const coord = d.vec2i(x, y);
      const coordXf = d.f32(coord.x);
      const coordYf = d.f32(coord.y);

      if (coordXf >= outputW || coordYf >= outputH) {
        return;
      }

      // Original projection (pass-through)
      if (p.projection >= 1.5) {
        const u = coordXf / outputW;
        const v = coordYf / outputH;
        const sampleCoord = d.vec2i(d.i32(u * inputW), d.i32(v * inputH));
        const color = std.textureLoad(fisheyeLayout.$.inputTexture, sampleCoord, 0);
        std.textureStore(fisheyeLayout.$.outputTexture, coord, color);
        return;
      }

      // Step 1: Projection → normalized coordinates
      let normX = (coordXf - p.newCx) / p.newFx;
      let normY = (coordYf - p.newCy) / p.newFy;

      // Equirectangular projection
      if (p.projection >= 0.5) {
        const lon = (coordXf / outputW - 0.5) * Math.PI * 2.0;
        const lat = (coordYf / outputH - 0.5) * Math.PI;
        const cosLat = std.cos(lat);
        const dirX = std.sin(lon) * cosLat;
        const dirY = std.sin(lat);
        const dirZ = std.cos(lon) * cosLat;
        const safeZ = std.max(dirZ, 0.001);
        normX = dirX / safeZ;
        normY = dirY / safeZ;
      }

      // Step 2: Apply fisheye distortion (OpenCV forward model)
      const r = std.sqrt(normX * normX + normY * normY);
      const theta = std.atan(r);
      const theta2 = theta * theta;
      const theta4 = theta2 * theta2;
      const theta6 = theta4 * theta2;
      const theta8 = theta4 * theta4;
      const thetaD = theta * (1.0 + p.k1 * theta2 + p.k2 * theta4 + p.k3 * theta6 + p.k4 * theta8);
      const safeR = std.max(r, 1e-8);
      const scale = thetaD / safeR;
      const distortedX = normX * scale;
      const distortedY = normY * scale;

      // Step 3: Convert to input pixel coordinates
      const u = p.fx * distortedX + p.cx;
      const v = p.fy * distortedY + p.cy;
      const finalU = u / inputW;
      const finalV = v / inputH;

      // Step 4: Sample and store
      const inBounds = finalU >= 0.0 && finalU <= 1.0 && finalV >= 0.0 && finalV <= 1.0;
      if (inBounds) {
        const sampleCoord = d.vec2i(d.i32(finalU * inputW), d.i32(finalV * inputH));
        const color = std.textureLoad(fisheyeLayout.$.inputTexture, sampleCoord, 0);
        std.textureStore(fisheyeLayout.$.outputTexture, coord, color);
      } else {
        std.textureStore(fisheyeLayout.$.outputTexture, coord, d.vec4f(0.0, 0.0, 0.0, 1.0));
      }
    });
  }

  private getUniformData(): d.Infer<typeof FisheyeUniforms> {
    const inputWidth = this.uniformInputWidth || this.config.width;
    const inputHeight = this.uniformInputHeight || this.config.height;

    const fx = this.config.fx ?? inputWidth;
    const fy = this.config.fy ?? inputWidth;
    const cx = this.config.cx ?? inputWidth / 2;
    const cy = this.config.cy ?? inputHeight / 2;

    if (
      !this.cachedNewCameraMatrix ||
      this.uniformInputWidth !== inputWidth ||
      this.uniformInputHeight !== inputHeight
    ) {
      this.cachedNewCameraMatrix = this.computeNewCameraMatrix(inputWidth, inputHeight);
    }
    const newCam = this.cachedNewCameraMatrix;

    let projectionValue = 0;
    if (this.config.projection === "equirectangular") {
      projectionValue = 1;
    } else if (this.config.projection === "original") {
      projectionValue = 2;
    }

    return {
      fx,
      fy,
      cx,
      cy,
      k1: this.config.k1,
      k2: this.config.k2,
      k3: this.config.k3,
      k4: this.config.k4,
      newFx: newCam.newFx,
      newFy: newCam.newFy,
      newCx: newCam.newCx,
      newCy: newCam.newCy,
      outputWidth: this.config.width,
      outputHeight: this.config.height,
      inputWidth,
      inputHeight,
      projection: projectionValue,
      _pad1: 0,
      _pad2: 0,
      _pad3: 0,
    };
  }

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

  private createInputTexture(root: TgpuRootType, width: number, height: number): InputTextureType {
    const size: readonly [number, number] = [width, height];
    const format: "rgba8unorm" = "rgba8unorm";
    return root["~unstable"].createTexture({ size, format }).$usage("sampled", "render");
  }

  private createOutputTexture(
    root: TgpuRootType,
    width: number,
    height: number,
  ): OutputTextureType {
    const size: readonly [number, number] = [width, height];
    const format: "rgba8unorm" = "rgba8unorm";
    return root["~unstable"].createTexture({ size, format }).$usage("storage");
  }

  private calculateBytesPerRow(width: number): number {
    const bytesPerPixel = 4;
    const unalignedBytesPerRow = width * bytesPerPixel;
    return Math.ceil(unalignedBytesPerRow / 256) * 256;
  }

  private createReadbackBuffer(device: GPUDevice, width: number, height: number): GPUBuffer {
    const bytesPerRow = this.calculateBytesPerRow(width);
    const bufferSize = bytesPerRow * height;

    return device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }

  /** Undistort a VideoFrame. */
  async undistort(frame: VideoFrame): Promise<VideoFrame> {
    await this.initialize();

    if (!this.root || !this.uniformBuffer) {
      throw new Error("GPU resources not initialized");
    }

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

    if (
      this.uniformInputWidth !== frame.displayWidth ||
      this.uniformInputHeight !== frame.displayHeight
    ) {
      this.uniformInputWidth = frame.displayWidth;
      this.uniformInputHeight = frame.displayHeight;
      this.cachedNewCameraMatrix = null;
    }
    this.updateUniforms();

    if (!this.bindGroup) {
      this.bindGroup = root.createBindGroup(fisheyeLayout, {
        inputTexture,
        outputTexture,
        uniforms: this.uniformBuffer,
      });
    }

    const bindGroup = this.bindGroup;
    if (!this.pipeline || !outputTexture) {
      throw new Error("Compute pipeline or output texture not initialized");
    }

    this.pipeline.with(bindGroup).dispatchThreads(this.config.width, this.config.height);

    const outputGpuTexture = root.unwrap(outputTexture);
    return this.readbackToVideoFrame(device, outputGpuTexture, frame.timestamp);
  }

  /** Update configuration. */
  updateConfig(options: Partial<FisheyeOptions>): void {
    const prevWidth = this.config.width;
    const prevHeight = this.config.height;
    this.config = this.applyDefaults({ ...this.config, ...options });
    this.cachedNewCameraMatrix = null;
    this.updateUniforms();

    if (this.config.width !== prevWidth || this.config.height !== prevHeight) {
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

  /** Clean up GPU resources. */
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
    this.pipeline = null;
    this.readbackBytesPerRow = 0;
    this.readbackActualBytesPerRow = 0;
    this.pixelBuffer = null;
    this.inputTextureSize = [0, 0];
    this.outputTextureSize = [0, 0];
    this.cachedNewCameraMatrix = null;
  }
}
