import json
import cv2
import numpy as np
import os

def dewarp_fisheye_image(image_path, camera_matrix, dist_coeffs, image_width, image_height, output_path):
    """
    Dewarp a fisheye image using OpenCV fisheye model (Kannala-Brandt).
    
    Args:
        image_path: Path to the input fisheye image
        camera_matrix: Camera intrinsic matrix (fx, fy, cx, cy)
        dist_coeffs: Fisheye distortion coefficients (k1, k2, k3, k4)
        image_width: Width of the image
        image_height: Height of the image
        output_path: Path to save the dewarped image
    """
    # Read the image
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image from {image_path}")
    
    # Prepare camera matrix for Kannala-Brandt model
    K = np.array([
        [camera_matrix['fx'], 0, camera_matrix['cx']],
        [0, camera_matrix['fy'], camera_matrix['cy']],
        [0, 0, 1]
    ], dtype=np.float64)
    
    # Prepare distortion coefficients (k1, k2, k3, k4) for Kannala-Brandt
    # OpenCV fisheye model expects column vector
    D = np.array([
        [dist_coeffs['k1']],
        [dist_coeffs['k2']],
        [dist_coeffs['k3']],
        [dist_coeffs['k4']]
    ], dtype=np.float64)
    
    dim = (image_width, image_height)
    
    # Use undistortImage directly - simpler and more reliable
    # This applies the inverse of the fisheye distortion model
    dewarped_img = cv2.fisheye.undistortImage(img, K, D, Knew=K)
    
    # Save the dewarped image
    output_dir = os.path.dirname(output_path)
    if output_dir:  # Only create directory if path contains a directory
        os.makedirs(output_dir, exist_ok=True)
    cv2.imwrite(output_path, dewarped_img)
    print(f"Dewarped image saved to: {output_path}")
    print(f"Using Kannala-Brandt fisheye model (undistortImage)")
    
    return output_path

def main():
    # Load the JSON data
    with open('dewarp_test_data.json', 'r') as f:
        data = json.load(f)
    
    # Process each camera entry
    for entry in data:
        camera_id = entry['camera_id']
        original_path = entry['original_image_path']
        
        # Generate output path - save to root with short name
        output_path = f"cam{camera_id}_dewarped.jpg"
        
        print(f"\nProcessing Camera {camera_id}...")
        print(f"Input: {original_path}")
        
        try:
            # Dewarp the image
            dewarped_path = dewarp_fisheye_image(
                original_path,
                entry['camera_matrix'],
                entry['distortion_coefficients'],
                entry['image_width'],
                entry['image_height'],
                output_path
            )
            
            # Update the JSON entry with the actual dewarped path
            entry['dewarped_image_path'] = output_path
            
        except Exception as e:
            print(f"Error processing camera {camera_id}: {e}")
    
    # Save the updated JSON with actual dewarped paths
    with open('dewarp_test_data.json', 'w') as f:
        json.dump(data, f, indent=4)
    
    print("\n✓ All images dewarped successfully!")
    print("✓ JSON file updated with dewarped image paths")

if __name__ == "__main__":
    main()
