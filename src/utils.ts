/**
 * Supported YUV pixel formats for VideoFrame creation
 */
export type YUVFormat = "I420" | "I420A" | "I422" | "I444" | "NV12";

/**
 * Extended VideoFrameBufferInit with transfer support
 * (transfer is part of the spec but may not be in all TypeScript definitions)
 */
interface VideoFrameBufferInitExtended extends VideoFrameBufferInit {
  transfer?: ArrayBuffer[];
}

/**
 * Options for creating a VideoFrame from YUV data
 */
export interface CreateVideoFrameOptions {
  /**
   * YUV pixel format
   * - I420: YUV 4:2:0 planar (Y plane, U plane, V plane)
   * - I420A: YUV 4:2:0 planar with alpha
   * - I422: YUV 4:2:2 planar
   * - I444: YUV 4:4:4 planar
   * - NV12: YUV 4:2:0 semi-planar (Y plane, interleaved UV plane)
   */
  format: YUVFormat;

  /**
   * Width of the video frame in pixels
   */
  width: number;

  /**
   * Height of the video frame in pixels
   */
  height: number;

  /**
   * Timestamp in microseconds
   */
  timestamp: number;

  /**
   * Duration in microseconds (optional)
   */
  duration?: number;

  /**
   * Display width (optional, defaults to width)
   */
  displayWidth?: number;

  /**
   * Display height (optional, defaults to height)
   */
  displayHeight?: number;

  /**
   * Color space configuration (optional)
   */
  colorSpace?: VideoColorSpaceInit;

  /**
   * Transfer ownership of the buffer for zero-copy (optional)
   * If true, the input buffer will be detached after VideoFrame creation
   */
  transfer?: boolean;
}

/**
 * Create a VideoFrame from YUV binary data
 *
 * @param data - YUV binary data (ArrayBuffer, TypedArray, or DataView)
 * @param options - Configuration options including format, dimensions, and timestamp
 * @returns A new VideoFrame object
 *
 * @example
 * ```ts
 * // Create VideoFrame from I420 (YUV 4:2:0) data
 * const yuvData = new Uint8Array(width * height * 1.5); // I420 size
 * const frame = createVideoFrameFromYUV(yuvData, {
 *   format: "I420",
 *   width: 1920,
 *   height: 1080,
 *   timestamp: 0,
 * });
 * ```
 *
 * @example
 * ```ts
 * // Create VideoFrame from NV12 data with zero-copy transfer
 * const nv12Data = new Uint8Array(width * height * 1.5);
 * const frame = createVideoFrameFromYUV(nv12Data, {
 *   format: "NV12",
 *   width: 1920,
 *   height: 1080,
 *   timestamp: 0,
 *   transfer: true, // Transfer buffer ownership for better performance
 * });
 * ```
 */
export function createVideoFrameFromYUV(
  data: BufferSource,
  options: CreateVideoFrameOptions,
): VideoFrame {
  const {
    format,
    width,
    height,
    timestamp,
    duration,
    displayWidth,
    displayHeight,
    colorSpace,
    transfer,
  } = options;

  // Validate dimensions
  if (width <= 0 || height <= 0) {
    throw new Error("Width and height must be positive integers");
  }

  // Calculate expected data size based on format
  const expectedSize = calculateYUVDataSize(format, width, height);
  const actualSize = data instanceof ArrayBuffer ? data.byteLength : data.byteLength;

  if (actualSize < expectedSize) {
    throw new Error(
      `Buffer too small for ${format} format. Expected at least ${expectedSize} bytes, got ${actualSize} bytes`,
    );
  }

  // Build VideoFrame init options
  const init: VideoFrameBufferInitExtended = {
    format,
    codedWidth: width,
    codedHeight: height,
    timestamp,
  };

  if (duration !== undefined) {
    init.duration = duration;
  }

  if (displayWidth !== undefined) {
    init.displayWidth = displayWidth;
  }

  if (displayHeight !== undefined) {
    init.displayHeight = displayHeight;
  }

  if (colorSpace !== undefined) {
    init.colorSpace = colorSpace;
  }

  // Handle buffer transfer for zero-copy
  if (transfer) {
    const buffer = data instanceof ArrayBuffer ? data : data.buffer;
    init.transfer = [buffer];
  }

  return new VideoFrame(data, init);
}

/**
 * Calculate the expected byte size for YUV data based on format and dimensions
 *
 * @param format - YUV pixel format
 * @param width - Frame width in pixels
 * @param height - Frame height in pixels
 * @returns Expected byte size
 */
export function calculateYUVDataSize(format: YUVFormat, width: number, height: number): number {
  const lumaSize = width * height;

  switch (format) {
    case "I420":
    case "NV12":
      // 4:2:0 - chroma is half resolution in both dimensions
      // Y: width * height, U: (width/2) * (height/2), V: (width/2) * (height/2)
      return lumaSize + lumaSize / 2;

    case "I420A":
      // 4:2:0 with alpha
      // Y: width * height, U: (width/2) * (height/2), V: (width/2) * (height/2), A: width * height
      return lumaSize * 2 + lumaSize / 2;

    case "I422":
      // 4:2:2 - chroma is half resolution horizontally only
      // Y: width * height, U: (width/2) * height, V: (width/2) * height
      return lumaSize * 2;

    case "I444":
      // 4:4:4 - full resolution for all planes
      // Y: width * height, U: width * height, V: width * height
      return lumaSize * 3;

    default:
      throw new Error(`Unsupported YUV format: ${format}`);
  }
}
