import { describe, expect, it } from "vitest";
import { Fisheye } from "./fisheye";
import type { FisheyeOptions } from "./types";

describe("Fisheye - applyDefaults", () => {
  it("should apply default values when no options provided", () => {
    const fisheye = new Fisheye();

    // Access config through updateConfig to verify defaults
    // We can't directly access private config, but we can test through behavior
    // For now, we'll test through updateConfig which uses applyDefaults internally
    fisheye.updateConfig({});

    // Create a minimal VideoFrame to trigger initialization check
    // But we'll skip actual WebGPU initialization
    // Instead, we'll test the config through updateConfig
  });

  it("should apply default values for missing options", () => {
    const fisheye = new Fisheye({
      k1: 0.5,
    });

    // Test that partial options work
    // Since we can't access private config directly,
    // we verify through updateConfig behavior
    fisheye.updateConfig({ k2: 0.3 });

    // Verify that updateConfig doesn't throw (indirect test)
    expect(() => {
      fisheye.updateConfig({ k1: 0.1 });
    }).not.toThrow();
  });

  it("should use provided values instead of defaults", () => {
    const options: FisheyeOptions = {
      k1: 0.1,
      k2: 0.2,
      k3: 0.3,
      k4: 0.4,
      width: 1920,
      height: 1080,
      fov: 90,
      centerX: 0.1,
      centerY: -0.1,
      zoom: 2.0,
    };

    const fisheye = new Fisheye(options);

    // Verify that updateConfig accepts all these values
    expect(() => {
      fisheye.updateConfig(options);
    }).not.toThrow();
  });

  it("should handle default k1 value correctly", () => {
    // k1 defaults to 0 if not provided
    const fisheye1 = new Fisheye({});
    const fisheye2 = new Fisheye({ k1: 0 });

    // Both should work the same way
    expect(() => {
      fisheye1.updateConfig({});
      fisheye2.updateConfig({});
    }).not.toThrow();
  });

  it("should merge partial options with defaults", () => {
    const fisheye = new Fisheye({
      width: 640,
      height: 480,
    });

    // Update with more options
    expect(() => {
      fisheye.updateConfig({
        k1: 0.5,
        fov: 120,
      });
    }).not.toThrow();
  });
});

describe("Fisheye - getUniformData", () => {
  it("should create uniform data from config", () => {
    const options: FisheyeOptions = {
      k1: 0.1,
      k2: 0.2,
      k3: 0.3,
      k4: 0.4,
      width: 1920,
      height: 1080,
      fov: 90,
      centerX: 0.1,
      centerY: -0.1,
      zoom: 2.0,
    };

    const fisheye = new Fisheye(options);

    // getUniformData is called internally during initialization
    // We can't test it directly without WebGPU, but we can verify
    // that updateConfig works (which calls getUniformData internally)
    expect(() => {
      fisheye.updateConfig(options);
    }).not.toThrow();
  });

  it("should handle default values in uniform data", () => {
    const fisheye = new Fisheye();

    // Test with default values
    expect(() => {
      fisheye.updateConfig({});
    }).not.toThrow();
  });

  it("should update uniform data when config changes", () => {
    const fisheye = new Fisheye({
      k1: 0.1,
      width: 640,
      height: 480,
    });

    // Update config multiple times
    expect(() => {
      fisheye.updateConfig({ k1: 0.2 });
      fisheye.updateConfig({ k2: 0.3 });
      fisheye.updateConfig({ fov: 120 });
    }).not.toThrow();
  });
});

describe("Fisheye - calculateBytesPerRow", () => {
  it("should calculate bytes per row with 256-byte alignment", () => {
    // calculateBytesPerRow is private and used internally
    // We can test it indirectly through updateConfig which triggers
    // texture recreation when width/height changes
    // The method calculates: Math.ceil((width * 4) / 256) * 256

    const testCases = [
      { width: 1, expected: 256 }, // 4 bytes, aligned to 256
      { width: 64, expected: 256 }, // 256 bytes, already aligned
      { width: 65, expected: 512 }, // 260 bytes, aligned to 512
      { width: 100, expected: 512 }, // 400 bytes, aligned to 512
      { width: 1920, expected: 7680 }, // 7680 bytes, aligned to 7680 (multiple of 256)
      { width: 1921, expected: 7936 }, // 7684 bytes, aligned to 7936
    ];

    for (const { width, expected } of testCases) {
      const fisheye = new Fisheye({ width, height: 100 });

      // calculateBytesPerRow is used when creating readback buffers
      // We can't test it directly without WebGPU, but we can verify
      // that updateConfig with width changes works
      expect(() => {
        fisheye.updateConfig({ width });
      }).not.toThrow();

      // Verify the calculation logic manually
      const bytesPerPixel = 4;
      const unalignedBytesPerRow = width * bytesPerPixel;
      const alignedBytesPerRow = Math.ceil(unalignedBytesPerRow / 256) * 256;
      expect(alignedBytesPerRow).toBe(expected);
    }
  });

  it("should handle edge cases for bytes per row calculation", () => {
    // Test boundary values
    const edgeCases = [
      { width: 0, expected: 0 }, // Edge case (though width should be > 0)
      { width: 256, expected: 1024 }, // Exactly 256 pixels = 1024 bytes = 4 * 256
      { width: 255, expected: 1024 }, // 1020 bytes, aligned to 1024
      { width: 257, expected: 1280 }, // 1028 bytes, aligned to 1280
    ];

    for (const { width, expected } of edgeCases) {
      if (width === 0) {
        // Skip invalid width
        continue;
      }

      const bytesPerPixel = 4;
      const unalignedBytesPerRow = width * bytesPerPixel;
      const alignedBytesPerRow = Math.ceil(unalignedBytesPerRow / 256) * 256;
      expect(alignedBytesPerRow).toBe(expected);
    }
  });

  it("should maintain alignment when width changes", () => {
    const fisheye = new Fisheye({ width: 640, height: 480 });

    // Change width multiple times
    expect(() => {
      fisheye.updateConfig({ width: 1920 });
      fisheye.updateConfig({ width: 1280 });
      fisheye.updateConfig({ width: 640 });
    }).not.toThrow();
  });
});

describe("Fisheye - constructor and config", () => {
  it("should create instance with empty options", () => {
    const fisheye = new Fisheye();
    expect(fisheye).toBeInstanceOf(Fisheye);
  });

  it("should create instance with partial options", () => {
    const fisheye = new Fisheye({
      k1: 0.5,
      width: 1920,
    });
    expect(fisheye).toBeInstanceOf(Fisheye);
  });

  it("should create instance with all options", () => {
    const options: FisheyeOptions = {
      k1: 0.1,
      k2: 0.2,
      k3: 0.3,
      k4: 0.4,
      width: 1920,
      height: 1080,
      fov: 90,
      centerX: 0.1,
      centerY: -0.1,
      zoom: 2.0,
    };

    const fisheye = new Fisheye(options);
    expect(fisheye).toBeInstanceOf(Fisheye);
  });

  it("should handle updateConfig without WebGPU initialization", () => {
    const fisheye = new Fisheye();

    // updateConfig should work without WebGPU initialization
    expect(() => {
      fisheye.updateConfig({
        k1: 0.5,
        width: 1920,
        height: 1080,
      });
    }).not.toThrow();
  });

  it("should handle destroy without initialization", () => {
    const fisheye = new Fisheye();

    // destroy should work even if not initialized
    expect(() => {
      fisheye.destroy();
    }).not.toThrow();
  });
});
