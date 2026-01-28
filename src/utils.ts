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
 * Convert RGBA image data to YUV format (I420 by default)
 *
 * Uses ITU-R BT.601 color space conversion:
 * - Y = 0.299*R + 0.587*G + 0.114*B
 * - U = -0.169*R - 0.331*G + 0.5*B + 128
 * - V = 0.5*R - 0.419*G - 0.081*B + 128
 *
 * For I420 format:
 * - Y plane: full resolution (width * height)
 * - U plane: quarter resolution ((width/2) * (height/2))
 * - V plane: quarter resolution ((width/2) * (height/2))
 *
 * @param rgbaData - RGBA pixel data (Uint8ClampedArray from ImageData)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param format - YUV format to convert to (default: "I420")
 * @returns YUV data as Uint8Array
 *
 * @example
 * ```ts
 * const canvas = document.createElement('canvas');
 * const ctx = canvas.getContext('2d');
 * ctx.drawImage(image, 0, 0);
 * const imageData = ctx.getImageData(0, 0, width, height);
 * const yuvData = convertRGBAtoYUV(imageData.data, width, height);
 * ```
 */
export function convertRGBAtoYUV(
  rgbaData: Uint8ClampedArray,
  width: number,
  height: number,
  format: YUVFormat = "I420",
): Uint8Array {
  if (format !== "I420") {
    throw new Error(`Unsupported format: ${format}. Only I420 is currently supported.`);
  }

  const lumaSize = width * height;
  const chromaSize = (width / 2) * (height / 2);
  const yuvSize = lumaSize + chromaSize * 2; // Y + U + V
  const yuvData = new Uint8Array(yuvSize);

  // BT.601 coefficients
  const Y_R = 0.299;
  const Y_G = 0.587;
  const Y_B = 0.114;
  const U_R = -0.169;
  const U_G = -0.331;
  const U_B = 0.5;
  const V_R = 0.5;
  const V_G = -0.419;
  const V_B = -0.081;

  // Convert RGB to YUV and downsample chroma for I420
  const yPlane = yuvData.subarray(0, lumaSize);
  const uPlane = yuvData.subarray(lumaSize, lumaSize + chromaSize);
  const vPlane = yuvData.subarray(lumaSize + chromaSize, yuvSize);

  // First pass: convert to YUV and store Y plane
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rgbaIdx = (y * width + x) * 4;
      const r = rgbaData[rgbaIdx];
      const g = rgbaData[rgbaIdx + 1];
      const b = rgbaData[rgbaIdx + 2];

      // Calculate Y (luma)
      const yVal = Y_R * r + Y_G * g + Y_B * b;
      yPlane[y * width + x] = Math.round(Math.max(0, Math.min(255, yVal)));

      // Calculate U and V for chroma downsampling
      // We'll accumulate these in the second pass
    }
  }

  // Second pass: downsample U and V planes (average 2x2 blocks)
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width / 2; x++) {
      // Sample 2x2 block from original image
      let uSum = 0;
      let vSum = 0;

      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const srcX = x * 2 + dx;
          const srcY = y * 2 + dy;
          const rgbaIdx = (srcY * width + srcX) * 4;
          const r = rgbaData[rgbaIdx];
          const g = rgbaData[rgbaIdx + 1];
          const b = rgbaData[rgbaIdx + 2];

          // Calculate U and V
          const uVal = U_R * r + U_G * g + U_B * b + 128;
          const vVal = V_R * r + V_G * g + V_B * b + 128;

          uSum += uVal;
          vSum += vVal;
        }
      }

      // Average the 2x2 block
      const uAvg = uSum / 4;
      const vAvg = vSum / 4;

      const chromaIdx = y * (width / 2) + x;
      uPlane[chromaIdx] = Math.round(Math.max(0, Math.min(255, uAvg)));
      vPlane[chromaIdx] = Math.round(Math.max(0, Math.min(255, vAvg)));
    }
  }

  return yuvData;
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
