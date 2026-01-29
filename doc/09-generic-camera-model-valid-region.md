# Generic Camera Model and Fisheye Valid Region

This module introduces the **generic camera model** and explains how to determine the **valid region** of a fisheye image and how dewarping is applied.

**Prerequisites:** `10-calibration-intrinsics-extrinsics.md`  
**Next:** `03-fisheye-model-math.md`

## 1. Generic camera model (core idea)

A generic camera model can be written as:

```
X_w -> X_c -> (x, y) -> r -> r_d -> (u, v) -> pixel
```

Where:

- `X_w`: 3D world point
- `X_c`: 3D camera point (after extrinsic transform)
- `(x, y)`: normalized coordinates (pinhole projection)
- `r`: radius in normalized plane
- `r_d`: distorted radius from the lens model
- `(u, v)`: distorted normalized coordinates

This is “generic” because the **lens mapping** can be any function `r_d = f(theta)` or `r_d = f(r)`.

## 1.1 Full step-by-step projection (single flow)

Given a world point `X_w`:

```
X_c = R^T (X_w - C)
x = X_c / Z_c
y = Y_c / Z_c
r = sqrt(x^2 + y^2)
theta = atan(r)
r_d = f(theta)
x_d = x * (r_d / r)
y_d = y * (r_d / r)
[u v 1]^T = K [x_d y_d 1]^T
```

This is the complete chain from 3D world to 2D pixel coordinates.

## 1.2 Full numeric example (world -> pixel)

Assume:

- Camera center `C = (1, 2, 3)`
- Rotation `R = I` (camera aligned to world)
- Intrinsics:
  ```
  fx = 800, fy = 800, cx = 320, cy = 240
  ```
- World point `X_w = (2, 4, 7)`
- Fisheye mapping uses equidistant baseline: `r_d = theta`

Step 1: world -> camera:

```
X_c = X_w - C = (1, 2, 4)
```

Step 2: perspective normalize:

```
x = X_c / Z_c = 1 / 4 = 0.25
y = Y_c / Z_c = 2 / 4 = 0.5
```

Step 3: radius and angle:

```
r = sqrt(0.25^2 + 0.5^2) = sqrt(0.3125) ≈ 0.559
theta = atan(r) ≈ 0.510 radians
```

Step 4: equidistant mapping:

```
r_d = theta ≈ 0.510
scale = r_d / r ≈ 0.510 / 0.559 ≈ 0.913
x_d = x * scale ≈ 0.25 * 0.913 ≈ 0.228
y_d = y * scale ≈ 0.5 * 0.913 ≈ 0.456
```

Step 5: pixel projection:

```
u = fx * x_d + cx = 800 * 0.228 + 320 ≈ 502.4
v = fy * y_d + cy = 800 * 0.456 + 240 ≈ 604.8
```

Final pixel coordinates: approximately `(u, v) = (502, 605)`.

## 2. Pinhole projection with intrinsics

From camera coordinates `(X_c, Y_c, Z_c)`:

```
x = X_c / Z_c
y = Y_c / Z_c
```

The intrinsics matrix `K` maps these to pixel coordinates:

```
K = [ fx  0  cx
      0  fy  cy
      0   0   1 ]
```

```
[u]   [fx  0  cx] [x]
[v] = [ 0 fy  cy] [y]
[1]   [ 0  0   1] [1]
```

This is the standard **pinhole camera model**.

## 2.1 Radial and tangential distortion (generic model)

Most calibration models add two distortion components:

### Radial distortion (barrel/pincushion)

Radial distortion depends on radius `r = sqrt(x^2 + y^2)`:

```
x_radial = x * (1 + k1*r^2 + k2*r^4 + k3*r^6)
y_radial = y * (1 + k1*r^2 + k2*r^4 + k3*r^6)
```

**Why this form?** The distortion is **radially symmetric**, so it must depend only on `r`. A smooth symmetric function can be represented by a power series in `r^2`.

![Barrel distortion](images/barrel_distortion.svg)

Attribution: Wikimedia Commons, “Barrel distortion” (Public Domain), https://commons.wikimedia.org/wiki/File:Barrel_distortion.svg

![Pincushion distortion](images/pincushion_distortion.svg)

Attribution: Wikimedia Commons, “Pincushion distortion” (Public Domain), https://commons.wikimedia.org/wiki/File:Pincushion_distortion.svg

### Tangential distortion (decentering)

Tangential distortion occurs when lens elements are slightly off-center. With coefficients `p1`, `p2`:

```
x_tan = 2*p1*x*y + p2*(r^2 + 2*x^2)
y_tan = p1*(r^2 + 2*y^2) + 2*p2*x*y
```

**Why this form?** If the lens is slightly decentered, the distortion depends on **cross terms** (`x*y`) and axis‑biased terms (`x^2`, `y^2`). These are the lowest‑order terms that model asymmetric shifts.

The final distorted coordinate is:

```
x_d = x_radial + x_tan
y_d = y_radial + y_tan
```

This generic radial+tangential model is widely used in camera calibration.

## 3. Adding a generic lens mapping

Replace the pinhole `r = tan(theta)` with a generic mapping:

```
r_d = f(theta)
```

Examples:

- Perspective: `r = f * tan(theta)`
- Equidistant: `r = f * theta`
- OpenCV fisheye: `r_d = theta * (1 + k1*theta^2 + k2*theta^4 + k3*theta^6 + k4*theta^8)`

fisheye.js uses the OpenCV fisheye model, so the lens mapping is polynomial in `theta`.

## 4. Fisheye valid region (image circle)

Fisheye images often form a **circular image** inside a rectangular frame. The valid region is typically:

```
r <= r_max
```

where `r_max` is the radius of the image circle.

### 4.1 How to estimate r_max

Practical methods:

1. **Vignetting boundary**: detect where brightness sharply falls off (see `02-camera-lens-basics.md`).
2. **Edge detection**: find the circular boundary of the lens image.
3. **Calibration data**: use known circle radius from camera specs or calibration.

Once you know `r_max`, you can mask or clamp pixels outside this radius.

## 5. Dewarping method (inverse mapping)

fisheye.js uses **output-driven sampling**:

1. For each output pixel, compute its normalized coordinate.
2. Convert to angle `theta = atan(r)`.
3. Apply the OpenCV polynomial to get `theta_d`.
4. Compute distorted radius `r_d = theta_d`.
5. Map to the source pixel and sample.

This is the **inverse mapping** method, which avoids holes in the output image.

```mermaid
flowchart LR
  OutputPx["Output pixel"] --> Norm["Normalize to (u,v)"]
  Norm --> Theta["theta = atan(r)"]
  Theta --> Distort["r_d = f(theta)"]
  Distort --> Sample["Sample input"]
```

## What to remember

- The generic camera model is “projection + lens mapping.”
- Pinhole projection uses the intrinsics matrix `K`.
- The fisheye valid region is often a circle; detect it via vignetting or edges.
- Dewarping is usually done with **inverse mapping** per output pixel.
