"""
Generate comprehensive test cases for fisheye.js E2E tests.
Creates reference images for various projection modes and parameters.

Paths: All paths are resolved relative to this script's directory (test/fixture/).
Fixture images: original/ holds source fisheye images; rectilinear/valid_region/
holds COLMAP-style reference images. This script generates OpenCV-based
reference images for E2E tests; you can add your own camera images under original/.
"""
import json
import cv2
import numpy as np
import os

# Resolve paths relative to this script so CWD does not matter
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Camera configurations (OPENCV_FISHEYE; camera_id 1 = fisheye1, 2 = fisheye2)
CAMERAS = {
    1: {
        "camera_id": 1,
        "camera_model": "Wide Angle Fisheye",
        "image_width": 3264,
        "image_height": 3264,
        "camera_matrix": {"fx": 991.0, "fy": 991.0, "cx": 1612.0, "cy": 1617.0},
        "distortion_coefficients": {"k1": 0.03562009, "k2": -0.02587979, "k3": 0.00564249, "k4": -0.00107043},
    },
    2: {
        "camera_id": 2,
        "camera_model": "Ultra Wide Fisheye",
        "image_width": 3264,
        "image_height": 3264,
        "camera_matrix": {"fx": 991.0, "fy": 991.0, "cx": 1612.0, "cy": 1617.0},
        "distortion_coefficients": {"k1": 0.02494321, "k2": 0.0049985, "k3": -0.01754164, "k4": 0.00455207},
    },
}

# Source images: (path relative to fixture dir, camera_id). Stored under original/.
SOURCES = [
    ("original/cam1_01.jpg", 1),
    ("original/cam1_02.jpg", 1),
    ("original/cam1_03.jpg", 1),
    ("original/cam2_01.jpg", 2),
    ("original/cam2_02.jpg", 2),
    ("original/cam2_03.jpg", 2),
]

# Output layout: projection / variant (well-known output mode).
# Each scenario writes to <output_subpath>/<source_key>.jpg (e.g. rectilinear/natural/cam1_01.jpg).
TEST_SCENARIOS = [
    # Natural rectilinear projection (preserves original focal length)
    {
        "name": "rectilinear_natural",
        "description": "Natural rectilinear projection preserving original focal length",
        "projection": "rectilinear",
        "output_subpath": "rectilinear/natural",
        "manual_fx": 991.0,
        "manual_fy": 991.0,
        "output_scale": 1.0,
    },
    # Manual newFx/newFy test scenarios for visual inspection
    {
        "name": "rectilinear_manual_fx_original",
        "description": "Manual newFx = original fx (991) - Natural look",
        "projection": "rectilinear",
        "output_subpath": "rectilinear/manual_fx/original",
        "manual_fx": 991.0,
        "manual_fy": 991.0,
        "output_scale": 1.0,
    },
    {
        "name": "rectilinear_manual_fx_120pct",
        "description": "Manual newFx = 120% of original (1189.2) - Zoomed in",
        "projection": "rectilinear",
        "output_subpath": "rectilinear/manual_fx/120pct",
        "manual_fx": 1189.2,  # 991 * 1.2
        "manual_fy": 1189.2,
        "output_scale": 1.0,
    },
    {
        "name": "rectilinear_manual_fx_80pct",
        "description": "Manual newFx = 80% of original (792.8) - Slightly wider",
        "projection": "rectilinear",
        "output_subpath": "rectilinear/manual_fx/80pct",
        "manual_fx": 792.8,  # 991 * 0.8
        "manual_fy": 792.8,
        "output_scale": 1.0,
    },
    {
        "name": "rectilinear_manual_fx_60pct",
        "description": "Manual newFx = 60% of original (594.6) - Wider FOV",
        "projection": "rectilinear",
        "output_subpath": "rectilinear/manual_fx/60pct",
        "manual_fx": 594.6,  # 991 * 0.6
        "manual_fy": 594.6,
        "output_scale": 1.0,
    },
    {
        "name": "rectilinear_manual_fx_40pct",
        "description": "Manual newFx = 40% of original (396.4) - Very wide FOV",
        "projection": "rectilinear",
        "output_subpath": "rectilinear/manual_fx/40pct",
        "manual_fx": 396.4,  # 991 * 0.4
        "manual_fy": 396.4,
        "output_scale": 1.0,
    },
    {
        "name": "rectilinear_manual_fx_20pct",
        "description": "Manual newFx = 20% of original (198.2) - Extremely wide FOV",
        "projection": "rectilinear",
        "output_subpath": "rectilinear/manual_fx/20pct",
        "manual_fx": 198.2,  # 991 * 0.2
        "manual_fy": 198.2,
        "output_scale": 1.0,
    },
    {
        "name": "equirectangular_panorama",
        "description": "Equirectangular projection for 360 panorama stitching",
        "projection": "equirectangular",
        "output_subpath": "equirectangular/panorama",
        "balance": 0.0,
        "fov_scale": 1.0,
        "output_scale": 1.0,
    },
    {
        "name": "cylindrical_panorama",
        "description": "Cylindrical projection for panorama (unrolled cylinder)",
        "projection": "cylindrical",
        "output_subpath": "cylindrical/panorama",
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


def create_cylindrical_map(K, D, input_size, output_size):
    """
    Create remap matrices for cylindrical projection (unrolled cylinder).
    Horizontal: longitude maps linearly to x. Vertical: lat = atan((y - center) / f_cyl).
    Maps from cylindrical output to fisheye input.
    """
    out_w, out_h = output_size
    in_w, in_h = input_size

    fx, fy = K[0, 0], K[1, 1]
    cx, cy = K[0, 2], K[1, 2]
    k1, k2, k3, k4 = D[0, 0], D[1, 0], D[2, 0], D[3, 0]

    # Cylinder vertical scale: same as horizontal so 360° width ~ 2*pi, vertical tan(lat) scale
    f_cyl = out_w / (2.0 * np.pi)

    map_x = np.zeros((out_h, out_w), dtype=np.float32)
    map_y = np.zeros((out_h, out_w), dtype=np.float32)

    for y in range(out_h):
        for x in range(out_w):
            # Cylindrical: lon linear, lat via tan (unrolled cylinder)
            lon = (x / out_w - 0.5) * 2 * np.pi  # -pi to pi
            lat = np.arctan((y - out_h * 0.5) / f_cyl)  # vertical

            # 3D direction
            cos_lat = np.cos(lat)
            dir_x = np.sin(lon) * cos_lat
            dir_y = np.sin(lat)
            dir_z = np.cos(lon) * cos_lat

            if dir_z <= 0.001:
                map_x[y, x] = -1
                map_y[y, x] = -1
                continue

            norm_x = dir_x / dir_z
            norm_y = dir_y / dir_z

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

            u = fx * distorted_x + cx
            v = fy * distorted_y + cy

            map_x[y, x] = u
            map_y[y, x] = v

    return map_x, map_y


def rotation_yaw_deg(yaw_deg: float) -> np.ndarray:
    """
    Rotation matrix for yaw (around Y axis) in degrees.
    OpenCV camera: Z forward, X right, Y down. yaw=0 = front, yaw=90 = look left.
    """
    th = np.radians(yaw_deg)
    c, s = np.cos(th), np.sin(th)
    return np.array(
        [[c, 0, s], [0, 1, 0], [-s, 0, c]],
        dtype=np.float64,
    )


def estimate_new_camera_matrix_fisheye(K, D, image_size, R, balance, new_size, fov_scale):
    """
    Replicate OpenCV fisheye.estimateNewCameraMatrixForUndistortRectify logic
    so balance/fov_scale are applied correctly (Python binding may misorder optional args).
    C++ ref: opencv/modules/calib3d/src/fisheye.cpp
    """
    w, h = image_size[0], image_size[1]
    balance = max(0.0, min(1.0, balance))

    # Four corner points in pixel coords (same as OpenCV)
    points = np.array(
        [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]],
        dtype=np.float64,
    ).reshape(1, 4, 2)

    # Undistort with R (identity) and no P → normalized coords
    undist = cv2.fisheye.undistortPoints(
        points, K, D, R=np.eye(3) if R is None else R, P=None
    )
    undist = undist.reshape(4, 2)

    center_mass = np.mean(undist, axis=0)
    cn = center_mass.copy()

    aspect_ratio = K[0, 0] / K[1, 1]
    cn[1] *= aspect_ratio
    scaled = undist.copy()
    scaled[:, 1] *= aspect_ratio

    minx = np.min(scaled[:, 0])
    maxx = np.max(scaled[:, 0])
    miny = np.min(scaled[:, 1])
    maxy = np.max(scaled[:, 1])

    f1 = w * 0.5 / (cn[0] - minx)
    f2 = w * 0.5 / (maxx - cn[0])
    f3 = (h * 0.5 * aspect_ratio) / (cn[1] - miny)
    f4 = (h * 0.5 * aspect_ratio) / (maxy - cn[1])

    fmin = min(f1, f2, f3, f4)
    fmax = max(f1, f2, f3, f4)

    f = balance * fmin + (1.0 - balance) * fmax
    if fov_scale > 0:
        f *= 1.0 / fov_scale

    new_fx = f
    new_fy = f
    new_cx = -cn[0] * f + w * 0.5
    new_cy = (-cn[1] * f) / aspect_ratio + h * 0.5

    # Restore aspect in y
    new_fy /= aspect_ratio
    new_cy /= aspect_ratio

    if new_size and (new_size[0] != w or new_size[1] != h):
        rx = new_size[0] / float(w)
        ry = new_size[1] / float(h)
        new_fx *= rx
        new_fy *= ry
        new_cx *= rx
        new_cy *= ry

    return np.array(
        [
            [new_fx, 0, new_cx],
            [0, new_fy, new_cy],
            [0, 0, 1],
        ],
        dtype=np.float64,
    )


def _build_pane_test_cases(
    scenario, source_filename, source_key, camera, balance, fov_scale,
    in_w, in_h, out_w, out_h, new_K, results_per_pane
):
    """Build a list of test case dicts for multi-pane (one per pane)."""
    cases = []
    for item in results_per_pane:
        dewarped_image_path = item["dewarped_image_path"]
        pane_id = item["pane_id"]
        yaw_deg = item["yaw_deg"]
        tc = {
            "camera_id": camera["camera_id"],
            "scenario": scenario["name"],
            "description": scenario["description"],
            "original_image_path": source_filename,
            "dewarped_image_path": dewarped_image_path,
            "image_width": in_w,
            "image_height": in_h,
            "output_width": out_w,
            "output_height": out_h,
            "camera_matrix": camera["camera_matrix"],
            "distortion_coefficients": camera["distortion_coefficients"],
            "projection": "rectilinear",
            "balance": balance,
            "fov_scale": fov_scale,
            "pane_id": pane_id,
            "yaw_deg": yaw_deg,
        }
        tc["new_camera_matrix"] = {
            "fx": float(new_K[0, 0]),
            "fy": float(new_K[1, 1]),
            "cx": float(new_K[0, 2]),
            "cy": float(new_K[1, 2]),
        }
        cases.append(tc)
    return cases


def resolve_fixture_path(path: str) -> str:
    """Resolve path relative to fixture dir (script dir) if not absolute."""
    if os.path.isabs(path):
        return path
    return os.path.join(SCRIPT_DIR, path)


def generate_test_image(camera, scenario, source_filename: str, source_key: str):
    """Generate a single test case image. Writes to <fixture>/<output_subpath>/<source_key>.jpg."""
    # Load original image (path relative to fixture dir)
    input_path = resolve_fixture_path(source_filename)
    img = cv2.imread(input_path)
    if img is None:
        raise ValueError(f"Could not load {input_path}")

    output_subpath = scenario["output_subpath"]
    output_dir = os.path.join(SCRIPT_DIR, output_subpath)
    os.makedirs(output_dir, exist_ok=True)

    in_h, in_w = img.shape[:2]
    calib_w = camera["image_width"]
    calib_h = camera["image_height"]

    # Scale K to loaded image size if it differs from calibration resolution
    # (D is in angular space and does not scale)
    scale_w = in_w / calib_w
    scale_h = in_h / calib_h
    if abs(scale_w - 1.0) > 1e-6 or abs(scale_h - 1.0) > 1e-6:
        fx = camera["camera_matrix"]["fx"] * scale_w
        fy = camera["camera_matrix"]["fy"] * scale_h
        cx = camera["camera_matrix"]["cx"] * scale_w
        cy = camera["camera_matrix"]["cy"] * scale_h
    else:
        fx = camera["camera_matrix"]["fx"]
        fy = camera["camera_matrix"]["fy"]
        cx = camera["camera_matrix"]["cx"]
        cy = camera["camera_matrix"]["cy"]

    K = np.array(
        [[fx, 0, cx], [0, fy, cy], [0, 0, 1]],
        dtype=np.float64,
    )
    D = np.array(
        [
            [camera["distortion_coefficients"]["k1"]],
            [camera["distortion_coefficients"]["k2"]],
            [camera["distortion_coefficients"]["k3"]],
            [camera["distortion_coefficients"]["k4"]],
        ],
        dtype=np.float64,
    )

    # Calculate output size
    out_w = int(in_w * scenario["output_scale"])
    out_h = int(in_h * scenario["output_scale"])

    projection = scenario["projection"]
    balance = scenario.get("balance", 0.0)
    fov_scale = scenario.get("fov_scale", 1.0)
    manual_fx = scenario.get("manual_fx")
    manual_fy = scenario.get("manual_fy")

    if projection == "rectilinear" and manual_fx is not None and manual_fy is not None:
        # Manual focal length: user specifies newFx and newFy directly
        # Scale to output size
        rx = out_w / in_w
        ry = out_h / in_h
        
        new_K = np.array(
            [[manual_fx * rx, 0, out_w / 2.0],
             [0, manual_fy * ry, out_h / 2.0],
             [0, 0, 1]],
            dtype=np.float64,
        )
        
        print(f"    Manual newFx={manual_fx:.2f}, newFy={manual_fy:.2f} (scaled: {manual_fx*rx:.2f}, {manual_fy*ry:.2f})")
        
        # Generate undistortion maps
        map1, map2 = cv2.fisheye.initUndistortRectifyMap(
            K, D, np.eye(3), new_K, (out_w, out_h), cv2.CV_32FC1
        )
        
        result = cv2.remap(img, map1, map2, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)

    elif projection == "rectilinear":
        # Use OpenCV's native function directly
        new_K = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(
            K, D, (in_w, in_h), np.eye(3), balance=balance, new_size=(out_w, out_h), fov_scale=fov_scale
        )

        # Generate undistortion maps
        map1, map2 = cv2.fisheye.initUndistortRectifyMap(
            K, D, np.eye(3), new_K, (out_w, out_h), cv2.CV_32FC1
        )

        result = cv2.remap(img, map1, map2, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)

    elif projection == "rectilinear_panes":
        # VMS-style multi-pane: one rectilinear view per pane with view direction (R).
        new_K = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(
            K, D, (in_w, in_h), np.eye(3), balance=balance, new_size=(out_w, out_h), fov_scale=fov_scale
        )
        panes = scenario["panes"]
        results_per_pane = []
        for pane in panes:
            pane_id = pane["id"]
            yaw_deg = pane["yaw_deg"]
            R_pane = rotation_yaw_deg(yaw_deg)
            map1, map2 = cv2.fisheye.initUndistortRectifyMap(
                K, D, R_pane, new_K, (out_w, out_h), cv2.CV_32FC1
            )
            result_pane = cv2.remap(
                img, map1, map2, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT
            )
            pane_dir = os.path.join(output_dir, pane_id)
            os.makedirs(pane_dir, exist_ok=True)
            out_filename = f"{source_key}.jpg"
            out_path = os.path.join(pane_dir, out_filename)
            dewarped_path = f"{output_subpath}/{pane_id}/{out_filename}"
            cv2.imwrite(out_path, result_pane)
            print(f"  Generated: {dewarped_path} ({out_w}x{out_h}) pane={pane_id} yaw={yaw_deg}°")
            results_per_pane.append(
                {
                    "dewarped_image_path": dewarped_path,
                    "pane_id": pane_id,
                    "yaw_deg": yaw_deg,
                    "result_image": result_pane,
                }
            )
        # Return multiple test cases (handled in main())
        return _build_pane_test_cases(
            scenario, source_filename, source_key, camera, balance, fov_scale,
            in_w, in_h, out_w, out_h, new_K, results_per_pane
        )

    elif projection == "equirectangular":
        # Custom equirectangular projection
        map_x, map_y = create_equirectangular_map(K, D, (in_w, in_h), (out_w, out_h))
        result = cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        new_K = None  # Not applicable for equirectangular

    elif projection == "cylindrical":
        # Custom cylindrical projection (unrolled cylinder)
        map_x, map_y = create_cylindrical_map(K, D, (in_w, in_h), (out_w, out_h))
        result = cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        new_K = None  # Not applicable for cylindrical

    elif projection == "original":
        # Pass-through (just resize if needed)
        if scenario["output_scale"] != 1.0:
            result = cv2.resize(img, (out_w, out_h), interpolation=cv2.INTER_LINEAR)
        else:
            result = img.copy()
        new_K = K.copy()
    else:
        raise ValueError(f"Unknown projection: {projection}")

    # Output: <output_subpath>/<source_key>.jpg (e.g. rectilinear/balanced/cam1_01.jpg)
    output_filename = f"{source_key}.jpg"
    output_path = os.path.join(output_dir, output_filename)
    dewarped_image_path = f"{output_subpath}/{output_filename}"

    cv2.imwrite(output_path, result)
    print(f"  Generated: {dewarped_image_path} ({out_w}x{out_h})")

    # Return test case metadata
    test_case = {
        "camera_id": camera["camera_id"],
        "scenario": scenario["name"],
        "description": scenario["description"],
        "original_image_path": source_filename,
        "dewarped_image_path": dewarped_image_path,
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
        
        # Add manual_fx info if applicable
        if manual_fx is not None and manual_fy is not None:
            test_case["manual_fx"] = manual_fx
            test_case["manual_fy"] = manual_fy

    return test_case


def main():
    print("Generating comprehensive test cases for fisheye.js")
    print("=" * 60)

    all_test_cases = []

    for source_filename, camera_id in SOURCES:
        camera = CAMERAS[camera_id]
        # source_key = base name without extension (e.g. cam1_01 from original/cam1_01.jpg)
        source_key = os.path.splitext(os.path.basename(source_filename))[0]
        print(f"\nSource: {source_filename} (camera {camera_id}: {camera['camera_model']})")
        print("-" * 40)

        for scenario in TEST_SCENARIOS:
            print(f"  Scenario: {scenario['name']}")
            try:
                result = generate_test_image(
                    camera, scenario, source_filename, source_key
                )
                if isinstance(result, list):
                    all_test_cases.extend(result)
                else:
                    all_test_cases.append(result)
            except Exception as e:
                print(f"    ERROR: {e}")

    # Save test data JSON to fixture dir
    output_json = os.path.join(SCRIPT_DIR, "test_cases.json")
    with open(output_json, "w") as f:
        json.dump(all_test_cases, f, indent=2)

    print(f"\n{'=' * 60}")
    print(f"Generated {len(all_test_cases)} test cases")
    print(f"Test data saved to: {output_json}")

    # Print summary
    print("\nTest Case Summary:")
    print("-" * 60)
    for tc in all_test_cases:
        print(f"  {tc['original_image_path']} / {tc['scenario']}: "
              f"{tc['output_width']}x{tc['output_height']} "
              f"({tc['projection']}, balance={tc['balance']}, fov={tc['fov_scale']})")


if __name__ == "__main__":
    main()
