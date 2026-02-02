import type { FisheyeProjection, PaneLayout, PTZOptions } from "@gyeonghokim/fisheye.js";
import { Fisheye } from "@gyeonghokim/fisheye.js";
import { html, LitElement } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { fisheyeDemoStyles, ptzPaneModeStyles } from "./fisheye-demo.styles";
import { WebGPURenderer } from "./renderer";
import "./demo-sidebar";
import "./page-header";

/** VMS mode: default (no PTZ/Pane), ptz (e-PTZ), or pane (multi-view) */
type VMSMode = "default" | "ptz" | "pane";

/** Pane layout kind options */
type PaneKind = "2pane-horizontal" | "2pane-vertical" | "4pane";

/** Reference size for calibration (test/fixture images are 3264×3264). */
const CALIBRATION_REF_SIZE = 3264;

/** Calibration shape (K + D + balance/fovScale) from test_cases.json. */
interface DemoCalibration {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  balance: number;
  fovScale: number;
}

/** Camera 1 calibration from test_cases.json (rectilinear_natural, cam1_01). */
const CAM1_CALIBRATION: DemoCalibration = {
  fx: 991.0,
  fy: 991.0,
  cx: 1612.0,
  cy: 1617.0,
  k1: 0.03562009,
  k2: -0.02587979,
  k3: 0.00564249,
  k4: -0.00107043,
  balance: 0.0,
  fovScale: 1.0,
};

/** Camera 2 calibration from test_cases.json (rectilinear_natural, cam2_01). */
const CAM2_CALIBRATION: DemoCalibration = {
  fx: 991.0,
  fy: 991.0,
  cx: 1612.0,
  cy: 1617.0,
  k1: 0.02494321,
  k2: 0.0049985,
  k3: -0.01754164,
  k4: 0.00455207,
  balance: 0.0,
  fovScale: 1.0,
};

const FISHEYE_DEFAULTS = {
  ...CAM1_CALIBRATION,
  projection: { kind: "rectilinear" } as const satisfies FisheyeProjection,
};

/** Sample images from test/fixture/original (copied to example/public/samples). */
const SAMPLE_IMAGES = [
  { id: "cam1_01", label: "Cam 1-01", src: "samples/cam1_01.jpg" },
  { id: "cam1_02", label: "Cam 1-02", src: "samples/cam1_02.jpg" },
  { id: "cam1_03", label: "Cam 1-03", src: "samples/cam1_03.jpg" },
  { id: "cam2_01", label: "Cam 2-01", src: "samples/cam2_01.jpg" },
  { id: "cam2_02", label: "Cam 2-02", src: "samples/cam2_02.jpg" },
  { id: "cam2_03", label: "Cam 2-03", src: "samples/cam2_03.jpg" },
] as const;

/** Presets map user-facing names to projection modes (all library projection kinds). */
const VIEW_PRESETS = [
  {
    id: "rectilinear",
    label: "Rectilinear (90°)",
    projection: { kind: "rectilinear" } as const satisfies FisheyeProjection,
  },
  {
    id: "equirectangular",
    label: "Equirectangular",
    projection: { kind: "equirectangular" } as const satisfies FisheyeProjection,
  },
  {
    id: "original",
    label: "Original",
    projection: { kind: "original" } as const satisfies FisheyeProjection,
  },
  {
    id: "cylindrical",
    label: "Cylindrical",
    projection: { kind: "cylindrical" } as const satisfies FisheyeProjection,
  },
] as const;
type PresetId = (typeof VIEW_PRESETS)[number]["id"];

@customElement("fisheye-demo")
export class FisheyeDemo extends LitElement {
  @state() private k1 = FISHEYE_DEFAULTS.k1;
  @state() private k2 = FISHEYE_DEFAULTS.k2;
  @state() private k3 = FISHEYE_DEFAULTS.k3;
  @state() private k4 = FISHEYE_DEFAULTS.k4;
  @state() private balance = FISHEYE_DEFAULTS.balance;
  @state() private fovScale = FISHEYE_DEFAULTS.fovScale;
  @state() private presetId: PresetId | null = null;
  @state() private projection: FisheyeProjection = FISHEYE_DEFAULTS.projection;
  @state() private isProcessing = false;
  @state() private errorMessage = "";
  @state() private hasWebGPU = true;
  @state() private sidebarOpen = true;
  @state() private selectedSampleId: string | null = "cam1_01";

  // VMS mode state
  @state() private vmsMode: VMSMode = "default";
  @state() private ptzPan = 0;
  @state() private ptzTilt = 0;
  @state() private ptzZoom = 1.0;
  @state() private paneKind: PaneKind = "4pane";

  @query("#output-canvas") private outputCanvas!: HTMLCanvasElement;
  @query("#input-canvas") private inputCanvas!: HTMLCanvasElement;
  @query("#pane-canvas-0") private paneCanvas0!: HTMLCanvasElement;
  @query("#pane-canvas-1") private paneCanvas1!: HTMLCanvasElement;
  @query("#pane-canvas-2") private paneCanvas2!: HTMLCanvasElement;
  @query("#pane-canvas-3") private paneCanvas3!: HTMLCanvasElement;

  private fisheye: Fisheye | null = null;
  private renderer: WebGPURenderer | null = null;
  private paneRenderers: WebGPURenderer[] = [];
  private currentImageBitmap: ImageBitmap | null = null;

  private processImagePromise: Promise<void> = Promise.resolve();
  private processImageDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Incremented on each sample/file load; only the matching processImage run may draw to output. */
  private loadRequestId = 0;

  private static readonly PROCESS_IMAGE_DEBOUNCE_MS = 200;

  static styles = [fisheyeDemoStyles, ptzPaneModeStyles];

  connectedCallback() {
    super.connectedCallback();
    this.checkWebGPU();
    this.loadDefaultImage();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.processImageDebounceTimer !== null) {
      clearTimeout(this.processImageDebounceTimer);
      this.processImageDebounceTimer = null;
    }
    this.fisheye?.destroy();
    this.renderer?.destroy();
    for (const r of this.paneRenderers) r.destroy();
    this.paneRenderers = [];
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
      const firstSample = SAMPLE_IMAGES[0];
      this.applyCalibrationFromSample(firstSample.id);
      const imgResponse = await fetch(
        `${import.meta.env.BASE_URL}${firstSample.src}?t=${Date.now()}`,
      );
      const blob = await imgResponse.blob();
      await this.loadImage(blob);
      this.selectedSampleId = firstSample.id;
    } catch (e) {
      console.warn("Failed to load default image:", e);
    }
  }

  private async loadImage(blob: Blob, sampleIdForCalibration?: string) {
    try {
      const requestId = ++this.loadRequestId;
      this.currentImageBitmap?.close();
      this.currentImageBitmap = await createImageBitmap(blob);

      await this.updateComplete;
      const ctx = this.inputCanvas.getContext("2d");
      if (ctx) {
        this.inputCanvas.width = this.currentImageBitmap.width;
        this.inputCanvas.height = this.currentImageBitmap.height;
        ctx.drawImage(this.currentImageBitmap, 0, 0);
      }

      const imageToProcess = this.currentImageBitmap;
      await this.processImagePromise;
      if (requestId !== this.loadRequestId) return;
      this.processImagePromise = this.processImage(
        imageToProcess,
        sampleIdForCalibration,
        requestId,
      ).catch(() => {});
      await this.processImagePromise;
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    } catch (e) {
      this.errorMessage = `Failed to load image: ${e}`;
    }
  }

  private async handleFileUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.selectedSampleId = null;
      await this.loadImage(file);
    }
  }

  private getCalibrationForCurrentSample(): DemoCalibration {
    const id = this.selectedSampleId ?? "cam1_01";
    return id.startsWith("cam2_") ? CAM2_CALIBRATION : CAM1_CALIBRATION;
  }

  private buildFisheyeOptions(w: number, h: number, sampleIdForCalibration?: string) {
    const cal =
      sampleIdForCalibration !== undefined
        ? sampleIdForCalibration.startsWith("cam2_")
          ? CAM2_CALIBRATION
          : CAM1_CALIBRATION
        : this.getCalibrationForCurrentSample();
    const scaleX = w / CALIBRATION_REF_SIZE;
    const scaleY = h / CALIBRATION_REF_SIZE;
    const projection =
      this.projection.kind === "rectilinear"
        ? {
            kind: "rectilinear" as const,
            mode: "manual" as const,
            newFx: cal.fx * scaleX,
            newFy: cal.fy * scaleY,
            newCx: w / 2,
            newCy: h / 2,
          }
        : this.projection;

    // Build PTZ or Pane options based on VMS mode
    let ptz: PTZOptions | undefined;
    let pane: PaneLayout | undefined;

    if (this.vmsMode === "ptz") {
      ptz = { pan: this.ptzPan, tilt: this.ptzTilt, zoom: this.ptzZoom };
    } else if (this.vmsMode === "pane") {
      if (this.paneKind === "4pane") {
        pane = { kind: "4pane" };
      } else if (this.paneKind === "2pane-horizontal") {
        pane = { kind: "2pane", orientation: "horizontal" };
      } else {
        pane = { kind: "2pane", orientation: "vertical" };
      }
    }

    return {
      fx: cal.fx * scaleX,
      fy: cal.fy * scaleY,
      cx: cal.cx * scaleX,
      cy: cal.cy * scaleY,
      k1: this.k1,
      k2: this.k2,
      k3: this.k3,
      k4: this.k4,
      width: w,
      height: h,
      balance: this.balance,
      fovScale: this.fovScale,
      projection,
      ptz,
      pane,
    };
  }

  private applyCalibrationFromSample(sampleId: string) {
    const cal = sampleId.startsWith("cam2_") ? CAM2_CALIBRATION : CAM1_CALIBRATION;
    this.k1 = cal.k1;
    this.k2 = cal.k2;
    this.k3 = cal.k3;
    this.k4 = cal.k4;
    this.balance = cal.balance;
    this.fovScale = cal.fovScale;
  }

  private async handleSampleSelect(sample: (typeof SAMPLE_IMAGES)[number]) {
    try {
      this.selectedSampleId = sample.id;
      this.applyCalibrationFromSample(sample.id);
      await this.updateComplete;
      const imgResponse = await fetch(`${import.meta.env.BASE_URL}${sample.src}?t=${Date.now()}`);
      const blob = await imgResponse.blob();
      await this.loadImage(blob, sample.id);
    } catch (_e) {
      this.errorMessage = `Failed to load sample: ${sample.label}`;
    }
  }

  private ensureFisheyeReady(options: ReturnType<FisheyeDemo["buildFisheyeOptions"]>): void {
    if (!this.fisheye) {
      this.fisheye = new Fisheye(options);
    } else {
      this.fisheye.updateConfig(options);
    }
  }

  private async drawOrCloseResult(
    result: VideoFrame | VideoFrame[],
    isLatest: boolean,
  ): Promise<void> {
    if (!isLatest) {
      if (Array.isArray(result)) {
        for (const f of result) f.close();
      } else {
        result.close();
      }
      return;
    }
    if (this.vmsMode === "pane" && Array.isArray(result)) {
      await this.renderPaneFrames(result);
    } else if (result instanceof VideoFrame) {
      if (!this.renderer) {
        this.renderer = new WebGPURenderer(this.outputCanvas);
      }
      await this.renderer.draw(result);
    }
  }

  private async processImage(
    image?: ImageBitmap | null,
    sampleIdForCalibration?: string,
    requestId?: number,
  ) {
    const bitmap = image ?? this.currentImageBitmap;
    if (!bitmap || !this.hasWebGPU) return;

    this.isProcessing = true;
    this.errorMessage = "";

    try {
      await this.updateComplete;
      if (requestId !== undefined && requestId !== this.loadRequestId) {
        this.isProcessing = false;
        return;
      }

      const w = bitmap.width;
      const h = bitmap.height;
      const fisheyeOptions = this.buildFisheyeOptions(w, h, sampleIdForCalibration);
      this.ensureFisheyeReady(fisheyeOptions);

      const fisheye = this.fisheye;
      if (!fisheye) {
        this.isProcessing = false;
        return;
      }

      const inputFrame = new VideoFrame(bitmap, { timestamp: 0 });
      let inputClosed = false;

      try {
        const result = await fisheye.undistort(inputFrame);
        inputFrame.close();
        inputClosed = true;

        const isLatest = requestId === undefined || requestId === this.loadRequestId;
        await this.drawOrCloseResult(result, isLatest);
      } finally {
        if (!inputClosed) inputFrame.close();
        this.isProcessing = false;
      }
    } catch (e) {
      this.errorMessage = `Processing error: ${e}`;
      console.error(e);
    }
  }

  private async renderPaneFrames(frames: VideoFrame[]) {
    const paneCanvases = [this.paneCanvas0, this.paneCanvas1, this.paneCanvas2, this.paneCanvas3];
    const numPanes = frames.length;

    // Initialize pane renderers if needed
    while (this.paneRenderers.length < numPanes) {
      const idx = this.paneRenderers.length;
      if (paneCanvases[idx]) {
        this.paneRenderers.push(new WebGPURenderer(paneCanvases[idx]));
      }
    }

    // Render each frame to its canvas
    for (let i = 0; i < numPanes && i < paneCanvases.length; i++) {
      if (this.paneRenderers[i] && frames[i]) {
        await this.paneRenderers[i].draw(frames[i]);
      }
    }
  }

  /** Enqueue processImage so only one run is in flight; returns the promise for that run. */
  private enqueueProcessImage(): Promise<void> {
    const prev = this.processImagePromise;
    this.processImagePromise = prev.then(() => this.processImage()).catch(() => {});
    return this.processImagePromise;
  }

  private scheduleProcessImageDebounced(): void {
    if (this.processImageDebounceTimer !== null) {
      clearTimeout(this.processImageDebounceTimer);
    }
    this.processImageDebounceTimer = setTimeout(() => {
      this.processImageDebounceTimer = null;
      this.enqueueProcessImage();
    }, FisheyeDemo.PROCESS_IMAGE_DEBOUNCE_MS);
  }

  private cancelProcessImageDebounce(): void {
    if (this.processImageDebounceTimer !== null) {
      clearTimeout(this.processImageDebounceTimer);
      this.processImageDebounceTimer = null;
    }
  }

  private handleParamChange(param: string, value: number) {
    (this as unknown as Record<string, number>)[param] = value;
    this.scheduleProcessImageDebounced();
  }

  private async handlePresetChange(id: PresetId) {
    const preset = VIEW_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    this.cancelProcessImageDebounce();
    this.presetId = preset.id;
    this.projection = preset.projection;
    this.fisheye = null;
    await this.enqueueProcessImage();
  }

  private async handleVmsModeChange(mode: VMSMode) {
    this.cancelProcessImageDebounce();
    this.vmsMode = mode;
    // Destroy and recreate fisheye when mode changes
    this.fisheye?.destroy();
    this.fisheye = null;
    // Clean up pane renderers when switching away from pane mode
    if (mode !== "pane") {
      for (const r of this.paneRenderers) r.destroy();
      this.paneRenderers = [];
    }
    await this.enqueueProcessImage();
  }

  private handlePtzChange(param: "ptzPan" | "ptzTilt" | "ptzZoom", value: number) {
    (this as unknown as Record<string, number>)[param] = value;
    this.scheduleProcessImageDebounced();
  }

  private async handlePaneKindChange(kind: PaneKind) {
    this.cancelProcessImageDebounce();
    this.paneKind = kind;
    // Destroy and recreate fisheye when pane kind changes
    this.fisheye?.destroy();
    this.fisheye = null;
    // Clean up and recreate pane renderers
    for (const r of this.paneRenderers) r.destroy();
    this.paneRenderers = [];
    await this.enqueueProcessImage();
  }

  private handleSidebarToggle() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  private resetToDefaults() {
    this.presetId = null;
    this.projection = FISHEYE_DEFAULTS.projection;
    this.balance = FISHEYE_DEFAULTS.balance;
    this.fovScale = FISHEYE_DEFAULTS.fovScale;
    this.k1 = FISHEYE_DEFAULTS.k1;
    this.k2 = FISHEYE_DEFAULTS.k2;
    this.k3 = FISHEYE_DEFAULTS.k3;
    this.k4 = FISHEYE_DEFAULTS.k4;
    // Reset VMS mode
    this.vmsMode = "default";
    this.ptzPan = 0;
    this.ptzTilt = 0;
    this.ptzZoom = 1.0;
    this.paneKind = "4pane";
    // Clean up
    this.fisheye?.destroy();
    this.fisheye = null;
    for (const r of this.paneRenderers) r.destroy();
    this.paneRenderers = [];
    this.loadDefaultImage();
  }

  private renderSidebarFormContent() {
    if (this.errorMessage && !this.hasWebGPU) {
      return html`<div class="error">${this.errorMessage}</div>`;
    }
    return html`
      <div class="control-group">
        <h3>Image</h3>
        <p class="control-hint">Pick a sample or upload your own file.</p>
        <div class="sample-thumbnails">
          ${SAMPLE_IMAGES.map(
            (s) => html`
              <button
                type="button"
                class="sample-thumb ${this.selectedSampleId === s.id ? "active" : ""}"
                title=${s.label}
                @click=${() => this.handleSampleSelect(s)}
              >
                <img src="${import.meta.env.BASE_URL}${s.src}" alt=${s.label} loading="lazy" />
                <span>${s.label}</span>
              </button>
            `,
          )}
        </div>
        <div class="file-input-wrapper">
          <input type="file" accept="image/*" @change=${this.handleFileUpload} />
          <div class="file-input-label">
            <span>📁</span>
            Upload Image
          </div>
        </div>
      </div>

      <div class="control-group">
        <h3>VMS Mode</h3>
        <p class="control-hint">Select viewing mode: Default, PTZ (e-PTZ), or Pane (multi-view).</p>
        <div class="preset-buttons">
          <button
            class="preset-btn ${this.vmsMode === "default" ? "active" : ""}"
            @click=${() => this.handleVmsModeChange("default")}
          >
            Default
          </button>
          <button
            class="preset-btn ${this.vmsMode === "ptz" ? "active" : ""}"
            @click=${() => this.handleVmsModeChange("ptz")}
          >
            PTZ
          </button>
          <button
            class="preset-btn ${this.vmsMode === "pane" ? "active" : ""}"
            @click=${() => this.handleVmsModeChange("pane")}
          >
            Pane
          </button>
        </div>
      </div>

      ${this.vmsMode === "ptz" ? this.renderPtzControls() : ""}
      ${this.vmsMode === "pane" ? this.renderPaneControls() : ""}

      <div class="control-group">
        <h3>View preset</h3>
        <p class="control-hint">Projection mode (rectilinear, equirectangular, etc.)</p>
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
        <p class="control-hint">balance: 0 = no black edges, 1 = keep original FOV. fovScale: &gt;1 = widen FOV, &lt;1 = narrow FOV.</p>
        ${this.renderSlider("balance", this.balance, 0, 1, 0.01)}
        ${this.renderSlider("fovScale", this.fovScale, 0.1, 3, 0.01)}
      </div>

      <div class="control-group">
        <button class="btn btn-secondary" @click=${this.resetToDefaults}>
          Reset to Defaults
        </button>
      </div>
    `;
  }

  private renderCanvasArea() {
    const showError = this.errorMessage && this.hasWebGPU;
    const showProcessing = this.isProcessing;
    return html`
      <div class="canvas-area">
        ${showError ? html`<div class="error">${this.errorMessage}</div>` : ""}
        ${
          showProcessing
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
          ${
            this.vmsMode === "pane"
              ? this.renderPaneCanvases()
              : html`
                <div class="canvas-wrapper">
                  <h4>Output (Dewarped)</h4>
                  <canvas id="output-canvas" width="640" height="480"></canvas>
                </div>
              `
          }
        </div>
      </div>
    `;
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
              ${this.renderSidebarFormContent()}
            </div>
          </div>

          ${this.renderCanvasArea()}
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

  private renderPtzControls() {
    return html`
      <div class="control-group ptz-controls">
        <h3>PTZ Controls</h3>
        <p class="control-hint">Pan (-180° to 180°), Tilt (-90° to 90°), Zoom (0.5x to 4x).</p>
        <div class="control-item">
          <label>
            Pan
            <span>${this.ptzPan.toFixed(0)}°</span>
          </label>
          <input
            type="range"
            min="-180"
            max="180"
            step="1"
            .value=${String(this.ptzPan)}
            @input=${(e: Event) =>
              this.handlePtzChange("ptzPan", Number((e.target as HTMLInputElement).value))}
          />
        </div>
        <div class="control-item">
          <label>
            Tilt
            <span>${this.ptzTilt.toFixed(0)}°</span>
          </label>
          <input
            type="range"
            min="-90"
            max="90"
            step="1"
            .value=${String(this.ptzTilt)}
            @input=${(e: Event) =>
              this.handlePtzChange("ptzTilt", Number((e.target as HTMLInputElement).value))}
          />
        </div>
        <div class="control-item">
          <label>
            Zoom
            <span>${this.ptzZoom.toFixed(1)}x</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="4"
            step="0.1"
            .value=${String(this.ptzZoom)}
            @input=${(e: Event) =>
              this.handlePtzChange("ptzZoom", Number((e.target as HTMLInputElement).value))}
          />
        </div>
      </div>
    `;
  }

  private renderPaneControls() {
    return html`
      <div class="control-group pane-controls">
        <h3>Pane Layout</h3>
        <p class="control-hint">Select multi-view layout for VMS display.</p>
        <div class="preset-buttons">
          <button
            class="preset-btn ${this.paneKind === "2pane-horizontal" ? "active" : ""}"
            @click=${() => this.handlePaneKindChange("2pane-horizontal")}
          >
            2-Pane (H)
          </button>
          <button
            class="preset-btn ${this.paneKind === "2pane-vertical" ? "active" : ""}"
            @click=${() => this.handlePaneKindChange("2pane-vertical")}
          >
            2-Pane (V)
          </button>
          <button
            class="preset-btn ${this.paneKind === "4pane" ? "active" : ""}"
            @click=${() => this.handlePaneKindChange("4pane")}
          >
            4-Pane
          </button>
        </div>
      </div>
    `;
  }

  private renderPaneCanvases() {
    const numPanes = this.paneKind === "4pane" ? 4 : 2;
    const paneLabels =
      this.paneKind === "4pane"
        ? ["Front (0°)", "Right (90°)", "Back (180°)", "Left (-90°)"]
        : this.paneKind === "2pane-horizontal"
          ? ["Left (-45°)", "Right (45°)"]
          : ["Top (tilt +30°)", "Bottom (tilt -30°)"];

    return html`
      <div class="pane-output ${this.paneKind}">
        ${Array.from(
          { length: numPanes },
          (_, i) => html`
          <div class="canvas-wrapper pane-wrapper">
            <h4>${paneLabels[i]}</h4>
            <canvas id="pane-canvas-${i}" width="400" height="300"></canvas>
          </div>
        `,
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "fisheye-demo": FisheyeDemo;
  }
}
