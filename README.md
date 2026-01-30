# fisheye.js

DEMO: <https://gyeonghokim.github.io/fisheye.js/>

> Modern fisheye undistortion library for the web using **WebGPU** (general-purpose GPU compute)

fisheye.js processes [VideoFrame](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame)s with **WebGPU compute shaders**—no canvas 2D—and corrects fisheye lens distortion using the **OpenCV fisheye model** (Kannala–Brandt–style polynomial in angle θ with coefficients k1–k4). This is the same model as in [OpenCV's fisheye module](https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html).

## Learning Docs

See the full educational curriculum in `doc/index.md`.

## Features

- **WebGPU GPGPU**: Compute-shader pipeline via [TypeGPU](https://www.npmjs.com/package/typegpu); input/output as textures and readback to VideoFrame—no canvas element for undistortion
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
> This library does not render your binary, it just undistorts the VideoFrame.
> You should make **your own YUV renderer**, or you can install `@gyeonghokim/yuv-player`.

in your code,

```ts
import { Fisheye } from "@gyeonghokim/fisheye.js";

const fisheye = new Fisheye({
  // OpenCV fisheye distortion coefficients (from calibration)
  k1: 0.5,
  k2: 0.0,
  k3: 0.0,
  k4: 0.0,

  // Output configuration
  width: 1920,
  height: 1080,

  // Optional: OpenCV camera matrix parameters
  fx: 1000, // focal length x (pixels)
  fy: 1000, // focal length y (pixels)
  cx: 960, // principal point x (pixels)
  cy: 540, // principal point y (pixels)

  // Optional: Advanced OpenCV parameters
  balance: 0.0, // 0.0 = all pixels, 1.0 = original FOV
  fovScale: 1.0, // >1.0 = zoom out, <1.0 = zoom in

  // Optional: Additional features (not part of OpenCV)
  projection: "rectilinear", // "rectilinear" | "equirectangular"
  mount: "ceiling", // "ceiling" | "wall" | "desk"
});

const renderLoop = async (timestamp: DOMHighResTimestamp) => {
  // Undistort the fisheye frame
  const undistorted: VideoFrame = await fisheye.undistort(yourVideoFrame);
  yourYUVPlayer.draw(undistorted);
  requestAnimationFrame(renderLoop);
};
```

## Architecture & Design

### Distortion Model: OpenCV Fisheye (Kannala-Brandt)

This library uses the **OpenCV fisheye model** (Kannala-Brandt, 2006) for undistortion:

```
theta = atan(r)
theta_d = theta * (1 + k1*theta^2 + k2*theta^4 + k3*theta^6 + k4*theta^8)
r_d = tan(theta_d)
```

This is the same model as [OpenCV's fisheye module](https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html).

**Important:** OpenCV's `fisheye.undistortImage()` always outputs **rectilinear (perspective) projection only**. It does not provide panoramic or other projection modes.

### Additional Features Beyond OpenCV

For **WebGPU efficiency**, we integrate additional transformations in a **single GPU pass** rather than CPU-side post-processing:

#### 1. **Projection Mode** (`projection`)

- **Purpose**: Controls output coordinate mapping after undistortion
- **Values**:
  - `"rectilinear"`: Standard perspective projection (same as OpenCV output)
  - `"equirectangular"`: Cylindrical/spherical panoramic projection
- **Implementation**: Applied in GPU shader after undistortion step
- **OpenCV equivalent**: Would require separate `cv2.warpPerspective()` or custom remapping after `fisheye.undistortImage()`

#### 2. **Mount Orientation** (`mount`)

- **Purpose**: Compensates for camera mounting angle
- **Values**:
  - `"ceiling"`: No rotation (0°)
  - `"wall"`: 90° rotation
  - `"desk"`: 180° or -90° rotation
- **Implementation**: Applied as rotation transformation in GPU shader
- **OpenCV equivalent**: Would require `cv2.getRotationMatrix2D()` + `cv2.warpAffine()` after undistortion

### Why Unified GPU Pipeline?

Traditional OpenCV approach:

```python
# Step 1: Undistort (GPU/CPU)
undistorted = cv2.fisheye.undistortImage(img, K, D, Knew)

# Step 2: Projection transform (CPU)
panorama = cv2.remap(undistorted, custom_map_x, custom_map_y, cv2.INTER_LINEAR)

# Step 3: Rotation (CPU)
rotated = cv2.warpAffine(panorama, rotation_matrix, size)
```

**Our approach (single GPU compute shader):**

```typescript
// All in one GPU pass: undistortion + projection + rotation
const undistorted = await fisheye.undistort(input);
```

## API

### `new Fisheye(options?: FisheyeOptions)`

Creates a new Fisheye undistortion instance.

#### OpenCV Fisheye Model Parameters

| Parameter  | Type      | Default    | Description                                              |
| ---------- | --------- | ---------- | -------------------------------------------------------- |
| `fx`       | `number?` | auto       | Camera matrix K: focal length in x-axis (pixels)         |
| `fy`       | `number?` | auto       | Camera matrix K: focal length in y-axis (pixels)         |
| `cx`       | `number?` | `width/2`  | Camera matrix K: principal point x-coordinate (pixels)   |
| `cy`       | `number?` | `height/2` | Camera matrix K: principal point y-coordinate (pixels)   |
| `k1`       | `number?` | `0`        | Distortion coefficient k1 (Kannala-Brandt)               |
| `k2`       | `number?` | `0`        | Distortion coefficient k2 (Kannala-Brandt)               |
| `k3`       | `number?` | `0`        | Distortion coefficient k3 (Kannala-Brandt)               |
| `k4`       | `number?` | `0`        | Distortion coefficient k4 (Kannala-Brandt)               |
| `width`    | `number?` | `300`      | Output image width (OpenCV `new_size.width`)             |
| `height`   | `number?` | `150`      | Output image height (OpenCV `new_size.height`)           |
| `balance`  | `number?` | `0.0`      | Balance parameter (0.0 = all pixels, 1.0 = original FOV) |
| `fovScale` | `number?` | `1.0`      | FOV scale divisor (>1.0 = zoom out, <1.0 = zoom in)      |

**Note:** These parameters exactly match [OpenCV fisheye API](https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html). Use values from `cv2.fisheye.calibrate()` or `cv2.fisheye.estimateNewCameraMatrixForUndistortRectify()`.

#### Additional Features (not part of OpenCV)

| Parameter    | Type                                   | Default         | Description                                                                                             |
| ------------ | -------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `projection` | `"rectilinear"` \| `"equirectangular"` | `"rectilinear"` | Output projection mode. `"rectilinear"` = perspective (same as OpenCV), `"equirectangular"` = panoramic |
| `mount`      | `"ceiling"` \| `"wall"` \| `"desk"`    | `"ceiling"`     | Camera mount orientation for rotation compensation                                                      |

### `undistort(frame: VideoFrame): Promise<VideoFrame>`

Undistorts a VideoFrame with fisheye distortion.

**Parameters:**

- `frame`: Input VideoFrame with fisheye distortion

**Returns:** Promise that resolves to an undistorted VideoFrame

**Differences from OpenCV:**

Unlike OpenCV's `fisheye.undistortImage()` which only outputs rectilinear (perspective) projection, this method performs **all transformations in a single GPU pass** for WebGPU efficiency:

1. **Undistortion** (OpenCV fisheye model)
2. **Projection** (rectilinear or equirectangular, based on `projection` config)
3. **Mount rotation** (based on `mount` config)

OpenCV equivalent would require 3 separate operations:
```python
# OpenCV: 3 CPU/GPU roundtrips
undistorted = cv2.fisheye.undistortImage(img, K, D, Knew)
panorama = cv2.remap(undistorted, map_x, map_y, cv2.INTER_LINEAR)  # if equirectangular
rotated = cv2.warpAffine(panorama, rotation_matrix, size)  # if ceiling/wall/desk

# fisheye.js: 1 GPU pass - undistortion + projection + rotation
undistorted = await fisheye.undistort(img)
```

### `updateConfig(options: Partial<FisheyeOptions>): void`

Updates the configuration. You can update any subset of the original options.

### `destroy(): void`

Cleans up GPU resources. Call this when you're done using the instance.

## Working with YUV Binary Data

If you receive raw YUV binary data from a camera or server, you can use the `createVideoFrameFromYUV` utility to create a VideoFrame:

```ts
import { Fisheye, createVideoFrameFromYUV } from "@gyeonghokim/fisheye.js";

const fisheye = new Fisheye({ k1: 0.5, width: 1920, height: 1080 });

// Example: Receiving NV12 data from a server
const response = await fetch("/api/camera/frame");
const yuvBuffer = await response.arrayBuffer();

const frame = createVideoFrameFromYUV(new Uint8Array(yuvBuffer), {
  format: "NV12", // YUV format
  width: 1920,
  height: 1080,
  timestamp: performance.now() * 1000, // microseconds
});

const undistorted = await fisheye.undistort(frame);
frame.close(); // Don't forget to close the original frame
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

| Format  | Description                                     | Data Size            |
| ------- | ----------------------------------------------- | -------------------- |
| `I420`  | YUV 4:2:0 planar (Y, U, V planes)               | width × height × 1.5 |
| `NV12`  | YUV 4:2:0 semi-planar (Y plane, interleaved UV) | width × height × 1.5 |
| `I420A` | YUV 4:2:0 planar with alpha                     | width × height × 2.5 |
| `I422`  | YUV 4:2:2 planar                                | width × height × 2   |
| `I444`  | YUV 4:4:4 planar                                | width × height × 3   |

### `calculateYUVDataSize(format, width, height)`

Calculates the expected byte size for YUV data.

```ts
import { calculateYUVDataSize } from "@gyeonghokim/fisheye.js";

const size = calculateYUVDataSize("NV12", 1920, 1080); // 3110400 bytes
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
