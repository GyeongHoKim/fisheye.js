/**
 * WebGPU Renderer for VideoFrame display
 * Based on W3C WebCodecs sample: https://github.com/w3c/webcodecs/blob/main/samples/video-decode-display/renderer_webgpu.js
 */
export class WebGPURenderer {
  private canvas: HTMLCanvasElement;
  private ctx: GPUCanvasContext | null = null;
  private started: Promise<void>;
  private format: GPUTextureFormat | null = null;
  private device: GPUDevice | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private sampler: GPUSampler | null = null;
  private currentWidth = 0;
  private currentHeight = 0;

  // Vertex shader: generates two triangles covering the whole canvas
  private static vertexShaderSource = `
    struct VertexOutput {
      @builtin(position) Position: vec4<f32>,
      @location(0) uv: vec2<f32>,
    }

    @vertex
    fn vert_main(@builtin(vertex_index) VertexIndex: u32) -> VertexOutput {
      var pos = array<vec2<f32>, 6>(
        vec2<f32>( 1.0,  1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0,  1.0),
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(-1.0,  1.0)
      );

      var uv = array<vec2<f32>, 6>(
        vec2<f32>(1.0, 0.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 0.0)
      );

      var output : VertexOutput;
      output.Position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
      output.uv = uv[VertexIndex];
      return output;
    }
  `;

  // Fragment shader: samples the external texture using generated UVs
  private static fragmentShaderSource = `
    @group(0) @binding(1) var mySampler: sampler;
    @group(0) @binding(2) var myTexture: texture_external;
    
    @fragment
    fn frag_main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
      return textureSampleBaseClampToEdge(myTexture, mySampler, uv);
    }
  `;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.started = this.start();
  }

  private async start(): Promise<void> {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("WebGPU adapter not found");
    }

    this.device = await adapter.requestDevice();
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.ctx = this.canvas.getContext("webgpu") as GPUCanvasContext;
    this.ctx.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque",
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: this.device.createShaderModule({
          code: WebGPURenderer.vertexShaderSource,
        }),
        entryPoint: "vert_main",
      },
      fragment: {
        module: this.device.createShaderModule({
          code: WebGPURenderer.fragmentShaderSource,
        }),
        entryPoint: "frag_main",
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    // Default sampler configuration is nearest + clamp
    this.sampler = this.device.createSampler({});
  }

  async draw(frame: VideoFrame): Promise<void> {
    // Wait for WebGPU initialization
    await this.started;

    if (!this.device || !this.pipeline || !this.sampler || !this.ctx) {
      throw new Error("WebGPU not initialized");
    }

    // Resize canvas and reconfigure context if dimensions changed
    if (this.currentWidth !== frame.displayWidth || this.currentHeight !== frame.displayHeight) {
      this.canvas.width = frame.displayWidth;
      this.canvas.height = frame.displayHeight;
      this.currentWidth = frame.displayWidth;
      this.currentHeight = frame.displayHeight;

      // Reconfigure context for new size
      const format = this.format;
      if (!format) throw new Error("WebGPU not initialized");
      this.ctx.configure({
        device: this.device,
        format,
        alphaMode: "opaque",
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }

    const uniformBindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 1, resource: this.sampler },
        {
          binding: 2,
          resource: this.device.importExternalTexture({ source: frame }),
        },
      ],
    });

    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.ctx.getCurrentTexture().createView();
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: [0.0, 0.0, 0.0, 1.0],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    };

    try {
      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setPipeline(this.pipeline);
      passEncoder.setBindGroup(0, uniformBindGroup);
      passEncoder.draw(6, 1, 0, 0);
      passEncoder.end();
      this.device.queue.submit([commandEncoder.finish()]);
    } finally {
      frame.close();
    }
  }

  destroy(): void {
    this.device?.destroy();
    this.device = null;
    this.ctx = null;
    this.pipeline = null;
    this.sampler = null;
  }
}
