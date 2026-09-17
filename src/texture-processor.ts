import tgpu, { type TgpuBuffer, type TgpuTexture } from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import { type NormalizedConfig, normalizeOptions, updateOptions } from "./config";
import type { FisheyeOptions, PTZOptions } from "./types";
import { getPanePresetKey, isRectilinearManual, PANE_PRESETS } from "./types";

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
  // PTZ parameters
  panRad: d.f32, // Pan rotation in radians
  tiltRad: d.f32, // Tilt rotation in radians
  zoomFactor: d.f32, // Zoom factor (1.0 = no zoom)
  lensKind: d.u32,
  offsetX: d.f32,
  offsetY: d.f32,
  xFactor: d.f32,
  maxAngle: d.f32,
  maxRadius: d.f32,
  segmentCount: d.u32,
});

type TgpuRootType = Awaited<ReturnType<typeof tgpu.init>>;

const Segment = d.struct({ start: d.f32, end: d.f32, a: d.f32, b: d.f32, c: d.f32, d: d.f32 });
const fisheyeLayout = tgpu.bindGroupLayout({
  inputTexture: { texture: d.texture2d() },
  outputTexture: { storageTexture: d.textureStorage2d("rgba8unorm") },
  uniforms: { uniform: FisheyeUniforms },
  segments: { storage: d.arrayOf(Segment), access: "readonly" },
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

/** Shared internal texture engine. The caller owns the injected device.
 * Outputs are borrowed until the next process/update/destroy call. */
export class TextureProcessor {
  private config: NormalizedConfig;
  private root: TgpuRootType;
  private uniformBuffer: UniformBufferType;
  private segments: ReturnType<TextureProcessor["createSegments"]>;
  private pipeline: ReturnType<TgpuRootType["createGuardedComputePipeline"]>;
  private inputTexture: InputTextureType | null = null;
  private outputs: OutputTextureType[] = [];
  private bindings: ReturnType<TgpuRootType["createBindGroup"]>[] = [];
  private inputWidth = 0;
  private inputHeight = 0;
  private uniformInputWidth = 0;
  private uniformInputHeight = 0;
  private cachedNewCameraMatrix: InternalCameraMatrix | null = null;
  private destroyed = false;

  constructor(
    private device: GPUDevice,
    options: FisheyeOptions = {},
  ) {
    this.config = normalizeOptions(options);
    this.root = tgpu.initFromDevice({ device });
    this.uniformBuffer = this.root
      .createBuffer(FisheyeUniforms, this.getUniformData())
      .$usage("uniform");
    this.segments = this.createSegments();
    this.pipeline = this.root.createGuardedComputePipeline(
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
          // Apply zoom to effective focal length
          const zoomedNewFx = p.newFx * p.zoomFactor;
          const zoomedNewFy = p.newFy * p.zoomFactor;

          let normX = (coordXf - p.newCx) / zoomedNewFx;
          let normY = (coordYf - p.newCy) / zoomedNewFy;
          let validProjection = true;

          let dirX = normX;
          let dirY = normY;
          let dirZ = d.f32(1);

          const isEquirect = p.projection > 0.5 && p.projection < 1.5;
          if (isEquirect) {
            const lon = ((coordXf / outputW - 0.5) * Math.PI * 2.0) / p.zoomFactor;
            const lat = ((coordYf / outputH - 0.5) * Math.PI) / p.zoomFactor;
            const cosLat = std.cos(lat);
            dirX = std.sin(lon) * cosLat;
            dirY = std.sin(lat);
            dirZ = std.cos(lon) * cosLat;
            validProjection = p.lensKind === 1 || dirZ > 0.001;
          }

          const isCylindrical = p.projection > 2.5;
          if (isCylindrical) {
            // Cylindrical projection: lon linear, lat via atan (unrolled cylinder)
            // f_cyl = outputW / (2 * pi)
            const fCyl = outputW / (Math.PI * 2.0);
            const lon = ((coordXf / outputW - 0.5) * Math.PI * 2.0) / p.zoomFactor;
            const lat = std.atan((coordYf - outputH * 0.5) / (fCyl * p.zoomFactor));

            // 3D direction vector
            const cosLat = std.cos(lat);
            dirX = std.sin(lon) * cosLat;
            dirY = std.sin(lat);
            dirZ = std.cos(lon) * cosLat;
            validProjection = p.lensKind === 1 || dirZ > 0.001;
          }

          // Apply PTZ rotation (pan/tilt) to normalized coordinates
          // Normalize the direction vector
          const dirLen = std.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
          dirX = dirX / dirLen;
          dirY = dirY / dirLen;
          dirZ = dirZ / dirLen;

          // Apply tilt (rotation around X-axis)
          const cosTilt = std.cos(p.tiltRad);
          const sinTilt = std.sin(p.tiltRad);
          const tiltedY = dirY * cosTilt - dirZ * sinTilt;
          const tiltedZ = dirY * sinTilt + dirZ * cosTilt;
          dirY = tiltedY;
          dirZ = tiltedZ;

          // Apply pan (rotation around Y-axis)
          const cosPan = std.cos(p.panRad);
          const sinPan = std.sin(p.panRad);
          const pannedX = dirX * cosPan + dirZ * sinPan;
          const pannedZ = -dirX * sinPan + dirZ * cosPan;
          dirX = pannedX;
          dirZ = pannedZ;

          if (p.lensKind === 1) {
            const radialLength = std.sqrt(dirX * dirX + dirY * dirY);
            const angle = std.atan2(radialLength, dirZ);
            validProjection = validProjection && angle <= p.maxAngle;
            let radius = d.f32(0);
            for (let segmentIndex = d.u32(0); segmentIndex < p.segmentCount; segmentIndex += 1) {
              const segment = fisheyeLayout.$.segments[segmentIndex];
              if (angle >= segment.start && angle <= segment.end) {
                const t = angle - segment.start;
                radius = segment.a + t * (segment.b + t * (segment.c + t * segment.d));
              }
            }
            validProjection = validProjection && radius <= p.maxRadius;
            const safeRadialLength = std.max(radialLength, 1e-8);
            const radialX = (dirX * radius) / safeRadialLength;
            const radialY = (-dirY * radius) / safeRadialLength;
            const sensorX = radialX * p.xFactor - p.offsetX;
            const sensorY = radialY - p.offsetY;
            // Annex B defines sensor coordinates on [-1, 1]. Map the two
            // endpoints to the centers of the first and last texels.
            u = (sensorX + 1) * (inputW - 1) * 0.5;
            v = (1 - sensorY) * (inputH - 1) * 0.5;
          } else {
            validProjection = validProjection && dirZ > 0.001;
            if (validProjection) {
              normX = dirX / dirZ;
              normY = dirY / dirZ;
            }
            const r = std.sqrt(normX * normX + normY * normY);
            const theta = std.atan(r);
            const theta2 = theta * theta;
            const theta4 = theta2 * theta2;
            const theta6 = theta4 * theta2;
            const theta8 = theta4 * theta4;
            const thetaD =
              theta * (1 + p.k1 * theta2 + p.k2 * theta4 + p.k3 * theta6 + p.k4 * theta8);
            const safeR = std.max(r, 1e-8);
            const scale = thetaD / safeR;
            const distortedX = normX * scale;
            const distortedY = normY * scale;
            u = p.fx * (distortedX + p.alpha * distortedY) + p.cx;
            v = p.fy * distortedY + p.cy;
          }
          inBounds =
            validProjection && u >= 0.0 && u <= inputW - 1.0 && v >= 0.0 && v <= inputH - 1.0;
        }

        if (!inBounds) {
          std.textureStore(fisheyeLayout.$.outputTexture, coord, d.vec4f(0, 0, 0, 1));
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

  private createSegments() {
    const values = this.config.onvif?.segments ?? [{ start: 0, end: 1, a: 0, b: 0, c: 0, d: 0 }];
    return this.root.createBuffer(d.arrayOf(Segment, values.length), [...values]).$usage("storage");
  }

  getInputTexture(width: number, height: number): GPUTexture {
    this.assertAlive();
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
      throw new Error("Invalid input dimensions");
    if (!this.inputTexture || width !== this.inputWidth || height !== this.inputHeight) {
      this.inputTexture?.destroy();
      this.inputTexture = this.root
        .createTexture({ size: [width, height], format: "rgba8unorm" })
        .$usage("sampled", "render");
      this.inputWidth = width;
      this.inputHeight = height;
      this.bindings = [];
      this.cachedNewCameraMatrix = null;
    }
    return this.root.unwrap(this.inputTexture);
  }

  process(width: number, height: number): GPUTexture[] {
    this.assertAlive();
    this.getInputTexture(width, height);
    this.uniformInputWidth = width;
    this.uniformInputHeight = height;
    const presets: readonly (PTZOptions | undefined)[] = this.config.pane
      ? PANE_PRESETS[getPanePresetKey(this.config.pane)]
      : [undefined];
    const { width: w, height: h } = this.config.size;
    for (let i = 0; i < presets.length; i++) {
      let output = this.outputs[i];
      if (!output) {
        output = this.root.createTexture({ size: [w, h], format: "rgba8unorm" }).$usage("storage");
        this.outputs[i] = output;
      }
      const input = this.inputTexture;
      if (!input) throw new Error("Input texture unavailable");
      let binding = this.bindings[i];
      if (!binding) {
        binding = this.root.createBindGroup(fisheyeLayout, {
          inputTexture: input,
          outputTexture: output,
          uniforms: this.uniformBuffer,
          segments: this.segments,
        });
        this.bindings[i] = binding;
      }
      this.uniformBuffer.write(this.getUniformData(presets[i]));
      this.pipeline.with(binding).dispatchThreads(w, h);
    }
    return this.outputs.map((output) => this.root.unwrap(output));
  }

  async readPixels(texture: GPUTexture): Promise<Uint8Array<ArrayBuffer>> {
    this.assertAlive();
    const row = Math.ceil((texture.width * 4) / 256) * 256;
    const size = row * texture.height;
    const buffer = this.device.createBuffer({
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: row }, [
      texture.width,
      texture.height,
    ]);
    this.device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    try {
      const mapped = new Uint8Array(buffer.getMappedRange());
      const pixels = new Uint8Array(texture.width * texture.height * 4);
      for (let y = 0; y < texture.height; y++)
        pixels.set(mapped.subarray(y * row, y * row + texture.width * 4), y * texture.width * 4);
      return pixels;
    } finally {
      buffer.unmap();
      buffer.destroy();
    }
  }

  updateConfig(options: Partial<FisheyeOptions>): void {
    this.assertAlive();
    const next = updateOptions(this.config, options);
    this.config = next;
    this.cachedNewCameraMatrix = null;
    this.segments.destroy();
    this.segments = this.createSegments();
    for (const output of this.outputs) output.destroy();
    this.outputs = [];
    this.bindings = [];
  }
  private assertAlive() {
    if (this.destroyed) throw new Error("TextureProcessor has been destroyed");
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.destroy();
    this.outputs = [];
    this.bindings = [];
    this.inputTexture = null;
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

  /** Resolve new camera matrix for uniforms (manual vs auto). */
  private getNewCameraMatrixForUniform(
    inputWidth: number,
    inputHeight: number,
  ): InternalCameraMatrix {
    const { projection, size } = this.config;
    if (isRectilinearManual(projection)) {
      return {
        newFx: projection.newFx * (size.width / inputWidth),
        newFy: projection.newFy * (size.height / inputHeight),
        newCx: projection.newCx ?? size.width / 2,
        newCy: projection.newCy ?? size.height / 2,
      };
    }
    if (this.config.onvif) {
      const focal = size.width / (2 * Math.tan((this.config.horizontalFov * Math.PI) / 360));
      return { newFx: focal, newFy: focal, newCx: size.width / 2, newCy: size.height / 2 };
    }
    if (
      !this.cachedNewCameraMatrix ||
      this.uniformInputWidth !== inputWidth ||
      this.uniformInputHeight !== inputHeight
    ) {
      this.cachedNewCameraMatrix = this.computeNewCameraMatrix(inputWidth, inputHeight);
    }
    return this.cachedNewCameraMatrix;
  }

  /** Projection kind → shader numeric: 0=rectilinear, 1=equirectangular, 2=original, 3=cylindrical. */
  private getProjectionNumericValue(
    kind: "rectilinear" | "equirectangular" | "original" | "cylindrical",
  ): number {
    const map: Record<typeof kind, number> = {
      rectilinear: 0,
      equirectangular: 1,
      original: 2,
      cylindrical: 3,
    };
    return map[kind];
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Flattening optional calibration data into a GPU struct is intentionally explicit.
  private getUniformData(ptzOverride?: PTZOptions): d.InferInput<typeof FisheyeUniforms> {
    const { K, D, size, projection, ptz } = this.config;
    const inputWidth = this.uniformInputWidth || size.width;
    const inputHeight = this.uniformInputHeight || size.height;

    const fx = K?.fx ?? inputWidth;
    const fy = K?.fy ?? inputWidth;
    const cx = K?.cx ?? inputWidth / 2;
    const cy = K?.cy ?? inputHeight / 2;
    const alpha = K?.alpha ?? 0;

    const newCam = this.getNewCameraMatrixForUniform(inputWidth, inputHeight);
    const projectionValue = this.getProjectionNumericValue(projection.kind);

    const activePtz = ptzOverride ?? ptz;
    const panDeg = activePtz?.pan ?? 0;
    const tiltDeg = activePtz?.tilt ?? 0;
    const zoomFactor = activePtz?.zoom ?? 1.0;
    const panRad = (panDeg * Math.PI) / 180;
    const tiltRad = (tiltDeg * Math.PI) / 180;

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
      panRad,
      tiltRad,
      zoomFactor,
      lensKind: this.config.onvif ? 1 : 0,
      offsetX: this.config.onvif?.offsetX ?? 0,
      offsetY: this.config.onvif?.offsetY ?? 0,
      xFactor: this.config.onvif?.xFactor ?? 1,
      maxAngle: this.config.onvif?.maxAngle ?? 0,
      maxRadius: this.config.onvif?.maxRadius ?? 0,
      segmentCount: this.config.onvif?.segments.length ?? 0,
    };
  }
}
