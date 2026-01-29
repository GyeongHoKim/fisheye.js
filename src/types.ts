/**
 * How the corrected ray directions are mapped to the output image.
 *
 * - **rectilinear**: Standard perspective (like a normal camera). Straight lines in the
 *   scene stay straight; the center is natural, edges are compressed. With wide FOV (e.g.
 *   180°) the edges look very squished. One "window" view.
 *
 * - **equirectangular**: Horizontal axis = azimuth (longitude), vertical = elevation
 *   (latitude). The full horizontal span (e.g. 180°) maps linearly to the width, so you
 *   get a wide panoramic strip: left = one side, right = the other. Classic panorama look.
 *
 * Commercial equivalents:
 * - "Panoramic 180" / "180° Panorama" → equirectangular with 180° horizontal.
 * - "Panoramic" / "360° Panorama" → equirectangular with 360° horizontal (ceiling mount).
 * - "Normal" / "PTZ view" / single window → rectilinear (often with ~90° FOV per pane).
 * - "Panoramic with 4 panes" / "Quad" → layout of four rectilinear ~90° views, not one projection.
 */
export type FisheyeProjection = "rectilinear" | "equirectangular";

/**
 * Camera mount position. Affects which view range is meaningful (e.g. ceiling → 360° azimuth).
 * Used for defaults or validation when combined with projection.
 */
export type FisheyeMount = "ceiling" | "wall" | "desk";

/**
 * **Presets for UI:** Combine `mount` + `projection` (+ `fov`) and expose them to end users
 * as preset names instead of raw options. Example mapping:
 *
 * | User-facing name        | mount   | projection     | fov                  |
 * |-------------------------|---------|----------------|----------------------|
 * | Panoramic 180           | any     | equirectangular| 180                  |
 * | 360° Panorama           | ceiling | equirectangular| 360                  |
 * | Normal / PTZ view       | any     | rectilinear    | e.g. 90              |
 * | Quad (4 panes)          | ceiling | rectilinear ×4 | 90 per pane (layout) |
 *
 * The library does not define preset names; the app chooses labels and maps them to
 * `FisheyeOptions` (and, for Quad, to multiple Fisheye instances or a layout pipeline).
 */

/**
 * Options for configuring the Fisheye dewarper
 */
export interface FisheyeOptions {
  /**
   * Fisheye distortion coefficient k1 (OpenCV fisheye / Kannala–Brandt).
   * From calibration; omit or 0 for ideal equidistant.
   * @default 0
   */
  k1?: number;

  /**
   * Fisheye distortion coefficient k2.
   * @default 0
   */
  k2?: number;

  /**
   * Fisheye distortion coefficient k3.
   * @default 0
   */
  k3?: number;

  /**
   * Fisheye distortion coefficient k4.
   * @default 0
   */
  k4?: number;

  /**
   * Output image width in pixels.
   * @default 300
   */
  width?: number;

  /**
   * Output image height in pixels.
   * @default 150
   */
  height?: number;

  /**
   * Field of view in degrees.
   * For rectilinear: angular diameter of the output. For equirectangular: horizontal span.
   * @default 180
   */
  fov?: number;

  /**
   * Projection used to map corrected angles to output pixels.
   * @default "rectilinear"
   */
  projection?: FisheyeProjection;

  /**
   * Camera mount position. Optional; can affect default FOV or valid range when projection is equirectangular.
   * @default "ceiling"
   */
  mount?: FisheyeMount;

  /**
   * X offset of the lens center (normalized, -1.0 to 1.0).
   * @default 0
   */
  centerX?: number;

  /**
   * Y offset of the lens center (normalized, -1.0 to 1.0).
   * @default 0
   */
  centerY?: number;

  /**
   * Zoom factor applied after distortion correction.
   * @default 1.0
   */
  zoom?: number;
}

/**
 * Internal configuration after applying defaults
 */
export interface FisheyeConfig extends Required<FisheyeOptions> {}
