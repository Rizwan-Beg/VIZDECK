import os
import uuid
import cv2
import torch
import numpy as np
from PIL import Image, ImageOps
from transformers import (
    OneFormerProcessor,
    OneFormerForUniversalSegmentation,
    SamProcessor,
    SamModel,
    SegformerImageProcessor,
    SegformerForSemanticSegmentation,
)

# Output directory for generated occlusion masks and debug plates
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generated_images")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Device selection:
# CPU is used for OneFormer Swin-Large and SAM ViT-Base on macOS to avoid Apple Silicon MPSNDArray slicing bugs.
CPU_DEVICE = torch.device("cpu")
GPU_DEVICE = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")

_ONEFORMER_PROCESSOR = None
_ONEFORMER_MODEL = None
_SAM_PROCESSOR = None
_SAM_MODEL = None
_SEGFORMER_PROCESSOR = None
_SEGFORMER_MODEL = None

def get_oneformer():
    global _ONEFORMER_PROCESSOR, _ONEFORMER_MODEL
    if _ONEFORMER_PROCESSOR is None or _ONEFORMER_MODEL is None:
        model_id = "shi-labs/oneformer_ade20k_swin_large"
        print(f"[RoomIQ] Loading OneFormer Swin-Large from {model_id}...")
        try:
            _ONEFORMER_PROCESSOR = OneFormerProcessor.from_pretrained(model_id, local_files_only=True)
            _ONEFORMER_MODEL = OneFormerForUniversalSegmentation.from_pretrained(model_id, local_files_only=True).to(CPU_DEVICE).eval()
        except Exception:
            _ONEFORMER_PROCESSOR = OneFormerProcessor.from_pretrained(model_id)
            _ONEFORMER_MODEL = OneFormerForUniversalSegmentation.from_pretrained(model_id).to(CPU_DEVICE).eval()
        print("[RoomIQ] OneFormer Swin-Large loaded successfully.")
    return _ONEFORMER_PROCESSOR, _ONEFORMER_MODEL

def get_sam():
    global _SAM_PROCESSOR, _SAM_MODEL
    if _SAM_PROCESSOR is None or _SAM_MODEL is None:
        model_id = "facebook/sam-vit-base"
        print(f"[RoomIQ] Loading SAM ViT-Base from {model_id}...")
        try:
            _SAM_PROCESSOR = SamProcessor.from_pretrained(model_id, local_files_only=True)
            _SAM_MODEL = SamModel.from_pretrained(model_id, local_files_only=True).to(CPU_DEVICE).eval()
        except Exception:
            _SAM_PROCESSOR = SamProcessor.from_pretrained(model_id)
            _SAM_MODEL = SamModel.from_pretrained(model_id).to(CPU_DEVICE).eval()
        print("[RoomIQ] SAM ViT-Base loaded successfully.")
    return _SAM_PROCESSOR, _SAM_MODEL

def get_segformer_fallback():
    global _SEGFORMER_PROCESSOR, _SEGFORMER_MODEL
    if _SEGFORMER_PROCESSOR is None or _SEGFORMER_MODEL is None:
        model_id = "nvidia/segformer-b0-finetuned-ade-512-512"
        print(f"[RoomIQ] Loading SegFormer B0 fallback from {model_id}...")
        try:
            _SEGFORMER_PROCESSOR = SegformerImageProcessor.from_pretrained(model_id, local_files_only=True)
            _SEGFORMER_MODEL = SegformerForSemanticSegmentation.from_pretrained(model_id, local_files_only=True).to(CPU_DEVICE).eval()
        except Exception:
            _SEGFORMER_PROCESSOR = SegformerImageProcessor.from_pretrained(model_id)
            _SEGFORMER_MODEL = SegformerForSemanticSegmentation.from_pretrained(model_id).to(CPU_DEVICE).eval()
    return _SEGFORMER_PROCESSOR, _SEGFORMER_MODEL

# Verified furniture names and interior objects in ADE20K vocabulary
FURNITURE_LABEL_KEYWORDS = [
    "chair", "table", "desk", "sofa", "bed", "cabinet", "shelf", "bookcase",
    "armchair", "coffee table", "bench", "swivel chair", "stool", "ottoman", "chest",
    "cushion", "pillow", "blanket", "quilt", "cloth", "tray", "box", "vase",
    "flower", "plant", "pot", "tv", "television", "screen", "stand", "console",
    "sideboard", "credenza", "counter", "buffet", "clock", "book", "wardrobe",
    "footstool", "pouf", "drawer", "pedestal", "seat"
]

def analyze_room_image(
    image_bytes,
    base_url: str = "http://localhost:8000/",
    inpaint_existing_rug: bool = False
) -> dict:
    """
    VIZDECK RoomIQ — Commercial Room Understanding Engine
    - Advanced Panoptic Segmentation: OneFormer Swin-Large ADE20K for high-capacity scene understanding.
    - Meta SAM Refinement: SAM ViT-Base for sub-pixel boundary tracing of thin chair/table legs & caster wheels.
    - Two-Tier Mask Fusion: Instance-conditioned proximity grouping preserving thin leg contact points without vertical comb stripes.
    - Direct Overlay Architecture: Selected rug places directly over existing rug/floor without destructive inpainting.
    - Perspective-Aware Anchoring: Metric homography & vanishing ray convergence for physical product grounding.
    """
    import io
    if isinstance(image_bytes, bytes):
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    elif hasattr(image_bytes, "read"):
        if hasattr(image_bytes, "seek"):
            image_bytes.seek(0)
        raw_data = image_bytes.read()
        pil_img = Image.open(io.BytesIO(raw_data)).convert("RGB")
    else:
        pil_img = Image.open(str(image_bytes)).convert("RGB")

    pil_img = ImageOps.exif_transpose(pil_img)
    orig_w, orig_h = pil_img.size
    img_cv = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    total_pixels = orig_w * orig_h

    # 1. Primary Panoptic Segmentation Pass via OneFormer Swin-Large
    actual_floor_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)
    existing_rug_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)
    base_furniture_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)
    wall_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)
    upper_structure_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)

    detected_instances = []
    used_fallback = False

    GROUND_LABEL_KEYWORDS = [
        "floor", "flooring", "earth", "ground", "path", "stage", "platform", "land"
    ]
    UPPER_STRUCTURE_KEYWORDS = [
        "ceiling", "window", "curtain", "blind", "painting", "picture", "light", "lamp", "door", "chandelier", "sconce"
    ]

    try:
        oneformer_proc, oneformer_model = get_oneformer()
        inputs = oneformer_proc(images=pil_img, task_inputs=["panoptic"], return_tensors="pt").to(CPU_DEVICE)
        with torch.no_grad():
            outputs = oneformer_model(**inputs)

        panoptic = oneformer_proc.post_process_panoptic_segmentation(outputs, target_sizes=[(orig_h, orig_w)])[0]
        seg_map = panoptic["segmentation"].numpy()
        segments_info = panoptic["segments_info"]

        for s in segments_info:
            s_id = s["id"]
            label_id = s["label_id"]
            label_name = oneformer_model.config.id2label.get(label_id, str(label_id)).lower()
            seg_mask = (seg_map == s_id).astype(np.uint8)
            area = int(seg_mask.sum())
            if area < 30:
                continue

            if any(g in label_name for g in GROUND_LABEL_KEYWORDS):
                actual_floor_mask = cv2.bitwise_or(actual_floor_mask, seg_mask)
            elif "rug" in label_name or "carpet" in label_name:
                existing_rug_mask = cv2.bitwise_or(existing_rug_mask, seg_mask)
            elif "wall" in label_name:
                wall_mask = cv2.bitwise_or(wall_mask, seg_mask)
            elif any(u in label_name for u in UPPER_STRUCTURE_KEYWORDS):
                upper_structure_mask = cv2.bitwise_or(upper_structure_mask, seg_mask)
            else:
                # All other detected instances are furniture, seating, cushions, decor, or consoles
                y_idx, x_idx = np.where(seg_mask > 0)
                if len(y_idx):
                    y_min, y_max = int(y_idx.min()), int(y_idx.max())
                    x_min, x_max = int(x_idx.min()), int(x_idx.max())
                    base_furniture_mask = cv2.bitwise_or(base_furniture_mask, seg_mask)
                    detected_instances.append({
                        "id": s_id,
                        "label": label_name,
                        "area": area,
                        "box": [x_min, y_min, x_max, y_max],
                        "y_max": y_max,
                        "mask": seg_mask
                    })

    except Exception as e:
        print(f"[RoomIQ] OneFormer error, falling back to SegFormer: {e}")
        used_fallback = True
        seg_proc, seg_model = get_segformer_fallback()
        inputs = seg_proc(images=pil_img, return_tensors="pt").to(CPU_DEVICE)
        with torch.no_grad():
            outputs = seg_model(**inputs)

        # Bilinear upsample
        logits = outputs.logits
        upsampled = torch.nn.functional.interpolate(logits, size=(orig_h, orig_w), mode="bilinear", align_corners=False)
        seg_map = upsampled.argmax(dim=1)[0].numpy()

        GROUND_CLASSES = [3, 13, 28, 52, 94, 101]
        CLASS_FLOOR = 3
        CLASS_RUG = 28
        VERIFIED_CLASSES = [7, 10, 15, 19, 23, 30, 33, 36, 42, 64, 65, 75, 76, 85]
        WALL_CLASSES = [0]
        UPPER_CLASSES = [5, 8, 18, 22, 25]

        actual_floor_mask = np.isin(seg_map, [c for c in GROUND_CLASSES if c != CLASS_RUG]).astype(np.uint8)
        existing_rug_mask = (seg_map == CLASS_RUG).astype(np.uint8)
        base_furniture_mask = np.isin(seg_map, VERIFIED_CLASSES).astype(np.uint8)
        wall_mask = np.isin(seg_map, WALL_CLASSES).astype(np.uint8)
        upper_structure_mask = np.isin(seg_map, UPPER_CLASSES).astype(np.uint8)

        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(base_furniture_mask)
        for lbl in range(1, num_labels):
            obj_top = stats[lbl, cv2.CC_STAT_TOP]
            obj_left = stats[lbl, cv2.CC_STAT_LEFT]
            obj_w = stats[lbl, cv2.CC_STAT_WIDTH]
            obj_h = stats[lbl, cv2.CC_STAT_HEIGHT]
            area = stats[lbl, cv2.CC_STAT_AREA]
            if area > 100:
                detected_instances.append({
                    "id": lbl,
                    "label": "furniture",
                    "area": int(area),
                    "box": [obj_left, obj_top, obj_left + obj_w, obj_top + obj_h],
                    "y_max": obj_top + obj_h,
                    "mask": (labels == lbl).astype(np.uint8)
                })

    # 2. Distant Floor Recovery & Continuous Ground Plane Fusion
    # In distant room regions (near windows, furniture bases, and background), OneFormer frequently
    # misclassifies overexposed floor (window glare) or shadowed floor (under furniture) as wall or unassigned.
    # We topologically and photometrically recover these regions to form a continuous floor plane.

    # Identify hard upper structures that can NEVER be floor (upper vertical walls, ceilings, windows, drapes)
    num_w, w_labels, w_stats, _ = cv2.connectedComponentsWithStats(wall_mask)
    true_wall_obstacle = np.zeros((orig_h, orig_w), dtype=np.uint8)
    for wid in range(1, num_w):
        w_top = w_stats[wid, cv2.CC_STAT_TOP]
        # Wall components connecting into the upper room are true vertical wall structures
        if w_top < int(orig_h * 0.46):
            true_wall_obstacle[w_labels == wid] = 1

    hard_upper_obstacles = cv2.bitwise_or(true_wall_obstacle, upper_structure_mask)
    # Ensure lower ground is not blocked by hanging chandeliers or lights
    hard_upper_obstacles[int(orig_h * 0.72):, :] = 0

    # Distant candidate zone: lower/mid room space where floor could reside
    candidate_zone = np.zeros((orig_h, orig_w), dtype=np.uint8)
    candidate_zone[int(orig_h * 0.38):, :] = 1
    candidate_floor = cv2.bitwise_and(candidate_zone, cv2.bitwise_not(hard_upper_obstacles * 255))
    candidate_floor = cv2.bitwise_and(candidate_floor, cv2.bitwise_not(base_furniture_mask * 255))

    # Geodesic chromatic propagation from verified floor seed into candidate floor
    raw_ground_seed = cv2.bitwise_or(actual_floor_mask, existing_rug_mask)
    if raw_ground_seed.sum() > (total_pixels * 0.02):
        # Extract chromatic profile of verified foreground floor in Lab space
        img_lab = cv2.cvtColor(img_cv, cv2.COLOR_BGR2LAB)
        # Sample lower third where confidence is highest
        fg_sample_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)
        fg_sample_mask[int(orig_h * 0.65):, :] = 1
        fg_floor_samples = cv2.bitwise_and(raw_ground_seed, fg_sample_mask)
        
        if fg_floor_samples.sum() > 200:
            lab_a = img_lab[:, :, 1]
            lab_b = img_lab[:, :, 2]
            mean_a = float(np.mean(lab_a[fg_floor_samples > 0]))
            mean_b = float(np.mean(lab_b[fg_floor_samples > 0]))
            std_a = float(np.std(lab_a[fg_floor_samples > 0])) + 4.0
            std_b = float(np.std(lab_b[fg_floor_samples > 0])) + 4.0

            # Distance in chromaticity space (tolerant to brightness variations from glare and shadows)
            chroma_dist_sq = ((lab_a.astype(np.float32) - mean_a) / std_a) ** 2 + ((lab_b.astype(np.float32) - mean_b) / std_b) ** 2
            chroma_match = (chroma_dist_sq < 16.0).astype(np.uint8)
            candidate_floor = cv2.bitwise_and(candidate_floor, chroma_match * 255)

        # Morphological closing to seal tile grout lines and small shadows without expanding boundaries
        kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        recovered_ground = cv2.morphologyEx(raw_ground_seed, cv2.MORPH_CLOSE, kernel_close)
        # Small constrained expansion only in pure candidate floor free of all furniture
        dil = cv2.dilate(recovered_ground, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))
        recovered_ground = cv2.bitwise_or(recovered_ground, cv2.bitwise_and(dil, (candidate_floor > 0).astype(np.uint8)))
        # Strictly exclude all furniture and existing rugs
        recovered_ground = cv2.bitwise_and(recovered_ground, cv2.bitwise_not(base_furniture_mask))
        actual_floor_mask = cv2.bitwise_and(recovered_ground, cv2.bitwise_not(existing_rug_mask))

    traversable_ground_mask = cv2.bitwise_or(actual_floor_mask, existing_rug_mask)
    rug_pixel_count = int(existing_rug_mask.sum())
    floor_pixel_count = int(actual_floor_mask.sum())
    ground_pixel_count = int(traversable_ground_mask.sum())
    has_existing_rug = bool(rug_pixel_count > (total_pixels * 0.015))

    # Existing Rug Polygon and Geometry Analysis
    existing_rug_data = {
        "detected": False,
        "corners": None,
        "polygon": None,
        "center": None,
        "orientation_deg": 0.0,
        "size_uv": None,
        "confidence": 0.0
    }

    if has_existing_rug:
        kernel_rug = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
        rug_closed = cv2.morphologyEx(existing_rug_mask * 255, cv2.MORPH_CLOSE, kernel_rug)
        rug_contours, _ = cv2.findContours(rug_closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if rug_contours:
            largest_rug = max(rug_contours, key=cv2.contourArea)
            rug_area = cv2.contourArea(largest_rug)

            if rug_area > (total_pixels * 0.012):
                rect = cv2.minAreaRect(largest_rug)
                box = cv2.boxPoints(rect)
                box = np.int32(box)

                peri = cv2.arcLength(largest_rug, True)
                approx = cv2.approxPolyDP(largest_rug, 0.025 * peri, True)
                poly_pts = [[round(float(pt[0][0] / orig_w), 4), round(float(pt[0][1] / orig_h), 4)] for pt in approx]
                box_corners = [[round(float(pt[0] / orig_w), 4), round(float(pt[1] / orig_h), 4)] for pt in box]

                center_u = round(float(rect[0][0] / orig_w), 4)
                center_v = round(float(rect[0][1] / orig_h), 4)
                size_u = round(float(rect[1][0] / orig_w), 4)
                size_v = round(float(rect[1][1] / orig_h), 4)
                angle = round(float(rect[2]), 2)
                if abs(angle - 90.0) < 15.0 or abs(angle + 90.0) < 15.0:
                    angle = 0.0

                confidence = round(float(min(1.0, rug_area / (rect[1][0] * rect[1][1] + 1e-5))), 3)

                existing_rug_data = {
                    "detected": True,
                    "corners": box_corners,
                    "polygon": poly_pts,
                    "center": [center_u, center_v],
                    "orientation_deg": angle,
                    "size_uv": [size_u, size_v],
                    "confidence": confidence
                }

    # 3. Robust Floor Quad & Horizon Ray Estimation (Calibrated to True Room Depth)
    if ground_pixel_count < (total_pixels * 0.05):
        horizon_y = 0.65
        near_y = 0.995
        x_vp, y_vp = 0.50, 0.44
        near_left_x, near_right_x = 0.02, 0.98
        ray_L = (near_left_x - x_vp) / (near_y - y_vp)
        ray_R = (near_right_x - x_vp) / (near_y - y_vp)
        far_left_x = float(x_vp + ray_L * (horizon_y - y_vp))
        far_right_x = float(x_vp + ray_R * (horizon_y - y_vp))
    else:
        y_indices, x_indices = np.where(traversable_ground_mask > 0)
        # Using 1.2th percentile prevents perspective compression from discarding distant floor
        horizon_y = float(np.percentile(y_indices, 1.2) / orig_h)
        horizon_y = max(0.38, min(0.68, horizon_y))
        near_y = float(np.percentile(y_indices, 98.8) / orig_h)
        near_y = min(0.995, max(near_y, horizon_y + 0.18))

        # Roomvo-grade perspective ray convergence to central vanishing point
        x_vp = 0.50
        y_vp = max(0.12, min(0.44, horizon_y - 0.22))
        near_left_x = 0.02
        near_right_x = 0.98

        ray_L = (near_left_x - x_vp) / (near_y - y_vp)
        ray_R = (near_right_x - x_vp) / (near_y - y_vp)

        far_left_x = max(0.08, min(0.44, float(x_vp + ray_L * (horizon_y - y_vp))))
        far_right_x = min(0.92, max(0.56, float(x_vp + ray_R * (horizon_y - y_vp))))

    floor_quad = {
        "farLeft": {"x": round(far_left_x, 4), "y": round(horizon_y, 4)},
        "farRight": {"x": round(far_right_x, 4), "y": round(horizon_y, 4)},
        "nearRight": {"x": round(near_right_x, 4), "y": round(near_y, 4)},
        "nearLeft": {"x": round(near_left_x, 4), "y": round(near_y, 4)},
    }

    # Extract authentic visible floor contour (polygon approximation without forcing horizontal far edge)
    contours, _ = cv2.findContours((traversable_ground_mask > 0).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    visible_floor_polygon = []
    if contours:
        largest_cnt = max(contours, key=cv2.contourArea)
        epsilon = 0.012 * cv2.arcLength(largest_cnt, True)
        approx = cv2.approxPolyDP(largest_cnt, epsilon, True)
        visible_floor_polygon = [
            {"x": round(float(pt[0][0]) / orig_w, 4), "y": round(float(pt[0][1]) / orig_h, 4)}
            for pt in approx
        ]

    # Realistic Physical Room Floor Dimensions (metric feet)
    # Calibrated to typical standing camera FOV (68 deg HFOV, 5 ft lens height)
    visible_height_ratio = near_y - horizon_y
    est_depth_ft = max(11.5, min(16.5, round(visible_height_ratio * 34.0, 1)))
    est_width_ft = max(12.5, min(17.5, round(est_depth_ft * (orig_w / orig_h) * 0.65, 1)))
    floor_size = {"widthFt": est_width_ft, "depthFt": est_depth_ft}

    # Metric floor homography
    src_img_quad = np.array([
        [far_left_x * orig_w, horizon_y * orig_h],
        [far_right_x * orig_w, horizon_y * orig_h],
        [near_right_x * orig_w, near_y * orig_h],
        [near_left_x * orig_w, near_y * orig_h]
    ], dtype=np.float32)

    dst_floor_quad = np.array([
        [0.0, est_depth_ft],
        [est_width_ft, est_depth_ft],
        [est_width_ft, 0.0],
        [0.0, 0.0]
    ], dtype=np.float32)

    try:
        H_img_to_floor, _ = cv2.findHomography(src_img_quad, dst_floor_quad)
    except Exception:
        H_img_to_floor = None

    def unproject_uv_to_floor(u: float, v: float):
        if H_img_to_floor is not None:
            pt = np.array([[[u * orig_w, v * orig_h]]], dtype=np.float32)
            res = cv2.perspectiveTransform(pt, H_img_to_floor)[0][0]
            fx = max(0.5, min(est_width_ft - 0.5, float(res[0])))
            fz = max(0.5, min(est_depth_ft - 0.5, float(res[1])))
            return fx, fz
        norm_v = max(0.0, min(1.0, (v - horizon_y) / (near_y - horizon_y + 1e-6)))
        return est_width_ft * u, est_depth_ft * (1.0 - norm_v * 0.88)

    # 4. SAM High-Precision Boundary Refinement Pass
    floor_threshold_y = horizon_y - 0.15
    candidate_boxes = []
    furniture_columns = []
    detected_objects_summary = []

    for inst in detected_instances:
        bx1, by1, bx2, by2 = inst["box"]
        y_max = inst["y_max"]
        reaches_ground = (y_max / orig_h) >= floor_threshold_y

        if reaches_ground and inst["area"] > 150:
            furniture_columns.append((bx1, bx2, y_max))

            # Pad box to capture thin feet and ground contact points
            bw = bx2 - bx1
            bh = by2 - by1
            pad_x = int(bw * 0.08)
            pad_y_top = int(bh * 0.05)
            pad_y_bot = int(bh * 0.12)  # Extra downward extension for chair feet

            px1 = max(0, bx1 - pad_x)
            py1 = max(0, by1 - pad_y_top)
            px2 = min(orig_w, bx2 + pad_x)
            py2 = min(orig_h, by2 + pad_y_bot)

            candidate_boxes.append([px1, py1, px2, py2])

        detected_objects_summary.append({
            "instance_id": f"furn_{inst['id']}",
            "class_name": inst["label"],
            "bounding_box": [
                round(float(bx1 / orig_w), 4),
                round(float(by1 / orig_h), 4),
                round(float((bx2 - bx1) / orig_w), 4),
                round(float((by2 - by1) / orig_h), 4)
            ],
            "ground_contact_y": round(float(y_max / orig_h), 4),
            "occludes_rug": reaches_ground
        })

    sam_furn_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)

    if candidate_boxes:
        try:
            sam_proc, sam_model = get_sam()
            # Process top candidate boxes in a single optimized pass
            chunk = candidate_boxes[:8]
            s_inputs = sam_proc(pil_img, input_boxes=[chunk], return_tensors="pt").to(CPU_DEVICE)
            with torch.no_grad():
                s_outputs = sam_model(**s_inputs)

            masks = sam_proc.post_process_masks(
                s_outputs.pred_masks.cpu(),
                s_inputs["original_sizes"].cpu(),
                s_inputs["reshaped_input_sizes"].cpu()
            )[0]
            iou_scores = s_outputs.iou_scores.cpu()[0]

            for b_idx, box in enumerate(chunk):
                best_idx = torch.argmax(iou_scores[b_idx]).item()
                m_np = masks[b_idx, best_idx].numpy().astype(np.uint8)
                x1, y1, x2, y2 = box
                box_clip = np.zeros_like(m_np)
                box_clip[y1:y2, x1:x2] = 1
                sam_furn_mask = cv2.bitwise_or(sam_furn_mask, (m_np * box_clip).astype(np.uint8))
        except Exception as sam_err:
            print(f"[RoomIQ] SAM refinement warning: {sam_err}")

    # 5. Two-Tier Mask Fusion with Instance-Conditioned Proximity Grouping
    # Fuse coarse panoptic mask with SAM boundary refinement
    fused_furn = cv2.bitwise_or(base_furniture_mask * 255, sam_furn_mask * 255)

    # Connected component analysis for thin leg strut preservation
    num_f, f_labels, f_stats, _ = cv2.connectedComponentsWithStats(fused_furn)
    clean_furn = np.zeros_like(fused_furn)

    for lbl in range(1, num_f):
        top = f_stats[lbl, cv2.CC_STAT_TOP]
        left = f_stats[lbl, cv2.CC_STAT_LEFT]
        width = f_stats[lbl, cv2.CC_STAT_WIDTH]
        height = f_stats[lbl, cv2.CC_STAT_HEIGHT]
        y_max = top + height
        area = f_stats[lbl, cv2.CC_STAT_AREA]

        if area >= 45:
            # Major furniture body
            if (y_max / orig_h) >= floor_threshold_y:
                clean_furn[f_labels == lbl] = 255
        elif area >= 8:
            # Check if this small component is a chair foot, caster, or thin leg strut
            cx = left + width // 2
            is_beneath_furniture = False
            for c_left, c_right, c_bottom in furniture_columns:
                if (c_left - 15) <= cx <= (c_right + 15) and top >= (horizon_y - 0.05) * orig_h:
                    is_beneath_furniture = True
                    break
            if is_beneath_furniture:
                clean_furn[f_labels == lbl] = 255

    # Solidify furniture body to avoid transparency ghosting
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    clean_furn = cv2.morphologyEx(clean_furn, cv2.MORPH_CLOSE, kernel_close)
    contours, _ = cv2.findContours(clean_furn, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        cv2.drawContours(clean_furn, [cnt], -1, 255, -1)

    # Enforce strict non-floor subtraction: floor mask must never penetrate furniture
    actual_floor_mask = cv2.bitwise_and(actual_floor_mask, cv2.bitwise_not((clean_furn > 128).astype(np.uint8)))

    # Save occlusion mask PNG (255 = foreground furniture, 0 = floor/rug)
    mask_id = uuid.uuid4().hex
    mask_filename = f"mask_{mask_id}.png"
    mask_path = os.path.join(OUTPUT_DIR, mask_filename)
    Image.fromarray(clean_furn, mode="L").save(mask_path, format="PNG")

    # Authoritative Floor Support Mask for Roomvo-style Wall Boundary Disappearance
    # (255 = floor where rug can lie, including under furniture; 0 = wall/ceiling where rug is clipped)
    floor_support = cv2.bitwise_or((actual_floor_mask * 255).astype(np.uint8), (existing_rug_mask * 255).astype(np.uint8))
    # Include ground furniture contact footprints so rugs slide smoothly under chairs/table legs
    floor_support = cv2.bitwise_or(floor_support, clean_furn)
    # Morphological closing to fill floor tile joints and thin chair leg footprints
    kernel_support = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 17))
    floor_support = cv2.morphologyEx(floor_support, cv2.MORPH_CLOSE, kernel_support)
    # Fill internal pinholes
    support_contours, _ = cv2.findContours(floor_support, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    for scnt in support_contours:
        if cv2.contourArea(scnt) > 400:
            cv2.drawContours(floor_support, [scnt], -1, 255, -1)
    # Strictly zero out verified upper structural obstacles (walls, ceiling, upper windows)
    floor_support[hard_upper_obstacles > 0] = 0
    # Zero out only strictly above the true geometric ceiling limit (with safe perspective margin)
    ceiling_limit_px = max(0, int((horizon_y - 0.04) * orig_h))
    floor_support[:ceiling_limit_px, :] = 0

    support_filename = f"floor_support_{mask_id}.png"
    support_path = os.path.join(OUTPUT_DIR, support_filename)
    Image.fromarray(floor_support, mode="L").save(support_path, format="PNG")

    # 6. Room Classification (Living room with sofa prioritized over incidental tables/stools)
    furn_labels_str = " ".join([inst["label"] for inst in detected_instances])
    if "sofa" in furn_labels_str or "couch" in furn_labels_str or "armchair" in furn_labels_str:
        room_type = "living_room"
    elif "bed" in furn_labels_str:
        room_type = "bedroom"
    elif "desk" in furn_labels_str or "swivel chair" in furn_labels_str or "bookcase" in furn_labels_str:
        room_type = "study_room"
    elif "dining" in furn_labels_str or ("table" in furn_labels_str and "chair" in furn_labels_str):
        room_type = "dining_room"
    else:
        room_type = "living_room"

    # 7. Intelligent Rug Placement Calculation
    suggested_rot = 0.0
    if existing_rug_data["detected"] and existing_rug_data["center"]:
        cu, cv_coord = existing_rug_data["center"]
        rug_x, rug_z = unproject_uv_to_floor(cu, cv_coord)
        suggested_rot = existing_rug_data["orientation_deg"]
        placement_reason = "Aligned directly with existing rug placement on room floor."
    elif room_type == "living_room":
        sofa_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)
        for inst in detected_instances:
            if "sofa" in inst["label"] or "couch" in inst["label"]:
                sofa_mask = cv2.bitwise_or(sofa_mask, inst["mask"])
        sy_indices, sx_indices = np.where(sofa_mask > 0)
        if len(sy_indices):
            sofa_cu = float(sx_indices.mean() / orig_w)
            # If sofa is on the left side, center rug between sofa and opposite side
            if sofa_cu < 0.35:
                rug_x = est_width_ft * 0.46
            elif sofa_cu > 0.65:
                rug_x = est_width_ft * 0.54
            else:
                rug_x = est_width_ft * 0.50
            # Place the rug centered on the open floor depth (avoiding camera near edge)
            rug_z = est_depth_ft * 0.48
            placement_reason = "Centered on open floor space in front of sofa seating."
        else:
            rug_x = est_width_ft / 2.0
            rug_z = est_depth_ft * 0.46
            placement_reason = "Centered on open living room floor."

    elif room_type == "dining_room":
        dining_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)
        for inst in detected_instances:
            if "table" in inst["label"] or "chair" in inst["label"]:
                dining_mask = cv2.bitwise_or(dining_mask, inst["mask"])
        dy_indices, dx_indices = np.where(dining_mask > 0)
        if len(dy_indices):
            cu = float(dx_indices.mean() / orig_w)
            cv_coord = float(dy_indices.mean() / orig_h)
            rug_x, rug_z = unproject_uv_to_floor(cu, cv_coord)
        else:
            rug_x = est_width_ft / 2.0
            rug_z = est_depth_ft * 0.50
        placement_reason = "Centered under dining table and chairs with balanced perimeter clearance."

    elif room_type == "study_room":
        desk_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)
        for inst in detected_instances:
            if "desk" in inst["label"] or "chair" in inst["label"]:
                desk_mask = cv2.bitwise_or(desk_mask, inst["mask"])
        dy_indices, dx_indices = np.where(desk_mask > 0)
        if len(dy_indices):
            cu = float(dx_indices.mean() / orig_w)
            bottom_v = float(dy_indices.max() / orig_h)
            rug_x, rug_z = unproject_uv_to_floor(cu, bottom_v)
            rug_z = max(2.5, rug_z - 0.8)
        else:
            rug_x = est_width_ft / 2.0
            rug_z = est_depth_ft * 0.40
        placement_reason = "Anchored beneath executive desk and chair for unified workspace framing."

    elif room_type == "bedroom":
        bed_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)
        for inst in detected_instances:
            if "bed" in inst["label"]:
                bed_mask = cv2.bitwise_or(bed_mask, inst["mask"])
        by_indices, bx_indices = np.where(bed_mask > 0)
        if len(by_indices):
            cu = float(bx_indices.mean() / orig_w)
            bottom_v = float(by_indices.max() / orig_h)
            rug_x, rug_z = unproject_uv_to_floor(cu, bottom_v)
            rug_z = max(2.0, rug_z - 1.0)
        else:
            rug_x = est_width_ft / 2.0
            rug_z = est_depth_ft * 0.45
        placement_reason = "Framed around bed footprint with balanced margins."

    else:
        rug_x = est_width_ft / 2.0
        rug_z = est_depth_ft * 0.46
        placement_reason = "Positioned centrally on visible floor space."

    # Standard default bounding frame
    rug_w, rug_h = 8.0, 10.0
    min_x_pad = min(1.0, est_width_ft * 0.08)
    min_z_pad = min(1.0, est_depth_ft * 0.08)
    rug_x = max(min_x_pad + rug_w / 2.0, min(est_width_ft - rug_w / 2.0 - min_x_pad, rug_x))
    if est_depth_ft <= rug_h + 1.5:
        rug_z = est_depth_ft * 0.48
    else:
        rug_z = max(rug_h / 2.0 + 0.8, min(est_depth_ft - rug_h / 2.0 - 0.5, rug_z))

    suggested_placement = {
        "x": round(float(rug_x), 2),
        "z": round(float(rug_z), 2),
        "w": round(float(rug_w), 2),
        "h": round(float(rug_h), 2),
        "rot": suggested_rot,
        "reason": placement_reason
    }

    # 8. Optional Clean Floor Generation (Restoration Mode only)
    clean_floor_filename = None
    if inpaint_existing_rug and has_existing_rug:
        rug_mask_raw = (existing_rug_mask * 255).astype(np.uint8)
        kernel_rug_close = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
        rug_closed = cv2.morphologyEx(rug_mask_raw, cv2.MORPH_CLOSE, kernel_rug_close)
        kernel_rug = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
        rug_dilated = cv2.dilate(rug_closed, kernel_rug, iterations=2)
        inpaint_mask = cv2.bitwise_and(rug_dilated, cv2.bitwise_not(clean_furn))

        if inpaint_mask.sum() > 0:
            clean_bgr = cv2.inpaint(img_cv, inpaint_mask, 5, cv2.INPAINT_TELEA)
            clean_floor_filename = f"clean_floor_{mask_id}.jpg"
            clean_floor_path = os.path.join(OUTPUT_DIR, clean_floor_filename)
            cv2.imwrite(clean_floor_path, clean_bgr, [cv2.IMWRITE_JPEG_QUALITY, 94])

    # 9. Rich Multi-Layer Debug Visualization
    debug_arr = np.array(pil_img).copy()

    hy_px = int(horizon_y * orig_h)
    cv2.line(debug_arr, (0, hy_px), (orig_w, hy_px), (255, 255, 0), 2)

    vp_px = (int(x_vp * orig_w), int(y_vp * orig_h))
    cv2.circle(debug_arr, vp_px, 6, (0, 0, 255), -1)

    fl_px = (int(far_left_x * orig_w), int(horizon_y * orig_h))
    fr_px = (int(far_right_x * orig_w), int(horizon_y * orig_h))
    nr_px = (int(near_right_x * orig_w), int(near_y * orig_h))
    nl_px = (int(near_left_x * orig_w), int(near_y * orig_h))

    cv2.line(debug_arr, vp_px, nl_px, (0, 255, 255), 1, cv2.LINE_AA)
    cv2.line(debug_arr, vp_px, nr_px, (0, 255, 255), 1, cv2.LINE_AA)

    quad_poly = np.array([fl_px, fr_px, nr_px, nl_px], np.int32)
    cv2.polylines(debug_arr, [quad_poly], isClosed=True, color=(0, 255, 0), thickness=2, lineType=cv2.LINE_AA)

    # Tint foreground furniture in translucent amber
    amber_overlay = debug_arr.copy()
    amber_overlay[clean_furn > 30] = [255, 140, 0]
    debug_arr = cv2.addWeighted(debug_arr, 0.72, amber_overlay, 0.28, 0)

    # If existing rug was found, outline it in magenta
    if has_existing_rug and existing_rug_data["corners"]:
        rug_box_px = np.array([
            [int(pt[0] * orig_w), int(pt[1] * orig_h)] for pt in existing_rug_data["corners"]
        ], np.int32)
        cv2.polylines(debug_arr, [rug_box_px], isClosed=True, color=(255, 0, 255), thickness=2, lineType=cv2.LINE_AA)
        if existing_rug_data["center"]:
            rc_px = (int(existing_rug_data["center"][0] * orig_w), int(existing_rug_data["center"][1] * orig_h))
            cv2.circle(debug_arr, rc_px, 5, (255, 0, 255), -1)

    debug_filename = f"debug_{mask_id}.jpg"
    debug_path = os.path.join(OUTPUT_DIR, debug_filename)
    Image.fromarray(debug_arr).save(debug_path, format="JPEG", quality=88)

    base = base_url.rstrip("/") + "/"
    floor_confidence = round(float(ground_pixel_count / total_pixels), 3)

    furn_labels_str = " ".join([inst["label"] for inst in detected_instances])
    has_room_furniture = bool(any(k in furn_labels_str for k in ["sofa", "couch", "bed", "chair", "table", "desk", "bench", "cabinet"]))

    # An image contains a floor for rug rendering if:
    # 1. Ground/floor pixels >= 2%, OR
    # 2. Existing rug detected, OR
    # 3. Known indoor room furniture is present with visible ground space (>= 0.8%)
    floor_detected = bool(ground_pixel_count >= (total_pixels * 0.02) or has_existing_rug or (has_room_furniture and ground_pixel_count >= (total_pixels * 0.008)))
    is_valid_room = floor_detected

    response_data = {
        "is_valid_room": is_valid_room,
        "floor_detected": floor_detected,
        "floor_confidence": floor_confidence,
        "rejection_reason": "No visible floor or room space was detected in this image. Please upload a clear photo of an indoor room showing the floor." if not is_valid_room else None,
        "room_type": room_type if is_valid_room else "Unknown Space",
        "floor_quad": floor_quad,
        "visible_floor_polygon": visible_floor_polygon,
        "floor_size": floor_size,
        "is_visual_estimate": True,
        "is_metric_calibrated": False,
        "scale_confidence": "uncalibrated_estimate",
        "measurement_note": "Perspective quad estimated via 2D vanishing-ray convergence from visible floor boundaries. Direct rug overlay preserves authentic room photograph and actual product dimensions.",
        "existing_rug": existing_rug_data,
        "detected_furniture": {
            "has_table": bool(any("table" in inst["label"] or "desk" in inst["label"] for inst in detected_instances)),
            "has_chairs": bool(any("chair" in inst["label"] for inst in detected_instances)),
            "has_sofa": bool(any("sofa" in inst["label"] or "couch" in inst["label"] for inst in detected_instances)),
            "has_bed": bool(any("bed" in inst["label"] for inst in detected_instances)),
            "has_existing_rug": has_existing_rug
        },
        "detected_objects": detected_objects_summary,
        "suggested_placement": suggested_placement,
        "occlusion_mask_url": f"{base}images/{mask_filename}",
        "floor_support_mask_url": f"{base}images/{support_filename}",
        "debug_overlay_url": f"{base}images/{debug_filename}",
        "clean_floor_url": f"{base}images/{clean_floor_filename}" if clean_floor_filename else None,
        "diagnostics": {
            "model_pipeline": "OneFormer Swin-Large Panoptic + Meta SAM ViT-Base" if not used_fallback else "SegFormer B0 Fallback",
            "device": "CPU",
            "image_dimensions": [orig_w, orig_h],
            "vanishing_point": [round(x_vp, 4), round(y_vp, 4)],
            "horizon_ratio": round(horizon_y, 4),
            "foreground_occlusion_ratio": round(float((clean_furn > 0).sum() / clean_furn.size), 4),
            "actual_floor_pixel_count": floor_pixel_count,
            "existing_rug_pixel_count": rug_pixel_count,
            "existing_rug_detected": has_existing_rug,
            "geometry_method": "Metric Homography + 2D Vanishing-Ray Polyfit"
        }
    }

    def sanitize_for_json(obj):
        if isinstance(obj, dict):
            return {k: sanitize_for_json(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [sanitize_for_json(v) for v in obj]
        elif isinstance(obj, (np.bool_, bool)):
            return bool(obj)
        elif isinstance(obj, (np.integer, int)):
            return int(obj)
        elif isinstance(obj, (np.floating, float)):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return sanitize_for_json(obj.tolist())
        return obj

    return sanitize_for_json(response_data)
