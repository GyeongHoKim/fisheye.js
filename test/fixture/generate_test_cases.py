"""
Generate comprehensive test cases for fisheye.js E2E tests.
Creates reference images for various projection modes and parameters.
"""
import json
import cv2
import numpy as np
import os

# Camera configurations (from real fisheye cameras)
CAMERAS = [
    {
        "camera_id": 1,
        "camera_model": "Wide Angle Fisheye",
        "image_width": 3264,
        "image_height": 3264,
        "original_image_path": "cam1_original.jpg",
        "camera_matrix": {"fx": 991.0, "fy": 991.0, "cx": 1612.0, "cy": 1617.0},
        "distortion_coefficients": {"k1": 0.03562009, "k2": -0.02587979, "k3": 0.00564249, "k4": -0.00107043},
    },
    {
        "camera_id": 2,
        "camera_model": "Ultra Wide Fisheye",
        "image_width": 3264,
        "image_height": 3264,
        "original_image_path": "cam2_original.jpg",
        "camera_matrix": {"fx": 991.0, "fy": 991.0, "cx": 1612.0, "cy": 1617.0},
        "distortion_coefficients": {"k1": 0.02494321, "k2": 0.0049985, "k3": -0.01754164, "k4": 0.00455207},
    },
]

# Test scenarios representing real-world use cases
TEST_SCENARIOS = [
    {
        "name": "rectilinear_balanced",
        "description": "Rectilinear projection with balanced FOV (typical surveillance/webcam use)",
        "projection": "rectilinear",
        "balance": 0.5,
        "fov_scale": 1.0,
        "output_scale": 1.0,  # Same size as input
    },
    {
        "name": "rectilinear_full_fov",
        "description": "Rectilinear projection preserving full FOV (maximum coverage)",
        "projection": "rectilinear",
        "balance": 1.0,
        "fov_scale": 1.0,
        "output_scale": 1.0,
    },
    {
        "name": "rectilinear_zoomed",
        "description": "Rectilinear projection with zoom for detail (video conferencing)",
        "projection": "rectilinear",
        "balance": 0.5,
        "fov_scale": 0.7,  # Zoom in
        "output_scale": 0.5,  # Smaller output for performance
    },
    {
        "name": "equirectangular_panorama",
        "description": "Equirectangular projection for 360 panorama stitching",
        "projection": "equirectangular",
        "balance": 0.0,
        "fov_scale": 1.0,
        "output_scale": 1.0,
    },
]


def create_equirectangular_map(K, D, input_size, output_size):
    """
    Create remap matrices for equirectangular projection.
    This maps from equirectangular output to fisheye input.
    """
    out_w, out_h = output_size
    in_w, in_h = input_size

    fx, fy = K[0, 0], K[1, 1]
    cx, cy = K[0, 2], K[1, 2]
    k1, k2, k3, k4 = D[0, 0], D[1, 0], D[2, 0], D[3, 0]

    # Create output coordinate grids
    map_x = np.zeros((out_h, out_w), dtype=np.float32)
    map_y = np.zeros((out_h, out_w), dtype=np.float32)

    for y in range(out_h):
        for x in range(out_w):
            # Convert to equirectangular angles
            lon = (x / out_w - 0.5) * 2 * np.pi  # -pi to pi
            lat = (y / out_h - 0.5) * np.pi      # -pi/2 to pi/2

            # Convert to 3D direction
            cos_lat = np.cos(lat)
            dir_x = np.sin(lon) * cos_lat
            dir_y = np.sin(lat)
            dir_z = np.cos(lon) * cos_lat

            # Only process front hemisphere
            if dir_z <= 0.001:
                map_x[y, x] = -1
                map_y[y, x] = -1
                continue

            # Project to normalized coordinates (pinhole)
            norm_x = dir_x / dir_z
            norm_y = dir_y / dir_z

            # Apply fisheye distortion (forward model)
            r = np.sqrt(norm_x**2 + norm_y**2)
            theta = np.arctan(r)
            theta2 = theta * theta
            theta4 = theta2 * theta2
            theta6 = theta4 * theta2
            theta8 = theta4 * theta4
            theta_d = theta * (1 + k1*theta2 + k2*theta4 + k3*theta6 + k4*theta8)

            if r < 1e-8:
                scale = 1.0
            else:
                scale = theta_d / r

            distorted_x = norm_x * scale
            distorted_y = norm_y * scale

            # Convert to pixel coordinates
            u = fx * distorted_x + cx
            v = fy * distorted_y + cy

            map_x[y, x] = u
            map_y[y, x] = v

    return map_x, map_y


def generate_test_image(camera, scenario, output_dir="."):
    """Generate a single test case image."""

    # Load original image
    img = cv2.imread(camera["original_image_path"])
    if img is None:
        raise ValueError(f"Could not load {camera['original_image_path']}")

    in_h, in_w = img.shape[:2]

    # Prepare camera matrix and distortion
    K = np.array([
        [camera["camera_matrix"]["fx"], 0, camera["camera_matrix"]["cx"]],
        [0, camera["camera_matrix"]["fy"], camera["camera_matrix"]["cy"]],
        [0, 0, 1]
    ], dtype=np.float64)

    D = np.array([
        [camera["distortion_coefficients"]["k1"]],
        [camera["distortion_coefficients"]["k2"]],
        [camera["distortion_coefficients"]["k3"]],
        [camera["distortion_coefficients"]["k4"]]
    ], dtype=np.float64)

    # Calculate output size
    out_w = int(in_w * scenario["output_scale"])
    out_h = int(in_h * scenario["output_scale"])

    projection = scenario["projection"]
    balance = scenario["balance"]
    fov_scale = scenario["fov_scale"]

    if projection == "rectilinear":
        # Use OpenCV's fisheye undistortion
        new_K = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(
            K, D, (in_w, in_h), np.eye(3),
            balance=balance,
            fov_scale=fov_scale,
            new_size=(out_w, out_h)
        )

        # Generate undistortion maps
        map1, map2 = cv2.fisheye.initUndistortRectifyMap(
            K, D, np.eye(3), new_K, (out_w, out_h), cv2.CV_32FC1
        )

        result = cv2.remap(img, map1, map2, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)

    elif projection == "equirectangular":
        # Custom equirectangular projection
        map_x, map_y = create_equirectangular_map(K, D, (in_w, in_h), (out_w, out_h))
        result = cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        new_K = None  # Not applicable for equirectangular

    elif projection == "original":
        # Pass-through (just resize if needed)
        if scenario["output_scale"] != 1.0:
            result = cv2.resize(img, (out_w, out_h), interpolation=cv2.INTER_LINEAR)
        else:
            result = img.copy()
        new_K = K.copy()
    else:
        raise ValueError(f"Unknown projection: {projection}")

    # Generate output filename
    output_filename = f"cam{camera['camera_id']}_{scenario['name']}.jpg"
    output_path = os.path.join(output_dir, output_filename)

    cv2.imwrite(output_path, result)
    print(f"  Generated: {output_filename} ({out_w}x{out_h})")

    # Return test case metadata
    test_case = {
        "camera_id": camera["camera_id"],
        "scenario": scenario["name"],
        "description": scenario["description"],
        "original_image_path": camera["original_image_path"],
        "dewarped_image_path": output_filename,
        "image_width": in_w,
        "image_height": in_h,
        "output_width": out_w,
        "output_height": out_h,
        "camera_matrix": camera["camera_matrix"],
        "distortion_coefficients": camera["distortion_coefficients"],
        "projection": projection,
        "balance": balance,
        "fov_scale": fov_scale,
    }

    # Add new camera matrix for rectilinear projection
    if new_K is not None and projection == "rectilinear":
        test_case["new_camera_matrix"] = {
            "fx": float(new_K[0, 0]),
            "fy": float(new_K[1, 1]),
            "cx": float(new_K[0, 2]),
            "cy": float(new_K[1, 2]),
        }

    return test_case


def main():
    print("Generating comprehensive test cases for fisheye.js")
    print("=" * 60)

    all_test_cases = []

    for camera in CAMERAS:
        print(f"\nCamera {camera['camera_id']}: {camera['camera_model']}")
        print("-" * 40)

        for scenario in TEST_SCENARIOS:
            print(f"  Scenario: {scenario['name']}")
            try:
                test_case = generate_test_image(camera, scenario)
                all_test_cases.append(test_case)
            except Exception as e:
                print(f"    ERROR: {e}")

    # Save test data JSON
    output_json = "test_cases.json"
    with open(output_json, "w") as f:
        json.dump(all_test_cases, f, indent=2)

    print(f"\n{'=' * 60}")
    print(f"Generated {len(all_test_cases)} test cases")
    print(f"Test data saved to: {output_json}")

    # Print summary
    print("\nTest Case Summary:")
    print("-" * 60)
    for tc in all_test_cases:
        print(f"  Camera {tc['camera_id']} / {tc['scenario']}: "
              f"{tc['output_width']}x{tc['output_height']} "
              f"({tc['projection']}, balance={tc['balance']}, fov={tc['fov_scale']})")


if __name__ == "__main__":
    main()
