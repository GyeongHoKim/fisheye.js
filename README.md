# fisheye.js

Modern fisheye dewarping library for the web - successor to the original [fisheye.js](https://github.com/ericleong/fisheye.js)

fisheye.js is a javascript library for drawing VideoFrame to the canvas with [simple radial lens distortion](<https://en.wikipedia.org/wiki/Distortion_(optics)>) using WebGPU(WebGL if your browser does not support WebGPU).

## Features

- ESM support: You can just `import { Fisheye } from @gyeonghokim/fisheye.js;` in your WebAPP
- TypeGPU: WebGPU backend with type-safe shader programing(with [typegpu](https://www.npmjs.com/package/typegpu))
- WebCodecs API: Modern Video processing with WebCodecs' [VideoFrame](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame)
- Installation from modern package managers(npm)

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
    // ...
  }
  // ...
}
```

> Why should I install webgpu types?
> This library does not render your binary, it just dewarp the VideoFrame.
> You should make **your own YUV renderer**, or you can install `@gyeonghokim/yuv-player`.

in your code,

```ts
import { Fisheye } from "@gyeonghokim/fisheye.js";

const dewarper = new Fisheye({
  distortion: 0.5, // Distortion coefficient (-1.0 to 1.0)
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

- `distortion` (number, optional): Distortion coefficient (k1) for the fisheye lens. Typical range: -1.0 to 1.0. Default: `0.5`
  - Positive values: barrel distortion (fisheye effect)
  - Negative values: pincushion distortion
  - 0: no distortion
- `width` (number, optional): Output canvas width. Default: `640`
- `height` (number, optional): Output canvas height. Default: `480`
- `fov` (number, optional): Field of view in degrees. Default: `180`
- `centerX` (number, optional): X offset of the lens center (normalized, -1.0 to 1.0). Default: `0`
- `centerY` (number, optional): Y offset of the lens center (normalized, -1.0 to 1.0). Default: `0`
- `zoom` (number, optional): Zoom factor. Default: `1.0`

### `dewarp(frame: VideoFrame): Promise<VideoFrame>`

Dewarps a VideoFrame with fisheye distortion.

**Parameters:**

- `frame`: Input VideoFrame with fisheye distortion

**Returns:** Promise that resolves to a dewarped VideoFrame

### `updateConfig(options: Partial<FisheyeOptions>): void`

Updates the dewarper configuration. You can update any subset of the original options.

### `destroy(): void`

Cleans up GPU resources. Call this when you're done using the dewarper.

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
