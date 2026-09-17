import { afterAll, beforeAll, expect, it } from "vitest";
import { create, globals } from "webgpu";
import { TextureProcessor } from "../../src/texture-processor";

let gpu: GPU | undefined;
let device: GPUDevice;
const errors: string[] = [];
beforeAll(async () => {
  Object.assign(globalThis, globals);
  const software = process.env.FISHEYE_SOFTWARE_GPU === "1";
  gpu = create(software ? ["backend=vulkan", "adapter=llvmpipe"] : []);
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("WebGPU adapter unavailable");
  console.info("GPU adapter", adapter.info);
  if (
    software &&
    !/llvmpipe|lavapipe/i.test(`${adapter.info.device} ${adapter.info.description}`)
  ) {
    throw new Error("Expected Lavapipe software adapter");
  }
  device = await adapter.requestDevice();
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message));
  void device.lost.then((info) => {
    if (info.reason !== "destroyed") errors.push(info.message);
  });
});
afterAll(() => {
  device?.destroy();
  gpu = undefined;
  expect(errors).toEqual([]);
});

function gradient(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels.set([x * 20, y * 20, 40, 255], offset);
    }
  }
  return pixels;
}

async function run(engine: TextureProcessor, pixels: Uint8Array, width: number, height: number) {
  const input = engine.getInputTexture(width, height);
  device.queue.writeTexture({ texture: input }, pixels, { bytesPerRow: width * 4 }, [
    width,
    height,
  ]);
  const outputs = engine.process(width, height);
  return Promise.all(outputs.map((texture) => engine.readPixels(texture)));
}

it("executes original pixels through production texture pipeline and unaligned readback", async () => {
  const engine = new TextureProcessor(device, {
    width: 7,
    height: 3,
    projection: { kind: "original" },
  });
  try {
    const pixels = Uint8Array.from({ length: 7 * 3 * 4 }, (_, i) => (i * 7) % 256);
    const input = engine.getInputTexture(7, 3);
    device.queue.writeTexture({ texture: input }, pixels, { bytesPerRow: 28 }, [7, 3]);
    const output = await engine.process(7, 3);
    expect(await engine.readPixels(output[0])).toEqual(pixels);
  } finally {
    engine.destroy();
  }
});

it("evaluates ONVIF spline, XFactor and offset in the production shader", async () => {
  const engine = new TextureProcessor(device, {
    lens: {
      kind: "onvif",
      description: {
        offset: { x: 0.2, y: 0 },
        xFactor: 0.5,
        projection: [{ angle: 90, radius: 1 }],
      },
    },
    size: { width: 3, height: 3 },
    projection: { kind: "rectilinear", mode: "manual", newFx: 1, newFy: 1, newCx: 1, newCy: 1 },
  });
  try {
    const [pixels] = await run(engine, gradient(9, 9), 9, 9);
    // Center: x=(-offsetX), input x=(0.8*4)=3.2 -> red 64.
    expect([...pixels.slice(4 * 4, 4 * 4 + 4)]).toEqual([64, 80, 40, 255]);
    // Manual focal lengths use input-pixel units and scale to the output size. Here f=1/3,
    // so x=2 produces theta=atan(3), R=atan(3)/(pi/2), then XFactor and offset.
    expect([...pixels.slice(5 * 4, 5 * 4 + 4)]).toEqual([96, 80, 40, 255]);
  } finally {
    engine.destroy();
  }
});

it("masks rays beyond the last ONVIF projection angle", async () => {
  const engine = new TextureProcessor(device, {
    lens: {
      kind: "onvif",
      description: {
        offset: {},
        xFactor: 1,
        projection: [{ angle: 30, radius: 0.5 }],
      },
    },
    size: { width: 3, height: 3 },
    projection: { kind: "rectilinear", mode: "manual", newFx: 1, newFy: 1, newCx: 1, newCy: 1 },
  });
  try {
    const [pixels] = await run(engine, gradient(9, 9), 9, 9);
    expect([...pixels.slice(4 * 4, 4 * 4 + 4)]).toEqual([80, 80, 40, 255]);
    expect([...pixels.slice(5 * 4, 5 * 4 + 4)]).toEqual([0, 0, 0, 255]);
  } finally {
    engine.destroy();
  }
});

it("preserves the OpenCV zero-distortion mapping", async () => {
  const engine = new TextureProcessor(device, {
    lens: {
      kind: "opencv",
      K: { fx: 4, fy: 4, cx: 4, cy: 4 },
      D: { k1: 0, k2: 0, k3: 0, k4: 0 },
    },
    size: { width: 3, height: 3 },
    projection: {
      kind: "rectilinear",
      mode: "manual",
      newFx: 3,
      newFy: 3,
      newCx: 1,
      newCy: 1,
    },
  });
  try {
    const [pixels] = await run(engine, gradient(9, 9), 9, 9);
    expect([...pixels.slice(4 * 4, 4 * 4 + 4)]).toEqual([80, 80, 40, 255]);
    expect([...pixels.slice(5 * 4, 5 * 4 + 4)]).toEqual([143, 80, 40, 255]);
  } finally {
    engine.destroy();
  }
});

it("runs ONVIF panoramic, PTZ and pane paths and model replacement", async () => {
  const lens = {
    kind: "onvif" as const,
    description: {
      offset: {},
      xFactor: 1,
      projection: [{ angle: 180, radius: 1 }],
    },
  };
  const engine = new TextureProcessor(device, {
    lens,
    size: { width: 5, height: 3 },
    projection: { kind: "equirectangular" },
    ptz: { pan: 10, tilt: -5, zoom: 1.2 },
  });
  try {
    expect(await run(engine, gradient(9, 9), 9, 9)).toHaveLength(1);
    engine.updateConfig({ ptz: undefined, pane: { kind: "4pane" } });
    expect(await run(engine, gradient(9, 9), 9, 9)).toHaveLength(4);
    engine.updateConfig({
      lens: { kind: "opencv", D: { k1: 0, k2: 0, k3: 0, k4: 0 } },
      pane: undefined,
    });
    expect(await run(engine, gradient(9, 9), 9, 9)).toHaveLength(1);
  } finally {
    engine.destroy();
  }
});
