# End-to-End Example and Checklist

This module is a single, complete walkthrough from world coordinates to output pixels. It ties together the math in one place.

**Prerequisites:** `04-project-pipeline.md`  
**Next:** `05-configuration-tuning.md`

## 1. Full formula chain (one screen)

```
X_c = R^T (X_w - C)
x = X_c / Z_c
y = Y_c / Z_c
r = sqrt(x^2 + y^2)
theta = atan(r)
r_d = f(theta)  // fisheye mapping
x_d = x * (r_d / r)
y_d = y * (r_d / r)
[u v 1]^T = K [x_d y_d 1]^T
```

If you can follow every line above, you understand the full pipeline.

## 2. Numeric example (start to finish)

Assume:

- `C = (1, 2, 3)`
- `R = I`
- `K = [[800, 0, 320], [0, 800, 240], [0, 0, 1]]`
- `X_w = (2, 4, 7)`
- Equidistant mapping: `r_d = theta`

Step 1: world -> camera:

```
X_c = (1, 2, 4)
```

Step 2: normalize:

```
x = 1/4 = 0.25
y = 2/4 = 0.5
```

Step 3: radius + angle:

```
r = sqrt(0.25^2 + 0.5^2) ≈ 0.559
theta = atan(r) ≈ 0.510
```

Step 4: fisheye mapping:

```
r_d = theta ≈ 0.510
scale = r_d / r ≈ 0.913
x_d ≈ 0.228
y_d ≈ 0.456
```

Step 5: pixels:

```
u = 800*0.228 + 320 ≈ 502
v = 800*0.456 + 240 ≈ 605
```

Final pixel: `(u, v) ≈ (502, 605)`.

## 3. Quick checklist (debug order)

1. **Units**: angles in radians, pixels in integers.
2. **Axes**: confirm world vs camera axes (FLU/RDF).
3. **K update**: crop/resize applied correctly.
4. **Mapping**: `r_d = theta_d` for OpenCV fisheye.
5. **Center**: lens center offsets applied before radius.

## 4. One‑page flow summary

```mermaid
flowchart LR
  Xw["World point X_w"] --> Cam["X_c = R^T (X_w - C)"]
  Cam --> Norm["x = X_c/Z_c, y = Y_c/Z_c"]
  Norm --> Theta["theta = atan(r)"]
  Theta --> Map["r_d = f(theta)"]
  Map --> Dist["x_d = x * r_d/r"]
  Dist --> Pix["[u v 1]^T = K [x_d y_d 1]^T"]
```

## 4. Interpretation

- If the result is too wide: check FOV or `fx/fy`.
- If the image is off-center: check `(cx, cy)` or `(centerX, centerY)`.
- If edges look wrong: verify `r_d = theta_d` and zoom.
