# fisheye.js

DEMO: https://gyeonghokim.github.io/fisheye.js/

> Modern fisheye dewarping library for the web using **WebGPU** (general-purpose GPU compute)

fisheye.js processes [VideoFrame](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame)s with **WebGPU compute shaders**—no canvas 2D—and corrects fisheye lens distortion using the **OpenCV fisheye model** (Kannala–Brandt–style polynomial in angle θ with coefficients k1–k4). This is the same model as in [OpenCV’s fisheye module](https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html), not UCM (Unified Camera Model) or a simple radial model.

## Learning Docs

See the full educational curriculum in `doc/index.md`.

## Features

- **WebGPU GPGPU**: Compute-shader pipeline via [TypeGPU](https://www.npmjs.com/package/typegpu); input/output as textures and readback to VideoFrame—no canvas element for dewarping
- **OpenCV fisheye (Kannala–Brandt) model**: Distortion model `θ_d = θ × (1 + k1·θ² + k2·θ⁴ + k3·θ⁶ + k4·θ⁸)` for accurate calibration
- **WebCodecs**: Built on the [VideoFrame](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame) API
- **ESM**: `import { Fisheye } from "@gyeonghokim/fisheye.js"`
- **npm**: Install via npm or other package managers

## Getting Started(Typescript Example)

```bash
npm install @gyeonghokim/fisheye.js
# optional
npm install --save-dev @webgpu/types
```

if you installed `@webgpu/types`,

```json
{
  "compilerOptions": {
    "types": ["@webgpu/types"]
  }
}
```

> Why should I install webgpu types?
> This library does not render your binary, it just dewarp the VideoFrame.
> You should make **your own YUV renderer**, or you can install `@gyeonghokim/yuv-player`.

in your code,

```ts
import { Fisheye } from "@gyeonghokim/fisheye.js";

const dewarper = new Fisheye({
  k1: 0.5,
  k2: 0.0,
  k3: 0.0,
  k4: 0.0,
  width: 1920,
  height: 1080,
  fov: 180, // Field of view in degrees
  centerX: 0, // X offset of lens center (-1.0 to 1.0)
  centerY: 0, // Y offset of lens center (-1.0 to 1.0)
  zoom: 1.0, // Zoom factor
});

const renderLoop = (timestamp: DOMHighResTimestamp) => {
  // your render logic
  const dewarpedVideoFrame: VideoFrame = await dewarper.dewarp(yourVideoFrame);
  yourYUVPlayer.draw(dewarpedVideoFrame);
  requestAnimationFrame(renderLoop);
};
```

## API

### `new Fisheye(options?: FisheyeOptions)`

Creates a new Fisheye dewarper instance.

**Options:**

- `k1` (number, optional): Fisheye distortion coefficient k1. Typical range: -1.0 to 1.0. Default: `0`.
- `k2` (number, optional): Fisheye distortion coefficient k2. Default: `0`.
- `k3` (number, optional): Fisheye distortion coefficient k3. Default: `0`.
- `k4` (number, optional): Fisheye distortion coefficient k4. Default: `0`.
- `width` (number, optional): Output frame width. Default: `300`
- `height` (number, optional): Output frame height. Default: `150`
- `fov` (number, optional): Field of view in degrees. Default: `180`
- `centerX` (number, optional): X offset of the lens center (normalized, -1.0 to 1.0). Default: `0`
- `centerY` (number, optional): Y offset of the lens center (normalized, -1.0 to 1.0). Default: `0`
- `zoom` (number, optional): Zoom factor. Default: `1.0`

**Fisheye model (OpenCV fisheye / Kannala–Brandt):**
We use the same model as OpenCV’s [fisheye module](https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html) (cited there as the “generic camera model” from Kannala & Brandt, 2006). It is a polynomial-in-θ model, not UCM:

```
theta = atan(r)
theta_d = theta * (1 + k1*theta^2 + k2*theta^4 + k3*theta^6 + k4*theta^8)
r_d = tan(theta_d)
```

### `dewarp(frame: VideoFrame): Promise<VideoFrame>`

Dewarps a VideoFrame with fisheye distortion.

**Parameters:**

- `frame`: Input VideoFrame with fisheye distortion

**Returns:** Promise that resolves to a dewarped VideoFrame

### `updateConfig(options: Partial<FisheyeOptions>): void`

Updates the dewarper configuration. You can update any subset of the original options.

### `destroy(): void`

Cleans up GPU resources. Call this when you're done using the dewarper.

## Working with YUV Binary Data

If you receive raw YUV binary data from a camera or server, you can use the `createVideoFrameFromYUV` utility to create a VideoFrame:

```ts
import { Fisheye, createVideoFrameFromYUV } from "@gyeonghokim/fisheye.js";

const dewarper = new Fisheye({ k1: 0.5, width: 1920, height: 1080 });

// Example: Receiving NV12 data from a server
const response = await fetch("/api/camera/frame");
const yuvBuffer = await response.arrayBuffer();

const frame = createVideoFrameFromYUV(new Uint8Array(yuvBuffer), {
  format: "NV12",  // YUV format
  width: 1920,
  height: 1080,
  timestamp: performance.now() * 1000,  // microseconds
});

const dewarpedFrame = await dewarper.dewarp(frame);
frame.close();  // Don't forget to close the original frame
```

### `createVideoFrameFromYUV(data, options)`

Creates a VideoFrame from YUV binary data.

**Parameters:**

- `data`: YUV binary data (`ArrayBuffer`, `TypedArray`, or `DataView`)
- `options`: Configuration object
  - `format` (required): YUV pixel format
  - `width` (required): Frame width in pixels
  - `height` (required): Frame height in pixels
  - `timestamp` (required): Timestamp in microseconds
  - `duration` (optional): Duration in microseconds
  - `displayWidth` (optional): Display width (defaults to width)
  - `displayHeight` (optional): Display height (defaults to height)
  - `colorSpace` (optional): Color space configuration
  - `transfer` (optional): If `true`, transfers buffer ownership for zero-copy performance

**Supported YUV Formats:**

| Format | Description | Data Size |
|--------|-------------|-----------|
| `I420` | YUV 4:2:0 planar (Y, U, V planes) | width × height × 1.5 |
| `NV12` | YUV 4:2:0 semi-planar (Y plane, interleaved UV) | width × height × 1.5 |
| `I420A` | YUV 4:2:0 planar with alpha | width × height × 2.5 |
| `I422` | YUV 4:2:2 planar | width × height × 2 |
| `I444` | YUV 4:4:4 planar | width × height × 3 |

### `calculateYUVDataSize(format, width, height)`

Calculates the expected byte size for YUV data.

```ts
import { calculateYUVDataSize } from "@gyeonghokim/fisheye.js";

const size = calculateYUVDataSize("NV12", 1920, 1080);  // 3110400 bytes
```

## Development

This project uses:

- **Biome** for linting and formatting
- **Husky** for git hooks
- **Commitlint** for conventional commit messages
- **Semantic Release** for automated versioning and publishing
- **TypeScript** for type safety
- **WebGPU** for GPU-accelerated processing

### Scripts

```bash
npm run build      # Build the library
npm run dev        # Build in watch mode
npm run lint       # Run linter
npm run lint:fix   # Fix linting issues
npm run format     # Format code
npm run type-check # Check TypeScript types
```

### Commit Message Format

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>: <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

## License

MIT
