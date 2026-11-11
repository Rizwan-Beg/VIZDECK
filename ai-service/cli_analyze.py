import sys
import json
import os
import numpy as np

# Ensure current script directory is in Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from room_analyzer import analyze_room_image

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.bool_, bool)):
            return bool(obj)
        if isinstance(obj, (np.integer, int)):
            return int(obj)
        if isinstance(obj, (np.floating, float)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided"}))
        sys.exit(1)
        
    image_path = sys.argv[1]
    masks_out_dir = sys.argv[2] if len(sys.argv) > 2 else None
    
    if not os.path.exists(image_path):
        print(json.dumps({"error": f"Image not found: {image_path}"}))
        sys.exit(1)
        
    with open(image_path, "rb") as f:
        img_bytes = f.read()
    if len(img_bytes) == 0:
        print(json.dumps({"error": f"Image file is empty: {image_path}"}))
        sys.exit(1)
    result = analyze_room_image(img_bytes, base_url="/")
        
    # If a custom output directory is provided for Next.js public directory
    if masks_out_dir and os.path.exists(masks_out_dir):
        import shutil
        src_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generated_images")
        
        mask_file = os.path.basename(result["occlusion_mask_url"])
        shutil.copy(os.path.join(src_dir, mask_file), os.path.join(masks_out_dir, mask_file))
        result["occlusion_mask_url"] = f"/visualizer-masks/{mask_file}"
        
        if result.get("floor_support_mask_url"):
            support_file = os.path.basename(result["floor_support_mask_url"])
            shutil.copy(os.path.join(src_dir, support_file), os.path.join(masks_out_dir, support_file))
            result["floor_support_mask_url"] = f"/visualizer-masks/{support_file}"
            
        if result.get("debug_overlay_url"):
            debug_file = os.path.basename(result["debug_overlay_url"])
            shutil.copy(os.path.join(src_dir, debug_file), os.path.join(masks_out_dir, debug_file))
            result["debug_overlay_url"] = f"/visualizer-masks/{debug_file}"
        
    print(json.dumps(result, cls=NumpyEncoder))

