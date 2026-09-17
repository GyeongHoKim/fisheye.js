# ONVIF lens support and native WebGPU tests

Issue: https://github.com/GyeongHoKim/fisheye.js/issues/8

## Accepted design

One Fisheye API, backward-compatible flat/grouped OpenCV options, explicit opencv/onvif lens union. Separate browser VideoFrame transport from a GPUDevice-injected texture engine. ONVIF uses degree/radius samples, implicit origin, natural cubic interpolation (linear for two internal points), normalized Offset/XFactor, and invalid-ray masking. Default rectilinear horizontal FOV is 90 degrees; manual output intrinsics are supported. balance/fovScale remain OpenCV-only. All projections, PTZ and pane modes apply. Lens replacement is atomic. Optional focalLength/transmittance are retained but not applied. No SOAP, XML parser, automatic crop/rotation/mirror/SceneOrientation, public Node API, merge or release.

Native tests execute the production TypeGPU core under Node Dawn with Lavapipe in a pinned Linux amd64 container. Required CI runs CPU and native GPU tests serially, fails on wrong/unavailable software adapter, GPU errors/loss/timeouts, and checks independent numeric references. Browser tests shrink to real VideoFrame smoke coverage. Test ten repeated native runs without retries. Archive official PDF/XSD with hashes/notices and distinguish implementation choices and synthetic validation from real-device certification.

## Tasks

- [x] Register issue and create isolated branch/worktree.
- [x] Record baseline checks.
- [x] Implement and unit-test independent ONVIF spline and types.
- [x] Extract shared texture compute core and preserve OpenCV regressions.
- [x] Add native Dawn tests and pinned Lavapipe CI/container.
- [x] Integrate ONVIF config, shaders, projection/PTZ/panes and update lifecycle.
- [x] Archive specifications and update README, learning docs and PR checklist.
- [x] Verify lint/types/build/unit/native, repeated container runs, browser smoke and example build.
- [x] Review complete diff and hand off branch without merge/publication.

## Validation

Math tests cover known interpolation values, origin, endpoints, monotonicity, non-finite/invalid inputs. API tests cover both legacy forms and new lens forms, conflicts, FOV/manual defaults, updates and switches. Native tests cover independent ray-to-pixel and color expectations, masks, offset/aspect, every projection, PTZ/panes, resizing/readback alignment/resource cleanup; interior coordinate target <=0.1 pixel. Existing image scenarios retain comparison coverage using fixed decoded RGBA/lossless data. Browser smoke checks actual frame ingress/egress, timestamps and close semantics. Required scripts: lint, type-check, build, test:unit, test:gpu, test:browser, example:build.

## Progress

Implementation started from ba0fe01. No pre-existing worktree changes.
Baseline lint, type check, build and 32 unit tests pass. User additionally requested latest TypeGPU: registry reports typegpu 0.12.5 and unplugin-typegpu 0.12.3; upgrade both with exact pins and validate the same production GPU paths.

Final verification: 50 unit tests, 5 production-pipeline native GPU tests, ten retry-free Lavapipe repetitions, Chromium VideoFrame smoke, lint, type-check, package build and example build pass. The fixed container uses Node 24.13.0 on Debian trixie, Mesa 25.0.7 Lavapipe from the 2026-02-10 Debian snapshot, and `webgpu` 0.6.1.
