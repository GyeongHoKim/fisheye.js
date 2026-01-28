import type { FisheyeConfig, FisheyeOptions } from "./types";

/**
 * Fisheye dewarper using WebGPU
 *
 * @example
 * ```ts
 * const dewarper = new Fisheye({
 *   distortion: 0.5,
 *   width: 1920,
 *   height: 1080,
 * });
 *
 * const dewarpedFrame = dewarper.dewarp(videoFrame);
 * ```
 */
export class Fisheye {
  private config: FisheyeConfig;
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private inputTexture: GPUTexture | null = null;
  private outputTexture: GPUTexture | null = null;
  private uniformBuffer: GPUBuffer | null = null;

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
   * Initialize WebGPU device and resources
   */
  private async initialize(): Promise<void> {
    if (this.device) {
      return;
    }

    if (!navigator.gpu) {
      throw new Error("WebGPU is not supported in this browser");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("Failed to get GPU adapter");
    }

    this.device = await adapter.requestDevice();

    // Create uniform buffer for distortion parameters
    this.uniformBuffer = this.device.createBuffer({
      size: 32, // 8 floats * 4 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.updateUniforms();
  }

  /**
   * Update uniform buffer with current configuration
   */
  private updateUniforms(): void {
    if (!this.device || !this.uniformBuffer) {
      return;
    }

    const uniforms = new Float32Array([
      this.config.distortion,
      this.config.fov,
      this.config.centerX,
      this.config.centerY,
      this.config.zoom,
      this.config.width,
      this.config.height,
      0, // padding
    ]);

    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);
  }

  /**
   * Create compute pipeline for dewarping
   */
  private async createPipeline(): Promise<void> {
    if (!this.device || this.pipeline) {
      return;
    }

    // WebGPU shader code for fisheye dewarping
    const shaderCode = `
      struct Uniforms {
        distortion: f32,
        fov: f32,
        centerX: f32,
        centerY: f32,
        zoom: f32,
        width: f32,
        height: f32,
        padding: f32,
      }

      @group(0) @binding(0) var inputTexture: texture_2d<f32>;
      @group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
      @group(0) @binding(2) var<uniform> uniforms: Uniforms;

      @compute @workgroup_size(8, 8)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let dims = textureDimensions(inputTexture);
        let coord = vec2<i32>(global_id.xy);

        if (coord.x >= i32(dims.x) || coord.y >= i32(dims.y)) {
          return;
        }

        // Normalize coordinates to [-1, 1]
        let uv = vec2<f32>(
          (f32(coord.x) / f32(dims.x) - 0.5) * 2.0,
          (f32(coord.y) / f32(dims.y) - 0.5) * 2.0
        );

        // Apply center offset
        let centered = uv - vec2<f32>(uniforms.centerX, uniforms.centerY);

        // Calculate radius from center
        let r = length(centered);

        // Apply fisheye distortion correction
        // Using simple radial distortion model: r' = r * (1 + k1 * r^2)
        let r_distorted = r * (1.0 + uniforms.distortion * r * r);

        // Apply zoom
        let r_scaled = r_distorted / uniforms.zoom;

        // Convert back to texture coordinates
        var distorted_uv: vec2<f32>;
        if (r > 0.0001) {
          distorted_uv = centered * (r_scaled / r);
        } else {
          distorted_uv = centered;
        }

        // Add center offset back and denormalize
        let final_uv = (distorted_uv + vec2<f32>(uniforms.centerX, uniforms.centerY)) * 0.5 + 0.5;

        // Sample from input texture
        if (final_uv.x >= 0.0 && final_uv.x <= 1.0 && final_uv.y >= 0.0 && final_uv.y <= 1.0) {
          let sample_coord = vec2<i32>(
            i32(final_uv.x * f32(dims.x)),
            i32(final_uv.y * f32(dims.y))
          );
          let color = textureLoad(inputTexture, sample_coord, 0);
          textureStore(outputTexture, coord, color);
        } else {
          // Black for out of bounds
          textureStore(outputTexture, coord, vec4<f32>(0.0, 0.0, 0.0, 1.0));
        }
      }
    `;

    const shaderModule = this.device.createShaderModule({
      code: shaderCode,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            sampleType: "float",
            viewDimension: "2d",
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: "write-only",
            format: "rgba8unorm",
            viewDimension: "2d",
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: "uniform",
          },
        },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    this.pipeline = this.device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "main",
      },
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
    await this.createPipeline();

    if (!this.device || !this.pipeline || !this.uniformBuffer) {
      throw new Error("GPU resources not initialized");
    }

    // Create or update input texture
    if (!this.inputTexture) {
      this.inputTexture = this.device.createTexture({
        size: [frame.displayWidth, frame.displayHeight],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
    }

    // Create or update output texture
    if (!this.outputTexture) {
      this.outputTexture = this.device.createTexture({
        size: [this.config.width, this.config.height],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }

    // Copy VideoFrame to input texture
    // Note: This is a simplified approach. In production, you'd want to handle
    // different pixel formats and use more efficient copying mechanisms
    this.device.queue.copyExternalImageToTexture(
      { source: frame },
      { texture: this.inputTexture },
      [frame.displayWidth, frame.displayHeight],
    );

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: this.inputTexture.createView(),
        },
        {
          binding: 1,
          resource: this.outputTexture.createView(),
        },
        {
          binding: 2,
          resource: {
            buffer: this.uniformBuffer,
          },
        },
      ],
    });

    // Execute compute shader
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(this.config.width / 8),
      Math.ceil(this.config.height / 8),
    );
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);

    // Create output VideoFrame from texture
    // Note: This requires canvas or other intermediary for actual frame creation
    // For now, returning a placeholder - in production you'd need proper VideoFrame creation
    const canvas = new OffscreenCanvas(this.config.width, this.config.height);
    const ctx = canvas.getContext("webgpu");

    if (!ctx) {
      throw new Error("Failed to get WebGPU canvas context");
    }

    ctx.configure({
      device: this.device,
      format: "rgba8unorm",
    });

    // Copy output texture to canvas
    const renderCommandEncoder = this.device.createCommandEncoder();

    // Simple copy pass (in production, you'd use a proper render pipeline)
    renderCommandEncoder.copyTextureToTexture(
      { texture: this.outputTexture },
      { texture: ctx.getCurrentTexture() },
      [this.config.width, this.config.height],
    );

    this.device.queue.submit([renderCommandEncoder.finish()]);

    // Create VideoFrame from canvas
    return new VideoFrame(canvas, {
      timestamp: frame.timestamp,
    });
  }

  /**
   * Update configuration
   */
  updateConfig(options: Partial<FisheyeOptions>): void {
    this.config = this.applyDefaults({ ...this.config, ...options });
    this.updateUniforms();

    // Recreate output texture if size changed
    if (options.width || options.height) {
      this.outputTexture?.destroy();
      this.outputTexture = null;
    }
  }

  /**
   * Clean up GPU resources
   */
  destroy(): void {
    this.inputTexture?.destroy();
    this.outputTexture?.destroy();
    this.uniformBuffer?.destroy();
    this.device?.destroy();

    this.inputTexture = null;
    this.outputTexture = null;
    this.uniformBuffer = null;
    this.pipeline = null;
    this.device = null;
  }
}
