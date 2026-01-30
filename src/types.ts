/**
 * Output projection mode.
 */
export type FisheyeProjection = "rectilinear" | "equirectangular" | "original";

/**
 * Camera mount position.
 */
export type FisheyeMount = "ceiling" | "wall" | "desk";

/**
 * Fisheye undistortion configuration.
 *
 * Based on OpenCV fisheye camera model (Kannala-Brandt).
 * @see https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
 */
export interface FisheyeOptions {
  /**
   * Camera matrix K: focal length x (pixels).
   * @see https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
   */
  fx?: number;

  /**
   * Camera matrix K: focal length y (pixels).
   * @see https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
   */
  fy?: number;

  /**
   * Camera matrix K: principal point x (pixels).
   * @see https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
   */
  cx?: number;

  /**
   * Camera matrix K: principal point y (pixels).
   * @see https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
   */
  cy?: number;

  /**
   * Distortion coefficient k1 (Kannala-Brandt).
   * @default 0
   * @see https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
   */
  k1?: number;

  /**
   * Distortion coefficient k2 (Kannala-Brandt).
   * @default 0
   * @see https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
   */
  k2?: number;

  /**
   * Distortion coefficient k3 (Kannala-Brandt).
   * @default 0
   * @see https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
   */
  k3?: number;

  /**
   * Distortion coefficient k4 (Kannala-Brandt).
   * @default 0
   * @see https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
   */
  k4?: number;

  /**
   * Output image width (pixels).
   * @default 300
   * @see https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
   */
  width?: number;

  /**
   * Output image height (pixels).
   * @default 150
   * @see https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
   */
  height?: number;

  /**
   * Balance between all pixels vs original FOV (0.0-1.0).
   * @default 0.0
   * @see https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
   */
  balance?: number;

  /**
   * FOV scale divisor (>1.0 = zoom out, <1.0 = zoom in).
   * @default 1.0
   * @see https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
   */
  fovScale?: number;

  /**
   * Output projection mode.
   * @default "rectilinear"
   */
  projection?: FisheyeProjection;

  /**
   * Camera mount position.
   * @default "ceiling"
   */
  mount?: FisheyeMount;
}

/**
 * Internal configuration with all defaults applied.
 *
 * Note: fx, fy, cx, cy are optional because they default to input image dimensions
 * which are not known until undistort() is called.
 */
export interface FisheyeConfig {
  /** Camera matrix K: fx. Defaults to input width if not specified. */
  fx: number | undefined;
  /** Camera matrix K: fy. Defaults to input width if not specified. */
  fy: number | undefined;
  /** Camera matrix K: cx. Defaults to input width / 2 if not specified. */
  cx: number | undefined;
  /** Camera matrix K: cy. Defaults to input height / 2 if not specified. */
  cy: number | undefined;
  /** Distortion coefficient k1. */
  k1: number;
  /** Distortion coefficient k2. */
  k2: number;
  /** Distortion coefficient k3. */
  k3: number;
  /** Distortion coefficient k4. */
  k4: number;
  /** Output width. */
  width: number;
  /** Output height. */
  height: number;
  /** Balance parameter. */
  balance: number;
  /** FOV scale parameter. */
  fovScale: number;
  /** Output projection mode. */
  projection: FisheyeProjection;
  /** Camera mount position. */
  mount: FisheyeMount;
}
