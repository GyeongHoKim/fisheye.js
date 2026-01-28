import { describe, expect, it } from "vitest";
import {
  calculateYUVDataSize,
  convertRGBAtoYUV,
  createVideoFrameFromYUV,
  type YUVFormat,
} from "./utils";

describe("calculateYUVDataSize", () => {
  it("should calculate size for I420 format", () => {
    // I420: Y (width*height) + U (width/2 * height/2) + V (width/2 * height/2)
    // = width*height + width*height/4 + width*height/4 = width*height * 1.5
    expect(calculateYUVDataSize("I420", 1920, 1080)).toBe(1920 * 1080 * 1.5);
    expect(calculateYUVDataSize("I420", 640, 480)).toBe(640 * 480 * 1.5);
    expect(calculateYUVDataSize("I420", 100, 100)).toBe(100 * 100 * 1.5);
  });

  it("should calculate size for NV12 format", () => {
    // NV12: Same as I420 (4:2:0)
    expect(calculateYUVDataSize("NV12", 1920, 1080)).toBe(1920 * 1080 * 1.5);
    expect(calculateYUVDataSize("NV12", 640, 480)).toBe(640 * 480 * 1.5);
  });

  it("should calculate size for I420A format", () => {
    // I420A: Y + U + V + Alpha = width*height + width*height/4 + width*height/4 + width*height
    // = width*height * 2.5
    expect(calculateYUVDataSize("I420A", 1920, 1080)).toBe(1920 * 1080 * 2.5);
    expect(calculateYUVDataSize("I420A", 640, 480)).toBe(640 * 480 * 2.5);
  });

  it("should calculate size for I422 format", () => {
    // I422: Y (width*height) + U (width/2 * height) + V (width/2 * height)
    // = width*height * 2
    expect(calculateYUVDataSize("I422", 1920, 1080)).toBe(1920 * 1080 * 2);
    expect(calculateYUVDataSize("I422", 640, 480)).toBe(640 * 480 * 2);
  });

  it("should calculate size for I444 format", () => {
    // I444: Y + U + V (all full resolution) = width*height * 3
    expect(calculateYUVDataSize("I444", 1920, 1080)).toBe(1920 * 1080 * 3);
    expect(calculateYUVDataSize("I444", 640, 480)).toBe(640 * 480 * 3);
  });

  it("should handle edge cases with small dimensions", () => {
    expect(calculateYUVDataSize("I420", 1, 1)).toBe(1.5);
    expect(calculateYUVDataSize("I420", 2, 2)).toBe(6);
    expect(calculateYUVDataSize("I422", 1, 1)).toBe(2);
    expect(calculateYUVDataSize("I444", 1, 1)).toBe(3);
  });

  it("should return integer size for even dimensions", () => {
    expect(calculateYUVDataSize("I420", 2, 2)).toBe(6);
    expect(calculateYUVDataSize("I420", 4, 4)).toBe(24);
    expect(calculateYUVDataSize("I420", 100, 100)).toBe(15000);
  });

  it("should handle odd dimensions correctly", () => {
    // Odd dimensions should still calculate correctly
    expect(calculateYUVDataSize("I420", 3, 3)).toBe(3 * 3 * 1.5);
    expect(calculateYUVDataSize("I420", 5, 7)).toBe(5 * 7 * 1.5);
  });

  it("should throw error for unsupported format", () => {
    expect(() => {
      calculateYUVDataSize("INVALID" as YUVFormat, 100, 100);
    }).toThrow("Unsupported YUV format: INVALID");
  });
});

describe("convertRGBAtoYUV", () => {
  it("should convert pure black RGBA to YUV", () => {
    const width = 2;
    const height = 2;
    // Pure black: R=0, G=0, B=0
    const rgbaData = new Uint8ClampedArray([
      0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
    ]);

    const yuvData = convertRGBAtoYUV(rgbaData, width, height, "I420");

    // Y should be 0 (black)
    expect(yuvData[0]).toBe(0);
    expect(yuvData[1]).toBe(0);
    expect(yuvData[2]).toBe(0);
    expect(yuvData[3]).toBe(0);

    // U and V should be around 128 (neutral)
    const chromaSize = (width / 2) * (height / 2);
    const uStart = width * height;
    const vStart = uStart + chromaSize;
    expect(yuvData[uStart]).toBe(128);
    expect(yuvData[vStart]).toBe(128);
  });

  it("should convert pure white RGBA to YUV", () => {
    const width = 2;
    const height = 2;
    // Pure white: R=255, G=255, B=255
    const rgbaData = new Uint8ClampedArray([
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    ]);

    const yuvData = convertRGBAtoYUV(rgbaData, width, height, "I420");

    // Y should be 255 (white)
    expect(yuvData[0]).toBe(255);
    expect(yuvData[1]).toBe(255);
    expect(yuvData[2]).toBe(255);
    expect(yuvData[3]).toBe(255);

    // U and V should be around 128 (neutral for white)
    const chromaSize = (width / 2) * (height / 2);
    const uStart = width * height;
    const vStart = uStart + chromaSize;
    expect(yuvData[uStart]).toBe(128);
    expect(yuvData[vStart]).toBe(128);
  });

  it("should convert red RGBA to YUV", () => {
    const width = 2;
    const height = 2;
    // Pure red: R=255, G=0, B=0
    const rgbaData = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
    ]);

    const yuvData = convertRGBAtoYUV(rgbaData, width, height, "I420");

    // Y = 0.299*255 + 0.587*0 + 0.114*0 ≈ 76
    const expectedY = Math.round(0.299 * 255);
    expect(yuvData[0]).toBe(expectedY);
    expect(yuvData[1]).toBe(expectedY);
    expect(yuvData[2]).toBe(expectedY);
    expect(yuvData[3]).toBe(expectedY);
  });

  it("should convert green RGBA to YUV", () => {
    const width = 2;
    const height = 2;
    // Pure green: R=0, G=255, B=0
    const rgbaData = new Uint8ClampedArray([
      0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
    ]);

    const yuvData = convertRGBAtoYUV(rgbaData, width, height, "I420");

    // Y = 0.299*0 + 0.587*255 + 0.114*0 ≈ 150
    const expectedY = Math.round(0.587 * 255);
    expect(yuvData[0]).toBe(expectedY);
    expect(yuvData[1]).toBe(expectedY);
    expect(yuvData[2]).toBe(expectedY);
    expect(yuvData[3]).toBe(expectedY);
  });

  it("should convert blue RGBA to YUV", () => {
    const width = 2;
    const height = 2;
    // Pure blue: R=0, G=0, B=255
    const rgbaData = new Uint8ClampedArray([
      0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255,
    ]);

    const yuvData = convertRGBAtoYUV(rgbaData, width, height, "I420");

    // Y = 0.299*0 + 0.587*0 + 0.114*255 ≈ 29
    const expectedY = Math.round(0.114 * 255);
    expect(yuvData[0]).toBe(expectedY);
    expect(yuvData[1]).toBe(expectedY);
    expect(yuvData[2]).toBe(expectedY);
    expect(yuvData[3]).toBe(expectedY);
  });

  it("should downsample chroma correctly for I420", () => {
    const width = 4;
    const height = 4;
    // Create a pattern where top-left 2x2 is red, rest is black
    const rgbaData = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const idx = (y * width + x) * 4;
        rgbaData[idx] = 255; // R
        rgbaData[idx + 1] = 0; // G
        rgbaData[idx + 2] = 0; // B
        rgbaData[idx + 3] = 255; // A
      }
    }

    const yuvData = convertRGBAtoYUV(rgbaData, width, height, "I420");

    // Chroma should be averaged from the 2x2 block
    const uStart = width * height;

    // First chroma sample should be average of top-left 2x2 red block
    // U = -0.169*255 - 0.331*0 + 0.5*0 + 128 ≈ 85
    const expectedU = Math.round(-0.169 * 255 + 128);
    expect(yuvData[uStart]).toBe(expectedU);
  });

  it("should handle different image sizes", () => {
    const sizes = [
      [2, 2],
      [10, 10],
      [100, 100],
      [1920, 1080],
    ];

    for (const [width, height] of sizes) {
      const rgbaData = new Uint8ClampedArray(width * height * 4);
      // Fill with a simple pattern
      for (let i = 0; i < width * height; i++) {
        rgbaData[i * 4] = 128; // R
        rgbaData[i * 4 + 1] = 128; // G
        rgbaData[i * 4 + 2] = 128; // B
        rgbaData[i * 4 + 3] = 255; // A
      }

      const yuvData = convertRGBAtoYUV(rgbaData, width, height, "I420");
      const expectedSize = calculateYUVDataSize("I420", width, height);
      // expectedSize can be fractional, but array length must be integer
      expect(yuvData.length).toBe(Math.ceil(expectedSize));
    }
  });

  it("should throw error for unsupported format", () => {
    const rgbaData = new Uint8ClampedArray([255, 0, 0, 255]);
    expect(() => {
      convertRGBAtoYUV(rgbaData, 1, 1, "I422" as YUVFormat);
    }).toThrow("Unsupported format: I422. Only I420 is currently supported.");
  });

  it("should clamp YUV values to valid range [0, 255]", () => {
    const width = 2;
    const height = 2;
    // Test with extreme values
    const rgbaData = new Uint8ClampedArray([
      255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255,
    ]);

    const yuvData = convertRGBAtoYUV(rgbaData, width, height, "I420");

    // All values should be in [0, 255] range
    for (let i = 0; i < yuvData.length; i++) {
      expect(yuvData[i]).toBeGreaterThanOrEqual(0);
      expect(yuvData[i]).toBeLessThanOrEqual(255);
    }
  });
});

describe("createVideoFrameFromYUV", () => {
  it("should create VideoFrame from I420 data", () => {
    const width = 100;
    const height = 100;
    const size = calculateYUVDataSize("I420", width, height);
    const yuvData = new Uint8Array(size);

    const frame = createVideoFrameFromYUV(yuvData, {
      format: "I420",
      width,
      height,
      timestamp: 0,
    });

    expect(frame).toBeInstanceOf(VideoFrame);
    expect(frame.codedWidth).toBe(width);
    expect(frame.codedHeight).toBe(height);
    expect(frame.timestamp).toBe(0);
    frame.close();
  });

  it("should create VideoFrame from NV12 data", () => {
    const width = 100;
    const height = 100;
    const size = calculateYUVDataSize("NV12", width, height);
    const yuvData = new Uint8Array(size);

    const frame = createVideoFrameFromYUV(yuvData, {
      format: "NV12",
      width,
      height,
      timestamp: 1000,
    });

    expect(frame).toBeInstanceOf(VideoFrame);
    expect(frame.codedWidth).toBe(width);
    expect(frame.codedHeight).toBe(height);
    expect(frame.timestamp).toBe(1000);
    frame.close();
  });

  it("should create VideoFrame from I420A data", () => {
    const width = 100;
    const height = 100;
    const size = calculateYUVDataSize("I420A", width, height);
    const yuvData = new Uint8Array(size);

    const frame = createVideoFrameFromYUV(yuvData, {
      format: "I420A",
      width,
      height,
      timestamp: 0,
    });

    expect(frame).toBeInstanceOf(VideoFrame);
    frame.close();
  });

  it("should create VideoFrame from I422 data", () => {
    const width = 100;
    const height = 100;
    const size = calculateYUVDataSize("I422", width, height);
    const yuvData = new Uint8Array(size);

    const frame = createVideoFrameFromYUV(yuvData, {
      format: "I422",
      width,
      height,
      timestamp: 0,
    });

    expect(frame).toBeInstanceOf(VideoFrame);
    frame.close();
  });

  it("should create VideoFrame from I444 data", () => {
    const width = 100;
    const height = 100;
    const size = calculateYUVDataSize("I444", width, height);
    const yuvData = new Uint8Array(size);

    const frame = createVideoFrameFromYUV(yuvData, {
      format: "I444",
      width,
      height,
      timestamp: 0,
    });

    expect(frame).toBeInstanceOf(VideoFrame);
    frame.close();
  });

  it("should support optional duration parameter", () => {
    const width = 100;
    const height = 100;
    const size = calculateYUVDataSize("I420", width, height);
    const yuvData = new Uint8Array(size);

    const frame = createVideoFrameFromYUV(yuvData, {
      format: "I420",
      width,
      height,
      timestamp: 0,
      duration: 33333, // ~30fps
    });

    expect(frame.duration).toBe(33333);
    frame.close();
  });

  it("should support optional displayWidth and displayHeight", () => {
    const width = 100;
    const height = 100;
    const size = calculateYUVDataSize("I420", width, height);
    const yuvData = new Uint8Array(size);

    const frame = createVideoFrameFromYUV(yuvData, {
      format: "I420",
      width,
      height,
      timestamp: 0,
      displayWidth: 200,
      displayHeight: 200,
    });

    expect(frame.displayWidth).toBe(200);
    expect(frame.displayHeight).toBe(200);
    frame.close();
  });

  it("should support optional colorSpace", () => {
    const width = 100;
    const height = 100;
    const size = calculateYUVDataSize("I420", width, height);
    const yuvData = new Uint8Array(size);

    const frame = createVideoFrameFromYUV(yuvData, {
      format: "I420",
      width,
      height,
      timestamp: 0,
      colorSpace: {
        primaries: "bt709",
        transfer: "bt709",
        matrix: "bt709",
      },
    });

    expect(frame.colorSpace).toBeDefined();
    frame.close();
  });

  it("should support ArrayBuffer input", () => {
    const width = 100;
    const height = 100;
    const size = calculateYUVDataSize("I420", width, height);
    const buffer = new ArrayBuffer(size);

    const frame = createVideoFrameFromYUV(buffer, {
      format: "I420",
      width,
      height,
      timestamp: 0,
    });

    expect(frame).toBeInstanceOf(VideoFrame);
    frame.close();
  });

  it("should support DataView input", () => {
    const width = 100;
    const height = 100;
    const size = calculateYUVDataSize("I420", width, height);
    const buffer = new ArrayBuffer(size);
    const dataView = new DataView(buffer);

    const frame = createVideoFrameFromYUV(dataView, {
      format: "I420",
      width,
      height,
      timestamp: 0,
    });

    expect(frame).toBeInstanceOf(VideoFrame);
    frame.close();
  });

  it("should throw error for invalid dimensions", () => {
    const size = calculateYUVDataSize("I420", 100, 100);
    const yuvData = new Uint8Array(size);

    expect(() => {
      createVideoFrameFromYUV(yuvData, {
        format: "I420",
        width: 0,
        height: 100,
        timestamp: 0,
      });
    }).toThrow("Width and height must be positive integers");

    expect(() => {
      createVideoFrameFromYUV(yuvData, {
        format: "I420",
        width: 100,
        height: -1,
        timestamp: 0,
      });
    }).toThrow("Width and height must be positive integers");
  });

  it("should throw error for buffer too small", () => {
    const width = 100;
    const height = 100;
    const expectedSize = calculateYUVDataSize("I420", width, height);
    const yuvData = new Uint8Array(expectedSize - 1); // Too small

    expect(() => {
      createVideoFrameFromYUV(yuvData, {
        format: "I420",
        width,
        height,
        timestamp: 0,
      });
    }).toThrow(
      `Buffer too small for I420 format. Expected at least ${expectedSize} bytes, got ${expectedSize - 1} bytes`,
    );
  });

  it("should handle transfer option", () => {
    const width = 100;
    const height = 100;
    const size = calculateYUVDataSize("I420", width, height);
    const buffer = new ArrayBuffer(size);

    const frame = createVideoFrameFromYUV(buffer, {
      format: "I420",
      width,
      height,
      timestamp: 0,
      transfer: true,
    });

    expect(frame).toBeInstanceOf(VideoFrame);
    frame.close();
  });

  it("should handle edge cases with small dimensions", () => {
    const sizes = [
      [2, 2],
      [10, 10],
    ];

    for (const [width, height] of sizes) {
      const size = calculateYUVDataSize("I420", width, height);
      const yuvData = new Uint8Array(Math.ceil(size));

      const frame = createVideoFrameFromYUV(yuvData, {
        format: "I420",
        width,
        height,
        timestamp: 0,
      });

      expect(frame.codedWidth).toBe(width);
      expect(frame.codedHeight).toBe(height);
      frame.close();
    }
  });
});
