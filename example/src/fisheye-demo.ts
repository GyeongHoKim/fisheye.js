import type { FisheyeMount, FisheyeProjection } from "@gyeonghokim/fisheye.js";
import { Fisheye } from "@gyeonghokim/fisheye.js";
import { html, LitElement } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { fisheyeDemoStyles } from "./fisheye-demo.styles";
import { WebGPURenderer } from "./renderer";
import "./demo-sidebar";
import "./page-header";

const FISHEYE_DEFAULTS = {
  k1: -0.0014613319981768,
  k2: -0.00329861110580401,
  k3: 0.00605760088590183,
  k4: -0.00374209380722371,
  centerX: -0.0306,
  centerY: -0.0452,
  fov: 180,
  zoom: 0.66,
  projection: "rectilinear" as FisheyeProjection,
  mount: "ceiling" as FisheyeMount,
};

/** Presets map user-facing names to mount + projection + fov (see src/types.ts). */
const VIEW_PRESETS = [
  {
    id: "normal",
    label: "Normal (90°)",
    projection: "rectilinear" as FisheyeProjection,
    mount: "ceiling" as FisheyeMount,
    fov: 90,
  },
  {
    id: "panoramic180",
    label: "Panoramic 180°",
    projection: "equirectangular" as FisheyeProjection,
    mount: "ceiling" as FisheyeMount,
    fov: 180,
  },
  {
    id: "panoramic360",
    label: "360° Panorama",
    projection: "equirectangular" as FisheyeProjection,
    mount: "ceiling" as FisheyeMount,
    fov: 360,
  },
] as const;
type PresetId = (typeof VIEW_PRESETS)[number]["id"];

@customElement("fisheye-demo")
export class FisheyeDemo extends LitElement {
  @state() private k1 = FISHEYE_DEFAULTS.k1;
  @state() private k2 = FISHEYE_DEFAULTS.k2;
  @state() private k3 = FISHEYE_DEFAULTS.k3;
  @state() private k4 = FISHEYE_DEFAULTS.k4;
  @state() private fov = FISHEYE_DEFAULTS.fov;
  @state() private centerX = FISHEYE_DEFAULTS.centerX;
  @state() private centerY = FISHEYE_DEFAULTS.centerY;
  @state() private zoom = FISHEYE_DEFAULTS.zoom;
  @state() private presetId: PresetId | null = null;
  @state() private projection: FisheyeProjection = FISHEYE_DEFAULTS.projection;
  @state() private mount: FisheyeMount = FISHEYE_DEFAULTS.mount;
  @state() private isProcessing = false;
  @state() private errorMessage = "";
  @state() private hasWebGPU = true;
  @state() private sidebarOpen = true;

  @query("#output-canvas") private outputCanvas!: HTMLCanvasElement;
  @query("#input-canvas") private inputCanvas!: HTMLCanvasElement;

  private fisheye: Fisheye | null = null;
  private renderer: WebGPURenderer | null = null;
  private currentImageBitmap: ImageBitmap | null = null;

  static styles = fisheyeDemoStyles;

  connectedCallback() {
    super.connectedCallback();
    this.checkWebGPU();
    this.loadDefaultImage();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.fisheye?.destroy();
    this.renderer?.destroy();
    this.currentImageBitmap?.close();
  }

  private async checkWebGPU() {
    if (!navigator.gpu) {
      this.hasWebGPU = false;
      this.errorMessage =
        "WebGPU is not supported in this browser. Please use Chrome 113+ or Edge 113+.";
    }
  }

  private async loadDefaultImage() {
    try {
      const imgResponse = await fetch(`${import.meta.env.BASE_URL}test.jpg?t=${Date.now()}`);
      const blob = await imgResponse.blob();
      await this.loadImage(blob);
    } catch (e) {
      console.warn("Failed to load default image:", e);
    }
  }

  private async loadImage(blob: Blob) {
    try {
      this.currentImageBitmap?.close();
      this.currentImageBitmap = await createImageBitmap(blob);

      // Draw input image to input canvas
      await this.updateComplete;
      const ctx = this.inputCanvas.getContext("2d");
      if (ctx) {
        this.inputCanvas.width = this.currentImageBitmap.width;
        this.inputCanvas.height = this.currentImageBitmap.height;
        ctx.drawImage(this.currentImageBitmap, 0, 0);
      }

      // Process the image
      await this.processImage();
    } catch (e) {
      this.errorMessage = `Failed to load image: ${e}`;
    }
  }

  private async handleFileUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await this.loadImage(file);
    }
  }

  private async processImage() {
    if (!this.currentImageBitmap || !this.hasWebGPU) return;

    this.isProcessing = true;
    this.errorMessage = "";

    try {
      await this.updateComplete;

      const fisheyeOptions = {
        k1: this.k1,
        k2: this.k2,
        k3: this.k3,
        k4: this.k4,
        fov: this.fov,
        projection: this.projection,
        mount: this.mount,
        centerX: this.centerX,
        centerY: this.centerY,
        zoom: this.zoom,
        width: this.currentImageBitmap.width,
        height: this.currentImageBitmap.height,
      };

      // Initialize fisheye if needed
      if (!this.fisheye) {
        this.fisheye = new Fisheye(fisheyeOptions);
      } else {
        this.fisheye.updateConfig(fisheyeOptions);
      }

      // Initialize renderer if needed
      if (!this.renderer) {
        this.renderer = new WebGPURenderer(this.outputCanvas);
      }

      // Create VideoFrame from ImageBitmap
      const inputFrame = new VideoFrame(this.currentImageBitmap, {
        timestamp: 0,
      });
      let outputFrame: VideoFrame | null = null;
      let inputClosed = false;

      try {
        // Dewarp the frame
        outputFrame = await this.fisheye.dewarp(inputFrame);
        inputFrame.close();
        inputClosed = true;

        // Render the result (draw() closes outputFrame)
        await this.renderer.draw(outputFrame);
        outputFrame = null;
      } finally {
        if (!inputClosed) inputFrame.close();
        outputFrame?.close();
        this.isProcessing = false;
      }
    } catch (e) {
      this.errorMessage = `Processing error: ${e}`;
      console.error(e);
    }
  }

  private handleParamChange(param: string, value: number) {
    (this as unknown as Record<string, number>)[param] = value;
    this.processImage();
  }

  private handlePresetChange(id: PresetId) {
    const preset = VIEW_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    this.presetId = preset.id;
    this.projection = preset.projection;
    this.mount = preset.mount;
    this.fov = preset.fov;
    this.fisheye = null;
    this.processImage();
  }

  private handleSidebarToggle() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  private resetToDefaults() {
    this.presetId = null;
    this.projection = FISHEYE_DEFAULTS.projection;
    this.mount = FISHEYE_DEFAULTS.mount;
    this.fov = FISHEYE_DEFAULTS.fov;
    this.k1 = FISHEYE_DEFAULTS.k1;
    this.k2 = FISHEYE_DEFAULTS.k2;
    this.k3 = FISHEYE_DEFAULTS.k3;
    this.k4 = FISHEYE_DEFAULTS.k4;
    this.centerX = FISHEYE_DEFAULTS.centerX;
    this.centerY = FISHEYE_DEFAULTS.centerY;
    this.zoom = FISHEYE_DEFAULTS.zoom;
    this.fisheye = null;
    this.loadDefaultImage();
  }

  render() {
    return html`
      <div class="container">
        <page-header></page-header>

        <div class="main">
          <div class="sidebar-container">
            <demo-sidebar
              .open=${this.sidebarOpen}
              @toggle=${this.handleSidebarToggle}
            ></demo-sidebar>
            <div class="sidebar-form ${this.sidebarOpen ? "open" : "closed"}">
              ${
                this.errorMessage && !this.hasWebGPU
                  ? html`<div class="error">${this.errorMessage}</div>`
                  : html`
                    <div class="control-group">
                      <h3>Image</h3>
                      <div class="file-input-wrapper">
                        <input
                          type="file"
                          accept="image/*"
                          @change=${this.handleFileUpload}
                        />
                        <div class="file-input-label">
                          <span>📁</span>
                          Upload Image
                        </div>
                      </div>
                    </div>

                    <div class="control-group">
                      <h3>View preset</h3>
                      <p class="control-hint">Mount + projection + FOV (see src/types.ts)</p>
                      <div class="preset-buttons">
                        ${VIEW_PRESETS.map(
                          (p) => html`
                            <button
                              class="preset-btn ${this.presetId !== null && this.presetId === p.id ? "active" : ""}"
                              @click=${() => this.handlePresetChange(p.id)}
                            >
                              ${p.label}
                            </button>
                          `,
                        )}
                      </div>
                    </div>

                    <div class="control-group">
                      <h3>Distortion Coefficients</h3>
                      <p class="control-hint">OpenCV fisheye: θ_d = θ(1 + k1·θ² + k2·θ⁴ + k3·θ⁶ + k4·θ⁸). Typical |k| &lt; 0.1.</p>
                      ${this.renderSlider("k1", this.k1, -0.1, 0.1, 0.0001)}
                      ${this.renderSlider("k2", this.k2, -0.1, 0.1, 0.0001)}
                      ${this.renderSlider("k3", this.k3, -0.1, 0.1, 0.0001)}
                      ${this.renderSlider("k4", this.k4, -0.1, 0.1, 0.0001)}
                    </div>

                    <div class="control-group">
                      <h3>Camera Parameters</h3>
                      ${this.renderSlider("fov", this.fov, 60, 220, 1)}
                      ${this.renderSlider("centerX", this.centerX, -0.5, 0.5, 0.001)}
                      ${this.renderSlider("centerY", this.centerY, -0.5, 0.5, 0.001)}
                      ${this.renderSlider("zoom", this.zoom, 0.1, 3, 0.01)}
                    </div>

                    <div class="control-group">
                      <button class="btn btn-secondary" @click=${this.resetToDefaults}>
                        Reset to Defaults
                      </button>
                    </div>
                  `
              }
            </div>
          </div>

          <div class="canvas-area">
            ${
              this.errorMessage && this.hasWebGPU
                ? html`<div class="error">${this.errorMessage}</div>`
                : ""
            }
            ${
              this.isProcessing
                ? html`
                  <div class="processing">
                    <div class="spinner"></div>
                    Processing...
                  </div>
                `
                : ""
            }

            <div class="canvas-container">
              <div class="canvas-wrapper">
                <h4>Input (Fisheye)</h4>
                <canvas id="input-canvas" width="640" height="480"></canvas>
              </div>
              <div class="canvas-wrapper">
                <h4>Output (Dewarped)</h4>
                <canvas id="output-canvas" width="640" height="480"></canvas>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderSlider(name: string, value: number, min: number, max: number, step: number) {
    return html`
      <div class="control-item">
        <label>
          ${name}
          <span>${value.toFixed(step <= 0.0001 ? 4 : step < 1 ? 3 : 0)}</span>
        </label>
        <input
          type="range"
          min=${min}
          max=${max}
          step=${step}
          .value=${String(value)}
          @input=${(e: Event) =>
            this.handleParamChange(name, Number((e.target as HTMLInputElement).value))}
        />
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "fisheye-demo": FisheyeDemo;
  }
}
