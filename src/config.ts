import { type PreparedOnvifLens, prepareOnvifLens } from "./onvif";
import {
  type FisheyeConfig,
  type FisheyeOptions,
  type FisheyeOptionsStrict,
  type FisheyeProjection,
  type ImageSize,
  type LensModel,
  type LensOptions,
  validateModeExclusivity,
} from "./types";

export interface NormalizedConfig extends FisheyeConfig {
  lens: LensModel;
  onvif?: PreparedOnvifLens;
  horizontalFov: number;
}
type Input = Partial<FisheyeConfig> &
  Partial<Omit<FisheyeOptionsStrict, "ptz" | "pane">> & { lens?: LensModel };
const cameraKeys = ["K", "D", "fx", "fy", "cx", "cy", "alpha", "k1", "k2", "k3", "k4"] as const;
const zeroD = { k1: 0, k2: 0, k3: 0, k4: 0 };

function positive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive and finite`);
}

function resolveLens(o: Input): LensModel {
  if (o.lens && cameraKeys.some((key) => o[key] !== undefined)) {
    throw new Error("Do not mix lens with legacy camera parameters");
  }
  if (o.lens && (o.width !== undefined || o.height !== undefined)) {
    throw new Error("Use size with lens");
  }
  return structuredClone(
    o.lens ?? {
      kind: "opencv",
      K:
        o.K ??
        (o.fx !== undefined && o.fy !== undefined
          ? { fx: o.fx, fy: o.fy, cx: o.cx, cy: o.cy, alpha: o.alpha }
          : undefined),
      D: {
        ...zeroD,
        ...o.D,
        ...Object.fromEntries(
          ["k1", "k2", "k3", "k4"]
            .filter((key) => o[key as keyof Input] !== undefined)
            .map((key) => [key, o[key as keyof Input]]),
        ),
      },
    },
  );
}

function resolveSize(o: Input): ImageSize {
  const size = {
    width: o.size?.width ?? o.width ?? 300,
    height: o.size?.height ?? o.height ?? 150,
  };
  if (Object.values(size).some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error("Output size must contain positive integers");
  }
  return size;
}

function resolveProjection(
  o: Input,
  onvif: PreparedOnvifLens | undefined,
): { projection: FisheyeProjection; horizontalFov: number } {
  const projection = structuredClone(o.projection ?? { kind: "rectilinear" as const });
  if (!["rectilinear", "equirectangular", "cylindrical", "original"].includes(projection.kind)) {
    throw new Error("Unknown projection");
  }
  const horizontalFov = "horizontalFov" in projection ? (projection.horizontalFov ?? 90) : 90;
  if (
    "horizontalFov" in projection &&
    projection.horizontalFov !== undefined &&
    (!onvif || projection.kind !== "rectilinear" || projection.mode === "manual")
  ) {
    throw new Error("horizontalFov is for automatic ONVIF rectilinear output only");
  }
  if (!Number.isFinite(horizontalFov) || horizontalFov <= 0 || horizontalFov >= 180) {
    throw new Error("horizontalFov must be between 0 and 180 degrees");
  }
  if (projection.kind === "rectilinear" && projection.mode === "manual") {
    positive(projection.newFx, "newFx");
    positive(projection.newFy, "newFy");
    if (
      [projection.newCx, projection.newCy].some(
        (value) => value !== undefined && !Number.isFinite(value),
      )
    ) {
      throw new Error("Output center must be finite");
    }
  }
  return { projection, horizontalFov };
}

function validateModes(o: Input): void {
  validateModeExclusivity(o.ptz, o.pane);
  if (o.ptz) {
    if (![o.ptz.pan ?? 0, o.ptz.tilt ?? 0].every(Number.isFinite)) {
      throw new Error("PTZ angles must be finite");
    }
    positive(o.ptz.zoom ?? 1, "zoom");
  }
  if (o.pane && !["2pane", "4pane"].includes(o.pane.kind)) {
    throw new Error("Unknown pane layout");
  }
}

function validateOpenCvLens(lens: Extract<LensModel, { kind: "opencv" }>): void {
  if (lens.K) {
    positive(lens.K.fx, "fx");
    positive(lens.K.fy, "fy");
  }
  const values = [...Object.values(lens.D), ...Object.values(lens.K ?? {})];
  if (values.some((value) => value !== undefined && !Number.isFinite(value))) {
    throw new Error("Camera coefficients must be finite");
  }
  if (!Object.values(lens.D).every(Number.isFinite)) {
    throw new Error("All distortion coefficients are required");
  }
}

/** Normalize once, without retaining mutable caller-owned settings. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The final assembly preserves explicit defaults for both public model variants.
export function normalizeOptions(options: FisheyeOptions | Input = {}): NormalizedConfig {
  const o = options as Input;
  const lens = resolveLens(o);
  if (lens.kind !== "opencv" && lens.kind !== "onvif") throw new Error("Unknown lens model");
  const onvif = lens.kind === "onvif" ? prepareOnvifLens(lens.description) : undefined;
  if (onvif && (o.balance !== undefined || o.fovScale !== undefined)) {
    throw new Error("balance and fovScale are OpenCV-only");
  }
  const size = resolveSize(o);
  const { projection, horizontalFov } = resolveProjection(o, onvif);
  validateModes(o);
  if (lens.kind === "opencv") validateOpenCvLens(lens);
  positive(o.fovScale ?? 1, "fovScale");
  if (!Number.isFinite(o.balance ?? 0)) throw new Error("balance must be finite");
  return {
    lens,
    onvif,
    horizontalFov,
    K: lens.kind === "opencv" ? lens.K : undefined,
    D: lens.kind === "opencv" ? lens.D : { ...zeroD },
    size,
    balance: Math.max(0, Math.min(1, o.balance ?? 0)),
    fovScale: o.fovScale ?? 1,
    projection,
    ptz: o.ptz ? { ...o.ptz } : undefined,
    pane: o.pane ? { ...o.pane } : undefined,
  };
}

/** A lens is replaced as a unit; common options are patched at the top level. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Update semantics intentionally branch by the discriminated lens model.
export function updateOptions(
  current: NormalizedConfig,
  update: Partial<FisheyeOptions>,
): NormalizedConfig {
  const patch = update as Input;
  if (patch.lens) {
    const switching = patch.lens.kind !== current.lens.kind;
    const projection =
      switching &&
      current.projection.kind === "rectilinear" &&
      "horizontalFov" in current.projection
        ? { kind: "rectilinear" as const }
        : current.projection;
    return normalizeOptions({
      size: current.size,
      projection,
      ptz: current.ptz,
      pane: current.pane,
      ...(patch.lens.kind === "opencv" && !switching
        ? { balance: current.balance, fovScale: current.fovScale }
        : {}),
      ...patch,
    });
  }
  if (current.lens.kind === "onvif") {
    return normalizeOptions({
      lens: current.lens,
      size: current.size,
      projection: current.projection,
      ptz: current.ptz,
      pane: current.pane,
      ...patch,
    } as LensOptions);
  }
  return normalizeOptions({
    K: current.K,
    D: current.D,
    size: { width: patch.width ?? current.size.width, height: patch.height ?? current.size.height },
    balance: current.balance,
    fovScale: current.fovScale,
    projection: current.projection,
    ptz: current.ptz,
    pane: current.pane,
    ...patch,
    ...(patch.fx !== undefined ||
    patch.fy !== undefined ||
    patch.cx !== undefined ||
    patch.cy !== undefined ||
    patch.alpha !== undefined
      ? {
          K: {
            fx: patch.fx ?? current.K?.fx ?? current.size.width,
            fy: patch.fy ?? current.K?.fy ?? current.size.width,
            cx: patch.cx ?? current.K?.cx,
            cy: patch.cy ?? current.K?.cy,
            alpha: patch.alpha ?? current.K?.alpha,
          },
        }
      : {}),
  });
}
