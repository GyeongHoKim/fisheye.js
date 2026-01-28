import { Fisheye } from "@gyeonghokim/fisheye.js";
import { css, html, LitElement } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { WebGPURenderer } from "./renderer";

// Defaults from OpenCV test_fisheye.cpp (opencv_extra fisheye testdata)
const OPENCV_FISHEYE_DEFAULTS = {
  k1: -0.0014613319981768,
  k2: -0.00329861110580401,
  k3: 0.00605760088590183,
  k4: -0.00374209380722371,
  centerX: -0.0306,
  centerY: -0.0452,
  fov: 180,
  zoom: 1.0,
};

@customElement("fisheye-demo")
export class FisheyeDemo extends LitElement {
  @state() private k1 = OPENCV_FISHEYE_DEFAULTS.k1;
  @state() private k2 = OPENCV_FISHEYE_DEFAULTS.k2;
  @state() private k3 = OPENCV_FISHEYE_DEFAULTS.k3;
  @state() private k4 = OPENCV_FISHEYE_DEFAULTS.k4;
  @state() private fov = OPENCV_FISHEYE_DEFAULTS.fov;
  @state() private centerX = OPENCV_FISHEYE_DEFAULTS.centerX;
  @state() private centerY = OPENCV_FISHEYE_DEFAULTS.centerY;
  @state() private zoom = OPENCV_FISHEYE_DEFAULTS.zoom;
  @state() private isProcessing = false;
  @state() private errorMessage = "";
  @state() private hasWebGPU = true;

  @query("#output-canvas") private outputCanvas!: HTMLCanvasElement;
  @query("#input-canvas") private inputCanvas!: HTMLCanvasElement;

  private fisheye: Fisheye | null = null;
  private renderer: WebGPURenderer | null = null;
  private currentImageBitmap: ImageBitmap | null = null;

  static styles = css`
    :host {
      display: block;
      font-family: system-ui, -apple-system, sans-serif;
      color: #e0e0e0;
      background: #1a1a2e;
      min-height: 100vh;
    }

    .container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    header {
      padding: 1rem 2rem;
      background: #16213e;
      border-bottom: 1px solid #0f3460;
    }

    header h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      background: linear-gradient(90deg, #00d9ff, #00ff88);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    header p {
      margin: 0.25rem 0 0;
      font-size: 0.875rem;
      color: #8892b0;
    }

    .main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .controls {
      width: 320px;
      padding: 1.5rem;
      background: #16213e;
      overflow-y: auto;
      border-right: 1px solid #0f3460;
    }

    .control-group {
      margin-bottom: 1.5rem;
    }

    .control-group h3 {
      margin: 0 0 0.75rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #00d9ff;
    }

    .control-item {
      margin-bottom: 1rem;
    }

    .control-item label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.25rem;
      font-size: 0.875rem;
      color: #a0a0a0;
    }

    .control-item label span {
      font-family: monospace;
      color: #00ff88;
    }

    input[type="range"] {
      width: 100%;
      height: 6px;
      background: #0f3460;
      border-radius: 3px;
      outline: none;
      -webkit-appearance: none;
    }

    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      background: #00d9ff;
      border-radius: 50%;
      cursor: pointer;
      transition: background 0.15s;
    }

    input[type="range"]::-webkit-slider-thumb:hover {
      background: #00ff88;
    }

    input[type="number"] {
      width: 100%;
      padding: 0.5rem;
      background: #0f3460;
      border: 1px solid #1a3a5c;
      border-radius: 4px;
      color: #e0e0e0;
      font-family: monospace;
      font-size: 0.875rem;
    }

    input[type="number"]:focus {
      outline: none;
      border-color: #00d9ff;
    }

    .file-input-wrapper {
      position: relative;
    }

    .file-input-wrapper input[type="file"] {
      position: absolute;
      opacity: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }

    .file-input-label {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: linear-gradient(135deg, #0f3460, #16213e);
      border: 2px dashed #0f3460;
      border-radius: 8px;
      color: #8892b0;
      font-size: 0.875rem;
      transition: all 0.2s;
    }

    .file-input-wrapper:hover .file-input-label {
      border-color: #00d9ff;
      color: #00d9ff;
    }

    .canvas-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      gap: 1rem;
      overflow: auto;
    }

    .canvas-container {
      display: flex;
      gap: 2rem;
      align-items: flex-start;
    }

    .canvas-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }

    .canvas-wrapper h4 {
      margin: 0;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #8892b0;
    }

    canvas {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    #input-canvas {
      max-width: 400px;
      background: #0a0a14;
    }

    #output-canvas {
      max-width: 600px;
      background: #0a0a14;
    }

    .error {
      padding: 1rem;
      background: rgba(255, 82, 82, 0.1);
      border: 1px solid #ff5252;
      border-radius: 8px;
      color: #ff5252;
      font-size: 0.875rem;
    }

    .processing {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #00d9ff;
      font-size: 0.875rem;
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #0f3460;
      border-top-color: #00d9ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .btn {
      width: 100%;
      padding: 0.75rem 1rem;
      background: linear-gradient(135deg, #00d9ff, #00ff88);
      border: none;
      border-radius: 8px;
      color: #1a1a2e;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .btn:hover {
      opacity: 0.9;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #0f3460;
      color: #e0e0e0;
    }

    @media (max-width: 900px) {
      .main {
        flex-direction: column;
      }

      .controls {
        width: 100%;
        border-right: none;
        border-bottom: 1px solid #0f3460;
      }

      .canvas-container {
        flex-direction: column;
        align-items: center;
      }
    }
  `;

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

      // Initialize fisheye if needed
      if (!this.fisheye) {
        this.fisheye = new Fisheye({
          k1: this.k1,
          k2: this.k2,
          k3: this.k3,
          k4: this.k4,
          fov: this.fov,
          centerX: this.centerX,
          centerY: this.centerY,
          zoom: this.zoom,
          width: this.currentImageBitmap.width,
          height: this.currentImageBitmap.height,
        });
      } else {
        this.fisheye.updateConfig({
          k1: this.k1,
          k2: this.k2,
          k3: this.k3,
          k4: this.k4,
          fov: this.fov,
          centerX: this.centerX,
          centerY: this.centerY,
          zoom: this.zoom,
          width: this.currentImageBitmap.width,
          height: this.currentImageBitmap.height,
        });
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

  private resetToDefaults() {
    this.loadDefaultImage();
  }

  render() {
    return html`
      <div class="container">
        <header>
          <h1>fisheye.js</h1>
          <p>GPU-accelerated fisheye dewarping using WebGPU</p>
        </header>

        <div class="main">
          <aside class="controls">
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
                    <h3>Distortion Coefficients</h3>
                    ${this.renderSlider("k1", this.k1, -500, 500, 0.001)}
                    ${this.renderSlider("k2", this.k2, -100, 100, 0.001)}
                    ${this.renderSlider("k3", this.k3, -100, 100, 0.001)}
                    ${this.renderSlider("k4", this.k4, -50, 50, 0.001)}
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
          </aside>

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
          <span>${value.toFixed(step < 1 ? 3 : 0)}</span>
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
