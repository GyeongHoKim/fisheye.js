export interface OnvifLensProjection {
  angle: number;
  radius: number;
  transmittance?: number;
}

export interface OnvifLensDescription {
  offset: { x?: number; y?: number };
  xFactor: number;
  projection: readonly OnvifLensProjection[];
  focalLength?: number;
}

export interface SplineSegment {
  start: number;
  end: number;
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface PreparedOnvifLens {
  offsetX: number;
  offsetY: number;
  xFactor: number;
  maxAngle: number;
  maxRadius: number;
  segments: readonly SplineSegment[];
}

export function prepareOnvifLens(description: OnvifLensDescription): PreparedOnvifLens {
  if (!description || typeof description !== "object") {
    throw new TypeError("description must be an object");
  }
  if (!description.offset || typeof description.offset !== "object") {
    throw new TypeError("offset must be an object");
  }
  if (!Array.isArray(description.projection)) {
    throw new TypeError("projection must be an array");
  }
  const offsetX = description.offset.x ?? 0;
  const offsetY = description.offset.y ?? 0;
  validateDescriptionScalars(description, offsetX, offsetY);
  const { angles, radii } = copyControlPoints(description.projection);

  const secondDerivatives = naturalSecondDerivatives(angles, radii);
  const segments: SplineSegment[] = [];

  for (let index = 0; index < angles.length - 1; index += 1) {
    const start = angles[index];
    const end = angles[index + 1];
    const width = end - start;
    const currentSecond = secondDerivatives[index];
    const nextSecond = secondDerivatives[index + 1];
    const segment = Object.freeze({
      start,
      end,
      a: radii[index],
      b: (radii[index + 1] - radii[index]) / width - (width * (2 * currentSecond + nextSecond)) / 6,
      c: currentSecond / 2,
      d: (nextSecond - currentSecond) / (6 * width),
    });

    assertFiniteSegment(segment);
    assertNondecreasingSegment(segment);
    segments.push(segment);
  }

  return Object.freeze({
    offsetX,
    offsetY,
    xFactor: description.xFactor,
    maxAngle: angles[angles.length - 1],
    maxRadius: radii[radii.length - 1],
    segments: Object.freeze(segments),
  });
}

export function evaluateOnvifRadius(
  prepared: PreparedOnvifLens,
  angleRadians: number,
): number | null {
  if (!Number.isFinite(angleRadians) || angleRadians < 0 || angleRadians > prepared.maxAngle) {
    return null;
  }

  let low = 0;
  let high = prepared.segments.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segment = prepared.segments[middle];
    if (angleRadians < segment.start) {
      high = middle - 1;
    } else if (angleRadians > segment.end) {
      low = middle + 1;
    } else {
      const t = angleRadians - segment.start;
      return segment.a + t * (segment.b + t * (segment.c + t * segment.d));
    }
  }

  return null;
}

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${field} must be finite`);
  }
}

function validateDescriptionScalars(
  description: OnvifLensDescription,
  offsetX: number,
  offsetY: number,
): void {
  assertFinite(offsetX, "offset.x");
  assertFinite(offsetY, "offset.y");
  if (!Number.isFinite(description.xFactor) || description.xFactor <= 0) {
    throw new RangeError("xFactor must be a positive finite number");
  }
  if (
    description.focalLength !== undefined &&
    (!Number.isFinite(description.focalLength) || description.focalLength <= 0)
  ) {
    throw new RangeError("focalLength must be a positive finite number");
  }
}

function copyControlPoints(projection: readonly OnvifLensProjection[]): {
  angles: number[];
  radii: number[];
} {
  if (projection.length === 0) {
    throw new RangeError("projection must contain at least one sample");
  }

  const angles = [0];
  const radii = [0];
  let previousAngle = 0;
  let previousRadius = 0;

  for (const sample of projection) {
    if (!sample || typeof sample !== "object") {
      throw new TypeError("projection samples must be objects");
    }
    if (!Number.isFinite(sample.angle) || sample.angle <= previousAngle || sample.angle > 180) {
      throw new RangeError(
        "projection angles must be finite, strictly increasing, and in (0, 180]",
      );
    }
    if (!Number.isFinite(sample.radius) || sample.radius <= previousRadius) {
      throw new RangeError("projection radii must be finite, positive, and strictly increasing");
    }
    if (
      sample.transmittance !== undefined &&
      (!Number.isFinite(sample.transmittance) ||
        sample.transmittance < 0 ||
        sample.transmittance > 1)
    ) {
      throw new RangeError("transmittance must be a finite number in [0, 1]");
    }

    angles.push((sample.angle * Math.PI) / 180);
    radii.push(sample.radius);
    previousAngle = sample.angle;
    previousRadius = sample.radius;
  }

  return { angles, radii };
}

function naturalSecondDerivatives(x: readonly number[], y: readonly number[]): number[] {
  const result = new Array<number>(x.length).fill(0);
  const internalCount = x.length - 2;
  if (internalCount <= 0) {
    return result;
  }

  const diagonal = new Array<number>(internalCount);
  const upper = new Array<number>(internalCount).fill(0);
  const lower = new Array<number>(internalCount).fill(0);
  const rightHandSide = new Array<number>(internalCount);

  for (let internalIndex = 0; internalIndex < internalCount; internalIndex += 1) {
    const pointIndex = internalIndex + 1;
    const leftWidth = x[pointIndex] - x[pointIndex - 1];
    const rightWidth = x[pointIndex + 1] - x[pointIndex];
    diagonal[internalIndex] = 2 * (leftWidth + rightWidth);
    if (internalIndex > 0) {
      lower[internalIndex] = leftWidth;
    }
    if (internalIndex < internalCount - 1) {
      upper[internalIndex] = rightWidth;
    }
    rightHandSide[internalIndex] =
      6 *
      ((y[pointIndex + 1] - y[pointIndex]) / rightWidth -
        (y[pointIndex] - y[pointIndex - 1]) / leftWidth);
  }

  for (let index = 1; index < internalCount; index += 1) {
    const multiplier = lower[index] / diagonal[index - 1];
    diagonal[index] -= multiplier * upper[index - 1];
    rightHandSide[index] -= multiplier * rightHandSide[index - 1];
  }

  result[x.length - 2] = rightHandSide[internalCount - 1] / diagonal[internalCount - 1];
  for (let index = internalCount - 2; index >= 0; index -= 1) {
    result[index + 1] = (rightHandSide[index] - upper[index] * result[index + 2]) / diagonal[index];
  }

  return result;
}

function assertFiniteSegment(segment: SplineSegment): void {
  if (
    !Number.isFinite(segment.start) ||
    !Number.isFinite(segment.end) ||
    !Number.isFinite(segment.a) ||
    !Number.isFinite(segment.b) ||
    !Number.isFinite(segment.c) ||
    !Number.isFinite(segment.d)
  ) {
    throw new RangeError("natural cubic produced a non-finite coefficient");
  }
}

function assertNondecreasingSegment(segment: SplineSegment): void {
  const width = segment.end - segment.start;
  const derivativeAt = (t: number): number => segment.b + 2 * segment.c * t + 3 * segment.d * t * t;
  const tolerance =
    Number.EPSILON *
    32 *
    Math.max(
      1,
      Math.abs(segment.b),
      Math.abs(2 * segment.c * width),
      Math.abs(3 * segment.d * width * width),
    );

  if (derivativeAt(0) < -tolerance || derivativeAt(width) < -tolerance) {
    throw new RangeError("natural cubic radius must not decrease");
  }

  if (segment.d !== 0) {
    const vertex = -segment.c / (3 * segment.d);
    if (vertex > 0 && vertex < width && derivativeAt(vertex) < -tolerance) {
      throw new RangeError("natural cubic radius must not decrease");
    }
  }
}
