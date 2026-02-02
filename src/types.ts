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

/** K matrix - camera intrinsics */
export interface KMatrix {
  fx: number;
  fy: number;
  cx?: number;
  cy?: number;
  alpha?: number;
}

/** D vector - distortion coefficients for `θ_d = θ(1 + k₁θ² + k₂θ⁴ + k₃θ⁶ + k₄θ⁸)` */
export interface DVector {
  k1: number;
  k2: number;
  k3: number;
  k4: number;
}

/** Output image size */
export interface ImageSize {
  width: number;
  height: number;
}

// ─── Projection Types ───────────────────────────────────────────────────────

export const FISHEYE_PROJECTION_KINDS = [
  "rectilinear",
  "equirectangular",
  "original",
  "cylindrical",
] as const;

export type FisheyeProjectionKind = (typeof FISHEYE_PROJECTION_KINDS)[number];

/**
 * New camera matrix P (Knew).
 * @see {@link https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html#ga167df4b1c2e30f6c46a2af7fa6d4cfff|initUndistortRectifyMap}
 */
export interface NewCameraMatrix {
  readonly newFx: number;
  readonly newFy: number;
  readonly newCx?: number;
  readonly newCy?: number;
}

export interface RectilinearAuto {
  readonly kind: "rectilinear";
  readonly mode?: undefined;
}

export interface RectilinearManual extends NewCameraMatrix {
  readonly kind: "rectilinear";
  readonly mode: "manual";
}

export type RectilinearProjection = RectilinearAuto | RectilinearManual;

export type FisheyeProjection =
  | RectilinearProjection
  | { readonly kind: "equirectangular" }
  | { readonly kind: "original" }
  | { readonly kind: "cylindrical" };

export const DEFAULT_PROJECTION = { kind: "rectilinear" } as const satisfies RectilinearAuto;

export function isRectilinearManual(p: FisheyeProjection): p is RectilinearManual {
  return p.kind === "rectilinear" && p.mode === "manual";
}

// ─── Options (flat style for user input) ────────────────────────────────────

type AllOrNothing<T extends object> = T | { [K in keyof T]?: undefined };

/** Flat K matrix input - fx/fy both required or both omitted */
export type CameraIntrinsics = AllOrNothing<Pick<KMatrix, "fx" | "fy">> &
  Pick<KMatrix, "cx" | "cy" | "alpha">;

/** Flat D vector input - all required or all omitted */
export type FisheyeDistortionCoeffs = AllOrNothing<DVector>;

/** Flat size input - both required or both omitted */
export type OutputSize = AllOrNothing<ImageSize>;

/** Flat options for user-facing API */
export type FisheyeOptionsStrict = CameraIntrinsics &
  FisheyeDistortionCoeffs &
  OutputSize & {
    balance?: number;
    fovScale?: number;
    projection?: FisheyeProjection;
  };

// ─── Config (normalized, grouped style) ─────────────────────────────────────

/** Normalized configuration with grouped K, D, size. */
export interface FisheyeConfig {
  K?: KMatrix;
  D: DVector;
  size: ImageSize;
  balance: number;
  fovScale: number;
  projection: FisheyeProjection;
}

export type FisheyeConfigUpdate = Partial<FisheyeConfig>;

/** Union of flat options and grouped config for API flexibility. */
export type FisheyeOptions = FisheyeOptionsStrict | FisheyeConfig;

// ─── Factory Functions ──────────────────────────────────────────────────────

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
