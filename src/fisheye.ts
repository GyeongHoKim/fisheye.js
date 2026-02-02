import tgpu, { type TgpuBuffer, type TgpuTexture } from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import type { FisheyeConfig, FisheyeOptions, FisheyeOptionsStrict } from "./types";
import { DEFAULT_PROJECTION, isRectilinearManual } from "./types";

const FisheyeUniforms = d.struct({
  fx: d.f32,
  fy: d.f32,
  cx: d.f32,
  cy: d.f32,
  alpha: d.f32,
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

interface InternalCameraMatrix {
  newFx: number;
  newFy: number;
  newCx: number;
  newCy: number;
}

/**
 * Fisheye undistortion using WebGPU via TypeGPU.
 * @see {@link https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html}
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
  private cachedNewCameraMatrix: InternalCameraMatrix | null = null;

  constructor(options: FisheyeOptions = {}) {
    this.config = this.applyDefaults(options);
  }

  private applyDefaults(options: FisheyeOptions): FisheyeConfig {
    // Handle both flat options (FisheyeOptionsStrict) and grouped config (FisheyeConfig)
    const isGrouped = "D" in options && "size" in options;

    if (isGrouped) {
      const grouped = options as FisheyeConfig;
      return {
        K: grouped.K,
        D: grouped.D,
        size: grouped.size,
        balance: Math.max(0, Math.min(1, grouped.balance)),
        fovScale: grouped.fovScale,
        projection: grouped.projection,
      };
    }

    // Flat options → grouped config
    const flat = options as FisheyeOptionsStrict;
    const { fx, fy, cx, cy, alpha, k1, k2, k3, k4, width, height, balance, fovScale, projection } =
      flat;

    return {
      K: fx !== undefined && fy !== undefined ? { fx, fy, cx, cy, alpha } : undefined,
      D: { k1: k1 ?? 0, k2: k2 ?? 0, k3: k3 ?? 0, k4: k4 ?? 0 },
      size: { width: width ?? 300, height: height ?? 150 },
      balance: Math.max(0, Math.min(1, balance ?? 0.0)),
      fovScale: fovScale ?? 1.0,
      projection: projection ?? DEFAULT_PROJECTION,
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
      this.config.D.k1,
      this.config.D.k2,
      this.config.D.k3,
      this.config.D.k4,
    );
  }

  /** @see {@link https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html#ga384940fdf04c03e362e94b6eb9b673c9|estimateNewCameraMatrixForUndistortRectify} */
  private computeNewCameraMatrix(inputWidth: number, inputHeight: number): InternalCameraMatrix {
    const w = inputWidth;
    const h = inputHeight;
    const K = this.config.K;
    const fx = K?.fx ?? inputWidth;
    const fy = K?.fy ?? inputWidth;
    const cx = K?.cx ?? inputWidth / 2;
    const cy = K?.cy ?? inputHeight / 2;
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

    const rx = this.config.size.width / w;
    const ry = this.config.size.height / h;

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

    this.pipeline = this.root["~unstable"].createGuardedComputePipeline(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: GPU callback; projection branches must stay inline.
      (x: number, y: number) => {
        "use gpu";

        const p = fisheyeLayout.$.uniforms;
        const outputW = p.outputWidth;
        const outputH = p.outputHeight;
        const inputW = p.inputWidth;
        const inputH = p.inputHeight;
        const coord = d.vec2i(x, y);
        const coordXf = d.f32(coord.x);
        const coordYf = d.f32(coord.y);

        if (coordXf >= outputW || coordYf >= outputH) return;

        // projection: 0=rectilinear, 1=equirectangular, 2=original, 3=cylindrical
        const isOriginal = p.projection > 1.5 && p.projection < 2.5;
        let u = d.f32(0.0);
        let v = d.f32(0.0);
        let inBounds = false;

        if (isOriginal) {
          u = (coordXf / outputW) * inputW;
          v = (coordYf / outputH) * inputH;
          inBounds = true;
        } else {
          let normX = (coordXf - p.newCx) / p.newFx;
          let normY = (coordYf - p.newCy) / p.newFy;
          let validProjection = true;

          const isEquirect = p.projection > 0.5 && p.projection < 1.5;
          if (isEquirect) {
            const lon = (coordXf / outputW - 0.5) * Math.PI * 2.0;
            const lat = (coordYf / outputH - 0.5) * Math.PI;
            const cosLat = std.cos(lat);
            const dirZ = std.cos(lon) * cosLat;
            validProjection = dirZ > 0.001;
            if (validProjection) {
              normX = (std.sin(lon) * cosLat) / dirZ;
              normY = std.sin(lat) / dirZ;
            } else {
              normX = 0.0;
              normY = 0.0;
            }
          }

          const isCylindrical = p.projection > 2.5;
          if (isCylindrical) {
            // Cylindrical projection: lon linear, lat via atan (unrolled cylinder)
            // f_cyl = outputW / (2 * pi)
            const fCyl = outputW / (Math.PI * 2.0);
            const lon = (coordXf / outputW - 0.5) * Math.PI * 2.0; // -pi to pi
            const lat = std.atan((coordYf - outputH * 0.5) / fCyl); // latitude

            // 3D direction vector
            const cosLat = std.cos(lat);
            const dirX = std.sin(lon) * cosLat;
            const dirY = std.sin(lat);
            const dirZ = std.cos(lon) * cosLat;

            validProjection = dirZ > 0.001;
            if (validProjection) {
              normX = dirX / dirZ;
              normY = dirY / dirZ;
            } else {
              normX = 0.0;
              normY = 0.0;
            }
          }

          const r = std.sqrt(normX * normX + normY * normY);
          const theta = std.atan(r);
          const theta2 = theta * theta;
          const theta4 = theta2 * theta2;
          const theta6 = theta4 * theta2;
          const theta8 = theta4 * theta4;
          const thetaD =
            theta * (1.0 + p.k1 * theta2 + p.k2 * theta4 + p.k3 * theta6 + p.k4 * theta8);
          const safeR = std.max(r, 1e-8);
          const scale = thetaD / safeR;
          const distortedX = normX * scale;
          const distortedY = normY * scale;
          u = p.fx * (distortedX + p.alpha * distortedY) + p.cx;
          v = p.fy * distortedY + p.cy;
          inBounds =
            validProjection && u >= 0.0 && u <= inputW - 1.0 && v >= 0.0 && v <= inputH - 1.0;
        }

        if (!inBounds) {
          std.textureStore(fisheyeLayout.$.outputTexture, coord, d.vec4f(0.0, 0.0, 0.0, 1.0));
          return;
        }

        const x0 = std.floor(u);
        const y0 = std.floor(v);
        const fx = u - x0;
        const fy = v - y0;
        const maxX = inputW - 1.0;
        const maxY = inputH - 1.0;
        const ix0 = d.i32(std.clamp(x0, 0.0, maxX));
        const iy0 = d.i32(std.clamp(y0, 0.0, maxY));
        const ix1 = d.i32(std.clamp(x0 + 1.0, 0.0, maxX));
        const iy1 = d.i32(std.clamp(y0 + 1.0, 0.0, maxY));
        const c00 = std.textureLoad(fisheyeLayout.$.inputTexture, d.vec2i(ix0, iy0), 0);
        const c10 = std.textureLoad(fisheyeLayout.$.inputTexture, d.vec2i(ix1, iy0), 0);
        const c01 = std.textureLoad(fisheyeLayout.$.inputTexture, d.vec2i(ix0, iy1), 0);
        const c11 = std.textureLoad(fisheyeLayout.$.inputTexture, d.vec2i(ix1, iy1), 0);
        const c0 = std.mix(c00, c10, fx);
        const c1 = std.mix(c01, c11, fx);
        const color = std.mix(c0, c1, fy);
        std.textureStore(fisheyeLayout.$.outputTexture, coord, color);
      },
    );
  }

  private getUniformData(): d.Infer<typeof FisheyeUniforms> {
    const { K, D, size, projection } = this.config;
    const inputWidth = this.uniformInputWidth || size.width;
    const inputHeight = this.uniformInputHeight || size.height;

    const fx = K?.fx ?? inputWidth;
    const fy = K?.fy ?? inputWidth;
    const cx = K?.cx ?? inputWidth / 2;
    const cy = K?.cy ?? inputHeight / 2;
    const alpha = K?.alpha ?? 0;

    let newCam: InternalCameraMatrix;

    // RectilinearManual: use provided newFx/newFy/newCx/newCy
    if (isRectilinearManual(projection)) {
      newCam = {
        newFx: projection.newFx * (size.width / inputWidth),
        newFy: projection.newFy * (size.height / inputHeight),
        newCx: projection.newCx ?? size.width / 2,
        newCy: projection.newCy ?? size.height / 2,
      };
    } else {
      // Auto: compute via estimateNewCameraMatrixForUndistortRectify
      if (
        !this.cachedNewCameraMatrix ||
        this.uniformInputWidth !== inputWidth ||
        this.uniformInputHeight !== inputHeight
      ) {
        this.cachedNewCameraMatrix = this.computeNewCameraMatrix(inputWidth, inputHeight);
      }
      newCam = this.cachedNewCameraMatrix;
    }

    // Projection kind → numeric value for shader
    // 0 = rectilinear, 1 = equirectangular, 2 = original, 3 = cylindrical
    let projectionValue = 0;
    switch (projection.kind) {
      case "rectilinear":
        projectionValue = 0;
        break;
      case "equirectangular":
        projectionValue = 1;
        break;
      case "original":
        projectionValue = 2;
        break;
      case "cylindrical":
        projectionValue = 3;
        break;
    }

    return {
      fx,
      fy,
      cx,
      cy,
      alpha,
      k1: D.k1,
      k2: D.k2,
      k3: D.k3,
      k4: D.k4,
      newFx: newCam.newFx,
      newFy: newCam.newFy,
      newCx: newCam.newCx,
      newCy: newCam.newCy,
      outputWidth: size.width,
      outputHeight: size.height,
      inputWidth,
      inputHeight,
      projection: projectionValue,
      _pad1: 0,
      _pad2: 0,
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
      [this.config.size.width, this.config.size.height],
    );
    device.queue.submit([commandEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();

    this.readbackHasData[writeIndex] = true;
    this.readbackIndex = readIndex;

    const bufferToRead = this.readbackHasData[readIndex] ? readBuffer : writeBuffer;

    await bufferToRead.mapAsync(GPUMapMode.READ);
    const mappedData = bufferToRead.getMappedRange();

    const pixelData =
      this.pixelBuffer ?? new Uint8Array(this.config.size.width * this.config.size.height * 4);
    const srcView = new Uint8Array(mappedData);

    for (let row = 0; row < this.config.size.height; row++) {
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
      codedWidth: this.config.size.width,
      codedHeight: this.config.size.height,
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
      this.outputTextureSize[0] !== this.config.size.width ||
      this.outputTextureSize[1] !== this.config.size.height
    ) {
      this.outputTexture?.destroy();
      this.readbackBuffers?.[0]?.destroy();
      this.readbackBuffers?.[1]?.destroy();

      this.outputTexture = this.createOutputTexture(
        root,
        this.config.size.width,
        this.config.size.height,
      );
      this.readbackBytesPerRow = this.calculateBytesPerRow(this.config.size.width);
      this.readbackActualBytesPerRow = this.config.size.width * 4;
      this.pixelBuffer = new Uint8Array(this.config.size.width * this.config.size.height * 4);
      this.readbackBuffers = [
        this.createReadbackBuffer(device, this.config.size.width, this.config.size.height),
        this.createReadbackBuffer(device, this.config.size.width, this.config.size.height),
      ];
      this.readbackIndex = 0;
      this.readbackHasData = [false, false];
      this.outputTextureSize = [this.config.size.width, this.config.size.height];
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

    this.pipeline.with(bindGroup).dispatchThreads(this.config.size.width, this.config.size.height);

    const outputGpuTexture = root.unwrap(outputTexture);
    return this.readbackToVideoFrame(device, outputGpuTexture, frame.timestamp);
  }

  /** Update configuration. */
  updateConfig(options: Partial<FisheyeOptions>): void {
    const prevWidth = this.config.size.width;
    const prevHeight = this.config.size.height;
    this.config = this.applyDefaults({ ...this.config, ...options });
    this.cachedNewCameraMatrix = null;
    this.updateUniforms();

    if (this.config.size.width !== prevWidth || this.config.size.height !== prevHeight) {
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
