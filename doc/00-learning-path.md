# Learning Path Overview

This page summarizes the recommended order and the goal of each module.

## Core path

1. **Linear Algebra Foundations**: vectors, norms, and angle derivations.
2. **World/Camera Transforms**: rotation, translation, and coordinate frames.
3. **Camera and Lens Basics**: pinhole projection, FOV, lens mappings.
4. **Calibration**: intrinsics, extrinsics, and how to update them.
5. **Generic Camera Model**: projection + distortion + valid region.
6. **OpenCV Fisheye Model**: the exact polynomial used here.
7. **Project Pipeline**: how the shader applies the model.
8. **End-to-End Example**: full numeric chain from world to pixel.
9. **Tuning**: how to interpret and adjust parameters.
10. **GPU Abstraction**: why TypeGPU/WebGPU is used.
11. **Validation**: how we verify the model is correct.

## How to use this path

- If you are new to camera math, follow the order strictly.
- If you already know calibration, jump to the fisheye model and pipeline.
