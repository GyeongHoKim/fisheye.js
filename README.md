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

const dewarper = new Fisheye(yourOptions);

const renderLoop = (timestamp: DOMHighResTimestamp) => {
  // your render logic
  const dewarpedVideoFrame: VideoFrame = dewarper.dewarp(yourVideoFrame);
  yourYUVPlayer.draw(dewarpedVideoFrame);
  requestAnimationFrame(renderLoop);
};
```
