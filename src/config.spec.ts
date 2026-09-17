import { describe, expect, it } from "vitest";
import { normalizeOptions, updateOptions } from "./config";

const description = {
  offset: { x: 0.1, y: -0.2 },
  xFactor: 0.5,
  projection: [{ angle: 90, radius: 1 }],
};
describe("lens configuration", () => {
  it("retains legacy flat and grouped OpenCV settings", () => {
    expect(normalizeOptions({ k1: 0.2, k2: 0, k3: 0, k4: 0, width: 40, height: 30 }).D.k1).toBe(
      0.2,
    );
    expect(
      normalizeOptions({ D: { k1: 0.2, k2: 0, k3: 0, k4: 0 }, size: { width: 40, height: 30 } })
        .projection.kind,
    ).toBe("rectilinear");
  });
  it("prepares an ONVIF lens and copies caller data", () => {
    const input = structuredClone(description);
    const config = normalizeOptions({ lens: { kind: "onvif", description: input } });
    input.projection[0].radius = 10;
    expect(config.onvif?.maxRadius).toBe(1);
    expect(config.horizontalFov).toBe(90);
  });
  it("rejects ambiguous models, OpenCV-only options and invalid FOV", () => {
    const lens = { kind: "onvif" as const, description };
    expect(() => normalizeOptions({ lens, k1: 0 } as never)).toThrow();
    expect(() => normalizeOptions({ lens, balance: 0 } as never)).toThrow();
    expect(() =>
      normalizeOptions({ lens, projection: { kind: "rectilinear", horizontalFov: 180 } }),
    ).toThrow();
    expect(() =>
      normalizeOptions({
        lens,
        projection: {
          kind: "rectilinear",
          mode: "manual",
          newFx: 20,
          newFy: 20,
          horizontalFov: 90,
        } as never,
      }),
    ).toThrow();
  });
  it("updates flat legacy options without losing changes", () => {
    const config = normalizeOptions({ width: 30, height: 20 });
    const next = updateOptions(config, { width: 50, k1: 0.4 });
    expect(next.size).toEqual({ width: 50, height: 20 });
    expect(next.D.k1).toBe(0.4);
    expect(config.size.width).toBe(30);
  });
  it("switches models atomically and discards model-only options", () => {
    const a = normalizeOptions({ balance: 1, fovScale: 2 });
    const b = updateOptions(a, { lens: { kind: "onvif", description } });
    expect(b.onvif?.maxRadius).toBe(1);
    expect(b.fovScale).toBe(1);
    const c = updateOptions(b, { lens: { kind: "opencv", D: { k1: 0, k2: 0, k3: 0, k4: 0 } } });
    expect(c.onvif).toBeUndefined();
    expect(() =>
      updateOptions(b, { lens: { kind: "onvif", description: { ...description, xFactor: 0 } } }),
    ).toThrow();
    expect(b.onvif?.xFactor).toBe(0.5);
  });
});
