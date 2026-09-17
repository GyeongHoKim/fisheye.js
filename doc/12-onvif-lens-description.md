# ONVIF Media2 lens descriptions

ONVIF Media2 can expose `LensDescription` entries under `VideoSourceConfigurationExtension2`. This is a different calibration interface from OpenCV's `K` matrix and `D` vector, so fisheye.js represents the two models as an explicit discriminated union while keeping the original OpenCV options compatible.

## Configuration

```ts
const dewarper = new Fisheye({
  lens: {
    kind: "onvif",
    description: {
      offset: { x: 0.01, y: -0.02 },
      xFactor: 0.5625,
      projection: [
        { angle: 30, radius: 0.25 },
        { angle: 60, radius: 0.52 },
        { angle: 90, radius: 0.82, transmittance: 0.9 },
      ],
      focalLength: 1.8,
    },
  },
  size: { width: 1280, height: 720 },
  projection: { kind: "rectilinear", horizontalFov: 100 },
});
```

JavaScript fields use camelCase. They map to the XSD as follows:

| fisheye.js | ONVIF XSD | Meaning |
| --- | --- | --- |
| `description.offset.x/y` | `Offset/@x`, `Offset/@y` | Lens-center offset in normalized sensor coordinates |
| `projection[].angle` | `Projection/Angle` | Incidence angle in degrees |
| `projection[].radius` | `Projection/Radius` | Normalized radial sensor position |
| `projection[].transmittance` | `Projection/Transmittance` | Optional ray transmission in `[0, 1]` |
| `xFactor` | `XFactor` | Horizontal normalized-coordinate compensation |
| `focalLength` | `@FocalLength` | Optional optical-system metadata |

The origin `(angle=0, radius=0)` is implicit because the XSD says the zero-radius item must not be supplied. The ONVIF XSD requires samples to be ordered by increasing radius. fisheye.js additionally requires strictly increasing positive angles because it constructs the forward function `radius(angle)`; descriptions that do not meet that implementation constraint are rejected even if they are schema-valid. Rays beyond the final angle/radius are black.

## Mapping used by this implementation

The supplied samples are converted from degrees to radians and interpolated with a natural cubic spline. For a ray direction `(dx, dy, dz)`:

```text
alpha = atan2(sqrt(dx² + dy²), dz)
R = spline(alpha)
(rx, ry) = R * (dx, -dy) / sqrt(dx² + dy²)
sensorX = rx * XFactor - Offset.x
sensorY = ry - Offset.y
```

The normalized range `[-1, 1]` maps to the centers of the first and last input texels. Bilinear filtering is performed in the compute shader.

ONVIF deliberately leaves the distortion-compensation method to clients. It also does not fully specify the B-Spline degree, knots, or boundary conditions. Natural cubic interpolation, offset signs, texel-center mapping, and output projection selection are therefore explicit fisheye.js conventions. Validate them with the target camera before production use.

## Supported and excluded scope

Supported:

- Rectilinear, equirectangular, cylindrical, and original output modes
- e-PTZ and 2/4-pane output
- Atomic switching between `{ kind: "opencv" }` and `{ kind: "onvif" }`
- Validation and retention of optional focal length/transmittance metadata

Not included:

- SOAP discovery, Media2 requests, or XML parsing
- Selecting among multiple `LensDescription` values
- Vignetting compensation from `Transmittance`
- `SceneOrientation`, rotation, mirror, or automatic crop handling
- A claim of ONVIF device conformance

For authoritative source material and exact hashes, see [`references/onvif/README.md`](references/onvif/README.md).
