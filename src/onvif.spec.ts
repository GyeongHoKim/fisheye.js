import { describe, expect, it } from "vitest";
import { evaluateOnvifRadius, type OnvifLensDescription, prepareOnvifLens } from "./onvif";

describe("prepareOnvifLens", () => {
  it("uses a line through the implicit origin for one supplied point", () => {
    const prepared = prepareOnvifLens({
      offset: {},
      xFactor: 1,
      projection: [{ angle: 90, radius: 1 }],
    });

    expect(prepared.segments).toHaveLength(1);
    expect(prepared.maxAngle).toBeCloseTo(Math.PI / 2);
    expect(prepared.maxRadius).toBe(1);
    expect(evaluateOnvifRadius(prepared, Math.PI / 4)).toBeCloseTo(0.5);
  });

  it("computes the hand-derived natural cubic through three supplied points", () => {
    // With equal knot spacing and radii 0, 1, 4, 9, the natural spline has
    // second derivatives 0, 12/5, 12/5, 0 in unit-knot coordinates.
    const prepared = prepareOnvifLens({
      offset: {},
      xFactor: 1,
      projection: [
        { angle: 30, radius: 1 },
        { angle: 60, radius: 4 },
        { angle: 90, radius: 9 },
      ],
    });

    expect(evaluateOnvifRadius(prepared, Math.PI / 12)).toBeCloseTo(0.35);
    expect(evaluateOnvifRadius(prepared, Math.PI / 4)).toBeCloseTo(2.2);
    expect(evaluateOnvifRadius(prepared, (5 * Math.PI) / 12)).toBeCloseTo(6.35);
  });

  it("reproduces the origin and every supplied knot exactly", () => {
    const prepared = prepareOnvifLens({
      offset: {},
      xFactor: 1,
      projection: [
        { angle: 30, radius: 1 },
        { angle: 60, radius: 4 },
        { angle: 90, radius: 9 },
      ],
    });

    expect(evaluateOnvifRadius(prepared, 0)).toBe(0);
    expect(evaluateOnvifRadius(prepared, Math.PI / 6)).toBeCloseTo(1);
    expect(evaluateOnvifRadius(prepared, Math.PI / 3)).toBeCloseTo(4);
    expect(evaluateOnvifRadius(prepared, Math.PI / 2)).toBeCloseTo(9);
  });

  it("copies normalized offsets, xFactor, and curve data", () => {
    const description: OnvifLensDescription = {
      offset: { x: 0.125, y: -0.25 },
      xFactor: 1.5,
      projection: [{ angle: 90, radius: 1 }],
      focalLength: 2.25,
    };
    const prepared = prepareOnvifLens(description);

    description.offset.x = 0.75;
    description.offset.y = 0.5;
    description.xFactor = 3;
    description.projection[0].angle = 45;
    description.projection[0].radius = 9;

    expect(prepared.offsetX).toBe(0.125);
    expect(prepared.offsetY).toBe(-0.25);
    expect(prepared.xFactor).toBe(1.5);
    expect(prepared.maxAngle).toBeCloseTo(Math.PI / 2);
    expect(prepared.maxRadius).toBe(1);
    expect(evaluateOnvifRadius(prepared, Math.PI / 4)).toBeCloseTo(0.5);
  });

  it("defaults omitted offset coordinates to zero and accepts valid metadata", () => {
    const prepared = prepareOnvifLens({
      offset: { x: 0.2 },
      xFactor: 1,
      focalLength: 3.5,
      projection: [
        { angle: 45, radius: 0.5, transmittance: 0 },
        { angle: 90, radius: 1, transmittance: 1 },
      ],
    });

    expect(prepared.offsetX).toBe(0.2);
    expect(prepared.offsetY).toBe(0);
  });

  it("rejects empty and malformed projection samples", () => {
    const invalidProjections = [
      [],
      [{ angle: 0, radius: 1 }],
      [{ angle: -1, radius: 1 }],
      [{ angle: 181, radius: 1 }],
      [{ angle: Number.NaN, radius: 1 }],
      [{ angle: Number.POSITIVE_INFINITY, radius: 1 }],
      [{ angle: 45, radius: 0 }],
      [{ angle: 45, radius: -1 }],
      [{ angle: 45, radius: Number.NaN }],
      [
        { angle: 45, radius: 1 },
        { angle: 45, radius: 2 },
      ],
      [
        { angle: 60, radius: 1 },
        { angle: 45, radius: 2 },
      ],
      [
        { angle: 45, radius: 1 },
        { angle: 90, radius: 1 },
      ],
      [{ angle: 45, radius: 1, transmittance: -0.01 }],
      [{ angle: 45, radius: 1, transmittance: 1.01 }],
      [{ angle: 45, radius: 1, transmittance: Number.NaN }],
    ];

    for (const projection of invalidProjections) {
      expect(() => prepareOnvifLens({ offset: {}, xFactor: 1, projection })).toThrow();
    }
  });

  it("rejects malformed JavaScript object shapes with useful errors", () => {
    expect(() => prepareOnvifLens(null as never)).toThrow("description must be an object");
    expect(() => prepareOnvifLens({ xFactor: 1, projection: [] } as never)).toThrow(
      "offset must be an object",
    );
    expect(() => prepareOnvifLens({ offset: {}, xFactor: 1, projection: null } as never)).toThrow(
      "projection must be an array",
    );
    expect(() => prepareOnvifLens({ offset: {}, xFactor: 1, projection: [null] } as never)).toThrow(
      "projection samples must be objects",
    );
  });

  it("rejects invalid scalar fields and metadata", () => {
    const projection = [{ angle: 90, radius: 1 }];
    const invalidDescriptions: OnvifLensDescription[] = [
      { offset: { x: Number.NaN }, xFactor: 1, projection },
      { offset: { y: Number.POSITIVE_INFINITY }, xFactor: 1, projection },
      { offset: {}, xFactor: 0, projection },
      { offset: {}, xFactor: -1, projection },
      { offset: {}, xFactor: Number.NaN, projection },
      { offset: {}, xFactor: Number.POSITIVE_INFINITY, projection },
      { offset: {}, xFactor: 1, projection, focalLength: 0 },
      { offset: {}, xFactor: 1, projection, focalLength: -1 },
      { offset: {}, xFactor: 1, projection, focalLength: Number.NaN },
      {
        offset: {},
        xFactor: 1,
        projection,
        focalLength: Number.POSITIVE_INFINITY,
      },
    ];

    for (const description of invalidDescriptions) {
      expect(() => prepareOnvifLens(description)).toThrow();
    }
  });

  it("rejects a natural cubic whose radius derivative turns negative between knots", () => {
    expect(() =>
      prepareOnvifLens({
        offset: {},
        xFactor: 1,
        projection: [
          // Every knot slope stays non-negative, but the fourth segment's
          // quadratic derivative has a negative value at its interior vertex.
          { angle: 30, radius: 1 },
          { angle: 60, radius: 2 },
          { angle: 90, radius: 3 },
          { angle: 120, radius: 4 },
          { angle: 150, radius: 11 },
        ],
      }),
    ).toThrow();
  });

  it("rejects a natural cubic with a negative derivative at a knot", () => {
    expect(() =>
      prepareOnvifLens({
        offset: {},
        xFactor: 1,
        projection: [
          { angle: 30, radius: 10 },
          { angle: 60, radius: 11 },
          { angle: 90, radius: 12 },
        ],
      }),
    ).toThrow();
  });

  it("rejects finite samples that would produce non-finite coefficients", () => {
    expect(() =>
      prepareOnvifLens({
        offset: {},
        xFactor: 1,
        projection: [{ angle: Number.MIN_VALUE, radius: 1 }],
      }),
    ).toThrow();
  });
});

describe("evaluateOnvifRadius", () => {
  it("returns null outside the inclusive angular domain", () => {
    const prepared = prepareOnvifLens({
      offset: {},
      xFactor: 1,
      projection: [{ angle: 90, radius: 1 }],
    });
    expect(evaluateOnvifRadius(prepared, -Number.EPSILON)).toBeNull();
    expect(evaluateOnvifRadius(prepared, Math.PI / 2 + Number.EPSILON)).toBeNull();
  });

  it("returns null for non-finite angles", () => {
    const prepared = prepareOnvifLens({
      offset: {},
      xFactor: 1,
      projection: [{ angle: 90, radius: 1 }],
    });
    expect(evaluateOnvifRadius(prepared, Number.NaN)).toBeNull();
    expect(evaluateOnvifRadius(prepared, Number.POSITIVE_INFINITY)).toBeNull();
    expect(evaluateOnvifRadius(prepared, Number.NEGATIVE_INFINITY)).toBeNull();
  });
});
