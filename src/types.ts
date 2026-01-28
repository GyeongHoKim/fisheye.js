/**
 * Options for configuring the Fisheye dewarper
 */
export interface FisheyeOptions {
  /**
   * Distortion coefficient (k1) for the fisheye lens
   * Typical range: -1.0 to 1.0
   * - Positive values: barrel distortion (fisheye effect)
   * - Negative values: pincushion distortion
   * - 0: no distortion
   */
  distortion?: number;

  /**
   * Canvas width for output
   * @default 640
   */
  width?: number;

  /**
   * Canvas height for output
   * @default 480
   */
  height?: number;

  /**
   * Field of view in degrees
   * @default 180
   */
  fov?: number;

  /**
   * X offset of the lens center (normalized, -1.0 to 1.0)
   * @default 0
   */
  centerX?: number;

  /**
   * Y offset of the lens center (normalized, -1.0 to 1.0)
   * @default 0
   */
  centerY?: number;

  /**
   * Zoom factor
   * @default 1.0
   */
  zoom?: number;
}

/**
 * Internal configuration after applying defaults
 */
export interface FisheyeConfig extends Required<FisheyeOptions> {}
