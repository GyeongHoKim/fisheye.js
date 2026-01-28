// Setup file for vitest to mock VideoFrame API

// Mock VideoFrame if not available in happy-dom
if (typeof globalThis.VideoFrame === "undefined") {
  globalThis.VideoFrame = class VideoFrame {
    codedWidth: number;
    codedHeight: number;
    displayWidth: number;
    displayHeight: number;
    timestamp: number;
    duration: number | null;
    colorSpace: VideoColorSpace | null;

    constructor(_data: BufferSource, init: VideoFrameBufferInit & { transfer?: ArrayBuffer[] }) {
      this.codedWidth = init.codedWidth;
      this.codedHeight = init.codedHeight;
      this.displayWidth = init.displayWidth ?? init.codedWidth;
      this.displayHeight = init.displayHeight ?? init.codedHeight;
      this.timestamp = init.timestamp;
      this.duration = init.duration ?? null;
      this.colorSpace = init.colorSpace
        ? ({
            primaries: init.colorSpace.primaries,
            transfer: init.colorSpace.transfer,
            matrix: init.colorSpace.matrix,
          } as VideoColorSpace)
        : null;
    }

    close(): void {
      // Mock implementation
    }
  } as typeof VideoFrame;
}
