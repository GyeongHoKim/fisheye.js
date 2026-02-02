/**
 * OpenCV Fisheye Camera Model (Kannala-Brandt) type definitions.
 *
 * **Distortion**: `θ_d = θ(1 + k₁θ² + k₂θ⁴ + k₃θ⁶ + k₄θ⁸)` where `θ = atan(r)`, `r² = a² + b²`
 *
 * **Pixel coords**: `u = fx(x' + αy') + cx`, `v = fy·y' + cy`
 *
 * **K matrix**: `[[fx, 0, cx], [0, fy, cy], [0, 0, 1]]`
 *
 * **D vector**: `[k₁, k₂, k₃, k₄]`
 *
 * @see {@link https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html}
 * @module
 */

// ─── Core Types ─────────────────────────────────────────────────────────────

/**
 * Camera intrinsics (K matrix).
 * Pixel projection: `u = fx(x' + αy') + cx`, `v = fy·y' + cy`.
 * @see {@link https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html}
 */
export interface KMatrix {
  /** Focal length in x (pixels). */
  fx: number;
  /** Focal length in y (pixels). */
  fy: number;
  /** Principal point x (pixels). Defaults to width/2 when omitted. */
  cx?: number;
  /** Principal point y (pixels). Defaults to height/2 when omitted. */
  cy?: number;
  /** Skew coefficient (optional). */
  alpha?: number;
}

/**
 * Distortion coefficients (D vector) for Kannala-Brandt model.
 * Distortion: `θ_d = θ(1 + k₁θ² + k₂θ⁴ + k₃θ⁶ + k₄θ⁸)` where `θ = atan(r)`.
 */
export interface DVector {
  k1: number;
  k2: number;
  k3: number;
  k4: number;
}

/**
 * Output image dimensions.
 */
export interface ImageSize {
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
}

// ─── Projection Types ───────────────────────────────────────────────────────

/** Literal union of supported projection kinds. */
export const FISHEYE_PROJECTION_KINDS = [
  "rectilinear",
  "equirectangular",
  "original",
  "cylindrical",
] as const;

/** Supported output projection mode identifier. */
export type FisheyeProjectionKind = (typeof FISHEYE_PROJECTION_KINDS)[number];

/**
 * New camera matrix P (Knew) for rectilinear output.
 * Used when `projection.kind === "rectilinear"` and `mode === "manual"`.
 * @see {@link https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html#ga167df4b1c2e30f6c46a2af7fa6d4cfff|initUndistortRectifyMap}
 */
export interface NewCameraMatrix {
  /** New focal length in x (pixels). */
  readonly newFx: number;
  /** New focal length in y (pixels). */
  readonly newFy: number;
  /** New principal point x (pixels). Optional. */
  readonly newCx?: number;
  /** New principal point y (pixels). Optional. */
  readonly newCy?: number;
}

/** Rectilinear projection with auto P matrix (from balance/fovScale). */
export interface RectilinearAuto {
  readonly kind: "rectilinear";
  readonly mode?: undefined;
}

/** Rectilinear projection with explicit P matrix (manual newFx, newFy, etc.). */
export interface RectilinearManual extends NewCameraMatrix {
  readonly kind: "rectilinear";
  readonly mode: "manual";
}

/** Rectilinear projection: either auto or manual P matrix. */
export type RectilinearProjection = RectilinearAuto | RectilinearManual;

/** Union of all supported output projection modes. */
export type FisheyeProjection =
  | RectilinearProjection
  | { readonly kind: "equirectangular" }
  | { readonly kind: "original" }
  | { readonly kind: "cylindrical" };

/** Default projection: rectilinear with auto P matrix. */
export const DEFAULT_PROJECTION = { kind: "rectilinear" } as const satisfies RectilinearAuto;

/**
 * Type guard for manual rectilinear projection.
 * @param p - Projection value to test.
 * @returns `true` if `p` is rectilinear with `mode: "manual"`.
 */
export function isRectilinearManual(p: FisheyeProjection): p is RectilinearManual {
  return p.kind === "rectilinear" && p.mode === "manual";
}

/**
 * Ensures PTZ and Pane modes are not used together.
 * @param ptz - PTZ options if e-PTZ mode is used.
 * @param pane - Pane layout if multi-pane mode is used.
 * @throws {Error} When both `ptz` and `pane` are defined.
 */
export function validateModeExclusivity(
  ptz: PTZOptions | undefined,
  pane: PaneLayout | undefined,
): void {
  if (ptz && pane) {
    throw new Error("PTZ and Pane modes are mutually exclusive. Use only one.");
  }
}

/**
 * Returns the preset key for a pane layout (for internal preset PTZ lookup).
 * @param pane - Pane layout (2pane or 4pane).
 * @returns Preset key: `"2pane-horizontal"`, `"2pane-vertical"`, or `"4pane"`.
 */
export function getPanePresetKey(
  pane: PaneLayout,
): "2pane-horizontal" | "2pane-vertical" | "4pane" {
  if (pane.kind === "4pane") {
    return "4pane";
  }
  return pane.orientation === "vertical" ? "2pane-vertical" : "2pane-horizontal";
}

// ─── PTZ and Pane Types ──────────────────────────────────────────────────────

/**
 * PTZ (Pan-Tilt-Zoom) options for e-PTZ mode.
 * Mutually exclusive with {@link PaneLayout}; use either `ptz` or `pane`, not both.
 */
export interface PTZOptions {
  /** Horizontal rotation in degrees (-180 to 180). */
  pan?: number;
  /** Vertical rotation in degrees (-90 to 90). */
  tilt?: number;
  /** Zoom factor (1.0 = no zoom, &gt;1 = zoom in). */
  zoom?: number;
}

/**
 * Two-pane split layout (left/right or top/bottom).
 */
export interface TwoPaneLayout {
  kind: "2pane";
  /** Pane orientation: horizontal (left/right) or vertical (top/bottom). Default: "horizontal". */
  orientation?: "horizontal" | "vertical";
}

/**
 * Four-pane grid layout (front, right, back, left).
 */
export interface FourPaneLayout {
  kind: "4pane";
}

/**
 * Pane layout for multi-view mode (2-pane or 4-pane).
 * Mutually exclusive with {@link PTZOptions}; use either `pane` or `ptz`, not both.
 */
export type PaneLayout = TwoPaneLayout | FourPaneLayout;

/**
 * Internal preset PTZ values per pane (used when pane layout is set without per-pane overrides).
 */
export const PANE_PRESETS = {
  "2pane-horizontal": [
    { pan: -45, tilt: 0, zoom: 1 }, // left
    { pan: 45, tilt: 0, zoom: 1 }, // right
  ],
  "2pane-vertical": [
    { pan: 0, tilt: 30, zoom: 1 }, // top
    { pan: 0, tilt: -30, zoom: 1 }, // bottom
  ],
  "4pane": [
    { pan: 0, tilt: 0, zoom: 1 }, // front
    { pan: 90, tilt: 0, zoom: 1 }, // right
    { pan: 180, tilt: 0, zoom: 1 }, // back
    { pan: -90, tilt: 0, zoom: 1 }, // left
  ],
} as const;

// ─── Options (flat style for user input) ────────────────────────────────────

/** @internal Helper: T either fully present or all keys optional/undefined. */
type AllOrNothing<T extends object> = T | { [K in keyof T]?: undefined };

/**
 * Flat camera intrinsics: `fx`/`fy` both required or both omitted; `cx`, `cy`, `alpha` optional.
 */
export type CameraIntrinsics = AllOrNothing<Pick<KMatrix, "fx" | "fy">> &
  Pick<KMatrix, "cx" | "cy" | "alpha">;

/**
 * Flat distortion coefficients: k1–k4 all required or all omitted.
 */
export type FisheyeDistortionCoeffs = AllOrNothing<DVector>;

/**
 * Flat output size: `width` and `height` both required or both omitted.
 */
export type OutputSize = AllOrNothing<ImageSize>;

/**
 * Mode option: either e-PTZ (`ptz`) or multi-pane (`pane`), or neither. Not both.
 */
export type ModeOptions =
  | { ptz?: PTZOptions; pane?: undefined }
  | { ptz?: undefined; pane?: PaneLayout }
  | { ptz?: undefined; pane?: undefined };

/**
 * Flat (user-facing) options: intrinsics, distortion, size, balance, fovScale, projection, and mode.
 */
export type FisheyeOptionsStrict = CameraIntrinsics &
  FisheyeDistortionCoeffs &
  OutputSize &
  ModeOptions & {
    /** Balance for P matrix (0 = no black edges, 1 = keep FOV). */
    balance?: number;
    /** FOV scale (&gt;1 = widen, &lt;1 = narrow). */
    fovScale?: number;
    /** Output projection mode. */
    projection?: FisheyeProjection;
  };

// ─── Config (normalized, grouped style) ─────────────────────────────────────

/**
 * Normalized configuration with grouped K, D, size and optional PTZ/pane mode.
 */
export interface FisheyeConfig {
  /** Camera intrinsics (optional; can be derived from size). */
  K?: KMatrix;
  /** Distortion coefficients. */
  D: DVector;
  /** Output image size. */
  size: ImageSize;
  /** Balance for P matrix (0 = no black edges, 1 = keep FOV). */
  balance: number;
  /** FOV scale (&gt;1 = widen, &lt;1 = narrow). */
  fovScale: number;
  /** Output projection mode. */
  projection: FisheyeProjection;
  /** PTZ options for e-PTZ mode (mutually exclusive with pane). */
  ptz?: PTZOptions;
  /** Pane layout for multi-view (mutually exclusive with ptz). */
  pane?: PaneLayout;
}

/** Partial config for incremental updates. */
export type FisheyeConfigUpdate = Partial<FisheyeConfig>;

/**
 * Constructor/update options: either flat ({@link FisheyeOptionsStrict}) or grouped ({@link FisheyeConfig}).
 */
export type FisheyeOptions = FisheyeOptionsStrict | FisheyeConfig;

// ─── Factory Functions ──────────────────────────────────────────────────────

/**
 * Builds a projection descriptor. For rectilinear, pass optional P matrix for manual mode.
 * @param kind - Projection kind.
 * @param matrix - Optional new camera matrix (rectilinear manual only).
 * @returns Projection object for {@link FisheyeProjection}.
 */
export function toProjection<K extends Exclude<FisheyeProjectionKind, "rectilinear">>(
  kind: K,
): { readonly kind: K };
export function toProjection(kind: "rectilinear", matrix?: NewCameraMatrix): RectilinearProjection;
export function toProjection(
  kind: FisheyeProjectionKind,
  matrix?: NewCameraMatrix,
): FisheyeProjection;
export function toProjection(
  kind: FisheyeProjectionKind,
  matrix?: NewCameraMatrix,
): FisheyeProjection {
  if (kind === "rectilinear") {
    return matrix ? { kind: "rectilinear", mode: "manual", ...matrix } : { kind: "rectilinear" };
  }
  return { kind };
}
