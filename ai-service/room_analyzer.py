import math
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

    # Keep an EXIF-normalized source copy. Inference can be downscaled for predictable
    # latency, but masks must be returned at the source image resolution so thin table
    # legs and rug edges do not turn into soft, misplaced cut-outs in WebGL.
    source_pil_img = ImageOps.exif_transpose(pil_img)
    source_w, source_h = source_pil_img.size
    pil_img = source_pil_img
    max_proc_pixels = 1_700_000
    max_proc_side = 1536
    if max(source_w, source_h) > max_proc_side or (source_w * source_h) > max_proc_pixels:
        proc_scale = min(max_proc_side / max(source_w, source_h), (max_proc_pixels / float(source_w * source_h)) ** 0.5)
        proc_w = max(320, int(round(source_w * proc_scale)))
        proc_h = max(240, int(round(source_h * proc_scale)))
        pil_img = source_pil_img.resize((proc_w, proc_h), Image.Resampling.LANCZOS)
    orig_w, orig_h = pil_img.size
    img_cv = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    total_pixels = orig_w * orig_h

    # Model work happens at `orig_*`; browser compositing happens against the
    # EXIF-normalized upload. Restore every published alpha/support mask to that
    # upload resolution so UV-aligned edges stay crisp on modern phone photos.
    source_img_cv = cv2.cvtColor(np.array(source_pil_img), cv2.COLOR_RGB2BGR)

    def restore_source_resolution(mask: np.ndarray) -> np.ndarray:
        if mask.shape[1] == source_w and mask.shape[0] == source_h:
            return mask
        return cv2.resize(mask, (source_w, source_h), interpolation=cv2.INTER_NEAREST)

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
                y_u, x_u = np.where(seg_mask > 0)
                is_fg_art_mislabel = (
                    len(y_u) > 0
                    and ("painting" in label_name or "picture" in label_name)
                    and int(y_u.min()) >= int(orig_h * 0.52)
                    and int(y_u.max()) >= int(orig_h * 0.85)
                )
                if is_fg_art_mislabel:
                    y_min_f, y_max_f = int(y_u.min()), int(y_u.max())
                    x_min_f, x_max_f = int(x_u.min()), int(x_u.max())
                    base_furniture_mask = cv2.bitwise_or(base_furniture_mask, seg_mask)
                    detected_instances.append({
                        "id": s_id,
                        "label": "bed",
                        "area": area,
                        "box": [x_min_f, y_min_f, x_max_f, y_max_f],
                        "y_max": y_max_f,
                        "mask": seg_mask,
                    })
                else:
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

        # Fuse OneFormer dense semantic head onto any unassigned panoptic pixels (seg_map == 0)
        # so dark/patterned floors, bold carpets, or dim foreground seating are never dropped to void.
        pan_zero = (seg_map == 0)
        unassigned_frac = float(pan_zero.sum()) / float(max(1, total_pixels))
        pan_ground_frac = float((actual_floor_mask | existing_rug_mask).sum()) / float(max(1, total_pixels))
        if unassigned_frac > 0.015 or pan_ground_frac < 0.18:
            sem_inputs = oneformer_proc(images=pil_img, task_inputs=["semantic"], return_tensors="pt").to(CPU_DEVICE)
            with torch.no_grad():
                sem_outputs = oneformer_model(**sem_inputs)
            sem_map = oneformer_proc.post_process_semantic_segmentation(
                sem_outputs, target_sizes=[(orig_h, orig_w)]
            )[0].numpy()

            SEM_RECOVER_FURN = (
                "sofa", "couch", "bed", "armchair", "chair", "swivel", "table",
                "desk", "wardrobe", "closet", "cabinet", "bench", "ottoman",
                "stool", "bag", "box", "tray",
            )
            next_id = max([int(inst["id"]) for inst in detected_instances], default=0) + 1
            for lid in np.unique(sem_map):
                lid_i = int(lid)
                label_name = oneformer_model.config.id2label.get(lid_i, str(lid_i)).lower()
                fill_m = ((sem_map == lid_i) & pan_zero).astype(np.uint8)
                if int(fill_m.sum()) < 30:
                    continue
                if any(g in label_name for g in GROUND_LABEL_KEYWORDS):
                    actual_floor_mask = cv2.bitwise_or(actual_floor_mask, fill_m)
                elif "rug" in label_name or "carpet" in label_name:
                    existing_rug_mask = cv2.bitwise_or(existing_rug_mask, fill_m)
                elif "wall" in label_name:
                    wall_mask = cv2.bitwise_or(wall_mask, fill_m)
                elif any(u in label_name for u in UPPER_STRUCTURE_KEYWORDS):
                    upper_structure_mask = cv2.bitwise_or(upper_structure_mask, fill_m)
                elif any(fk in label_name for fk in SEM_RECOVER_FURN):
                    n_c, c_lbls, c_stats, _ = cv2.connectedComponentsWithStats(fill_m)
                    for cid in range(1, n_c):
                        c_area = int(c_stats[cid, cv2.CC_STAT_AREA])
                        if c_area < 180:
                            continue
                        cy1 = int(c_stats[cid, cv2.CC_STAT_TOP])
                        cx1 = int(c_stats[cid, cv2.CC_STAT_LEFT])
                        cy2 = cy1 + int(c_stats[cid, cv2.CC_STAT_HEIGHT])
                        cx2 = cx1 + int(c_stats[cid, cv2.CC_STAT_WIDTH])
                        if cy2 >= int(orig_h * 0.42):
                            comp_m = (c_lbls == cid).astype(np.uint8)
                            base_furniture_mask = cv2.bitwise_or(base_furniture_mask, comp_m)
                            detected_instances.append({
                                "id": next_id,
                                "label": label_name,
                                "area": c_area,
                                "box": [cx1, cy1, cx2, cy2],
                                "y_max": cy2,
                                "mask": comp_m,
                            })
                            next_id += 1

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
        VERIFIED_CLASSES = [
            7, 10, 15, 17, 19, 23, 24, 30, 33, 35, 36, 39, 41, 42,
            57, 62, 64, 65, 69, 75, 76, 85, 97, 98, 110, 115, 125, 131, 135, 137,
        ]
        WALL_CLASSES = [0]
        UPPER_CLASSES = [5, 8, 18, 22, 25]

        actual_floor_mask = np.isin(seg_map, [c for c in GROUND_CLASSES if c != CLASS_RUG]).astype(np.uint8)
        existing_rug_mask = (seg_map == CLASS_RUG).astype(np.uint8)
        base_furniture_mask = np.isin(seg_map, VERIFIED_CLASSES).astype(np.uint8)
        wall_mask = np.isin(seg_map, WALL_CLASSES).astype(np.uint8)
        upper_structure_mask = np.isin(seg_map, UPPER_CLASSES).astype(np.uint8)

        # Prevent flat patterned carpet motifs misclassified by SegFormer-B0 as tiny scattered furniture islands
        if existing_rug_mask.sum() > (total_pixels * 0.015):
            rug_fill_env = cv2.morphologyEx(existing_rug_mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (19, 19)))
            env_cnts, env_hier = cv2.findContours(rug_fill_env, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
            if env_hier is not None:
                for idx, cnt in enumerate(env_cnts):
                    if env_hier[0][idx][3] != -1 and cv2.contourArea(cnt) <= total_pixels * 0.025:
                        cv2.drawContours(rug_fill_env, [cnt], -1, 1, -1)
            rug_interior = cv2.erode(rug_fill_env, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)))

        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(base_furniture_mask)
        for lbl in range(1, num_labels):
            obj_top = stats[lbl, cv2.CC_STAT_TOP]
            obj_left = stats[lbl, cv2.CC_STAT_LEFT]
            obj_w = stats[lbl, cv2.CC_STAT_WIDTH]
            obj_h = stats[lbl, cv2.CC_STAT_HEIGHT]
            area = stats[lbl, cv2.CC_STAT_AREA]
            if area > 100:
                comp = (labels == lbl).astype(np.uint8)
                # Suppress flat low-contrast carpet motifs entirely enclosed inside the carpet
                if existing_rug_mask.sum() > (total_pixels * 0.015) and area < (total_pixels * 0.015):
                    inside_frac = float((comp & rug_interior).sum()) / float(max(1, area))
                    if inside_frac > 0.90 and (obj_top + obj_h) > int(orig_h * 0.62) and obj_h < int(orig_h * 0.14):
                        base_furniture_mask[comp > 0] = 0
                        continue
                detected_instances.append({
                    "id": lbl,
                    "label": "furniture",
                    "area": int(area),
                    "box": [obj_left, obj_top, obj_left + obj_w, obj_top + obj_h],
                    "y_max": obj_top + obj_h,
                    "mask": comp,
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

    # Relax only the thin ~0.2% bottom fringe of wall obstacles along shadowed baseboard crevices
    # while keeping painted walls/baseboards strongly protected against upward bleed.
    seam_peel_px = max(1, int(round(orig_h * 0.002)))
    verified_wall_core = np.zeros_like(true_wall_obstacle)
    if seam_peel_px < orig_h:
        verified_wall_core[:-seam_peel_px, :] = cv2.bitwise_and(
            true_wall_obstacle[:-seam_peel_px, :],
            true_wall_obstacle[seam_peel_px:, :]
        )
    hard_upper_core = cv2.bitwise_or(verified_wall_core, upper_structure_mask)
    hard_upper_core[int(orig_h * 0.72):, :] = 0

    # Distant candidate zone: lower/mid room space where floor could reside
    candidate_zone = np.zeros((orig_h, orig_w), dtype=np.uint8)
    candidate_zone[int(orig_h * 0.38):, :] = 1
    candidate_floor = cv2.bitwise_and(candidate_zone, cv2.bitwise_not(hard_upper_core * 255))
    candidate_floor = cv2.bitwise_and(candidate_floor, cv2.bitwise_not(base_furniture_mask * 255))

    # Geodesic chromatic + baseboard-edge propagation from verified floor seed into candidate floor
    raw_ground_seed = cv2.bitwise_or(actual_floor_mask, existing_rug_mask)
    if raw_ground_seed.sum() > (total_pixels * 0.02):
        img_lab = cv2.cvtColor(img_cv, cv2.COLOR_BGR2LAB)
        # Sample lower/mid verified floor where confidence is highest
        fg_sample_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)
        fg_sample_mask[int(orig_h * 0.62):, :] = 1
        fg_floor_samples = cv2.bitwise_and(raw_ground_seed, fg_sample_mask)

        # Build vertical baseboard/wall-seam barrier from Lab gradient so growth stops crisply at baseboards
        lab_smooth = cv2.GaussianBlur(img_lab.astype(np.float32), (3, 3), 0)
        dy_lab = np.zeros((orig_h, orig_w), dtype=np.float32)
        dy_lab[1:-1, :] = np.sqrt(np.sum((lab_smooth[2:, :, :] - lab_smooth[:-2, :, :]) ** 2, axis=2))
        mid_band = dy_lab[int(orig_h * 0.45):int(orig_h * 0.85), :]
        edge_thresh = min(14.5, max(8.5, float(np.percentile(mid_band, 76.0)))) if mid_band.size else 10.5
        baseboard_barrier = cv2.dilate(
            (dy_lab > edge_thresh).astype(np.uint8),
            cv2.getStructuringElement(cv2.MORPH_RECT, (1, 3))
        )
        baseboard_barrier[raw_ground_seed > 0] = 0

        chroma_dist_sq = np.zeros((orig_h, orig_w), dtype=np.float32)
        lum_ok = np.ones((orig_h, orig_w), dtype=bool)
        if fg_floor_samples.sum() > 200:
            lab_l = img_lab[:, :, 0]
            lab_a = img_lab[:, :, 1]
            lab_b = img_lab[:, :, 2]
            mean_a = float(np.mean(lab_a[fg_floor_samples > 0]))
            mean_b = float(np.mean(lab_b[fg_floor_samples > 0]))
            std_a = float(np.std(lab_a[fg_floor_samples > 0])) + 3.5
            std_b = float(np.std(lab_b[fg_floor_samples > 0])) + 3.5
            l_p10 = float(np.percentile(lab_l[fg_floor_samples > 0], 5.0))
            l_p98 = float(np.percentile(lab_l[fg_floor_samples > 0], 98.0))

            # Chromaticity + brightness check stops bleached/light baseboards matching warm floor tints
            chroma_dist_sq = ((lab_a.astype(np.float32) - mean_a) / std_a) ** 2 + ((lab_b.astype(np.float32) - mean_b) / std_b) ** 2
            lum_ok = (lab_l.astype(np.float32) >= max(8.0, l_p10 * 0.24)) & (lab_l.astype(np.float32) <= min(250.0, l_p98 + 14.0))
            chroma_match = ((chroma_dist_sq < 8.5) & lum_ok).astype(np.uint8)
            candidate_floor = cv2.bitwise_and(candidate_floor, chroma_match * 255)

        # Rescue shadowed corner pockets tucked next to verified floor and free of furniture/wall core
        corner_shadow_zone = cv2.dilate(raw_ground_seed, cv2.getStructuringElement(cv2.MORPH_RECT, (25, 11)))
        shadow_rescue = (
            (corner_shadow_zone > 0)
            & (base_furniture_mask == 0)
            & (upper_structure_mask == 0)
            & (verified_wall_core == 0)
            & (baseboard_barrier == 0)
            & lum_ok
        ).astype(np.uint8)
        if fg_floor_samples.sum() > 200:
            shadow_rescue = cv2.bitwise_and(shadow_rescue, (chroma_dist_sq < 12.5).astype(np.uint8))

        # Morphological closing to seal tile grout lines and small shadows without expanding boundaries
        kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        recovered_ground = cv2.morphologyEx(raw_ground_seed, cv2.MORPH_CLOSE, kernel_close)

        # Iterative geodesic floodfill up to the true baseboard seam (never jumping barriers or furniture)
        grow_mask = (((candidate_floor > 0) | (shadow_rescue > 0)) & (baseboard_barrier == 0)).astype(np.uint8)
        grow_steps = max(12, int(round(orig_h * 0.028)))
        k_step = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        for _ in range(grow_steps):
            nxt = cv2.bitwise_and(cv2.dilate(recovered_ground, k_step), grow_mask)
            nxt = cv2.bitwise_or(recovered_ground, nxt)
            if np.array_equal(nxt, recovered_ground):
                break
            recovered_ground = nxt

        # Strictly exclude all furniture and existing rugs
        recovered_ground = cv2.bitwise_and(recovered_ground, cv2.bitwise_not(base_furniture_mask))
        actual_floor_mask = cv2.bitwise_and(recovered_ground, cv2.bitwise_not(existing_rug_mask))

    # Heal internal unlabelled pattern cutouts completely surrounded inside a boldly patterned existing carpet
    # without ever touching verified furniture, walls, or upper structures.
    if existing_rug_mask.sum() > (total_pixels * 0.015):
        rug_bridge = cv2.morphologyEx(
            existing_rug_mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
        )
        r_cnts, r_hier = cv2.findContours(rug_bridge, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        if r_hier is not None:
            rug_hole_fill = np.zeros_like(existing_rug_mask)
            for idx, cnt in enumerate(r_cnts):
                if r_hier[0][idx][3] != -1 and cv2.contourArea(cnt) <= total_pixels * 0.035:
                    cv2.drawContours(rug_hole_fill, [cnt], -1, 1, -1)
            safe_rug_fill = (
                (rug_hole_fill > 0)
                & (base_furniture_mask == 0)
                & (true_wall_obstacle == 0)
                & (upper_structure_mask == 0)
            ).astype(np.uint8)
            existing_rug_mask = cv2.bitwise_or(existing_rug_mask, safe_rug_fill)
            actual_floor_mask = cv2.bitwise_and(actual_floor_mask, cv2.bitwise_not(existing_rug_mask))

    if existing_rug_mask.sum() > (total_pixels * 0.015):
        # Rescue foreground raised bedding/seating at bottom corners if merged into existing_rug_mask.
        rug_lab = cv2.cvtColor(img_cv, cv2.COLOR_BGR2LAB).astype(np.float32)
        cy0, cy1 = int(orig_h * 0.55), int(orig_h * 0.88)
        cx0, cx1 = int(orig_w * 0.36), int(orig_w * 0.76)
        core_slice = (existing_rug_mask[cy0:cy1, cx0:cx1] > 0)
        core_pixels = rug_lab[cy0:cy1, cx0:cx1][core_slice] if int(core_slice.sum()) >= 300 else rug_lab[existing_rug_mask > 0]
        if len(core_pixels) >= 200:
            med_rug_lab = np.median(core_pixels, axis=0)
            delta_e = np.linalg.norm(rug_lab - med_rug_lab[None, None, :], axis=2)
            corner_boxes, corner_pts = [], []
            for x0_f, x1_f in ((0.0, 0.55), (0.45, 1.0)):
                xc0, xc1 = int(orig_w * x0_f), int(orig_w * x1_f)
                yc0 = int(orig_h * 0.66)
                cand_m = np.zeros((orig_h, orig_w), dtype=np.uint8)
                cand_m[yc0:, xc0:xc1] = ((existing_rug_mask[yc0:, xc0:xc1] > 0) & (delta_e[yc0:, xc0:xc1] > 38.0)).astype(np.uint8)
                cand_m = cv2.morphologyEx(cand_m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)))
                n_rc, _, rc_stats, rc_cents = cv2.connectedComponentsWithStats(cand_m)
                for rcid in range(1, n_rc):
                    rc_area = int(rc_stats[rcid, cv2.CC_STAT_AREA])
                    rx1 = int(rc_stats[rcid, cv2.CC_STAT_LEFT])
                    ry1 = int(rc_stats[rcid, cv2.CC_STAT_TOP])
                    rx2 = rx1 + int(rc_stats[rcid, cv2.CC_STAT_WIDTH])
                    ry2 = ry1 + int(rc_stats[rcid, cv2.CC_STAT_HEIGHT])
                    if rc_area >= int(0.012 * total_pixels) and ry2 >= int(0.94 * orig_h) and (rx1 <= int(0.06 * orig_w) or rx2 >= int(0.94 * orig_w)):
                        corner_pts.append([int(rc_cents[rcid][0]), int(rc_cents[rcid][1])])
                        corner_boxes.append([max(0, rx1 - 12), max(0, ry1 - 12), min(orig_w, rx2 + 20), orig_h])
            if corner_boxes:
                try:
                    sam_proc_c, sam_model_c = get_sam()
                    sc_in = sam_proc_c(
                        pil_img,
                        input_boxes=[corner_boxes],
                        input_points=[[[pt] for pt in corner_pts]],
                        input_labels=[[[1] for _ in corner_pts]],
                        return_tensors="pt",
                    ).to(CPU_DEVICE)
                    with torch.no_grad():
                        sc_out = sam_model_c(**sc_in)
                    sc_masks = sam_proc_c.post_process_masks(
                        sc_out.pred_masks.cpu(),
                        sc_in["original_sizes"].cpu(),
                        sc_in["reshaped_input_sizes"].cpu(),
                    )[0]
                    sc_ious = sc_out.iou_scores.cpu()[0]
                    next_bed_id = max([int(inst["id"]) for inst in detected_instances], default=0) + 1
                    for bi in range(len(corner_boxes)):
                        b_best = int(torch.argmax(sc_ious[bi]).item())
                        m_bed = (sc_masks[bi, b_best].numpy() > 0).astype(np.uint8)
                        by_i, bx_i = np.where(m_bed > 0)
                        if float(sc_ious[bi, b_best].item()) >= 0.88 and int(0.012 * total_pixels) <= len(by_i) <= int(0.22 * total_pixels):
                            mx1, my1, mx2, my2 = int(bx_i.min()), int(by_i.min()), int(bx_i.max()), int(by_i.max())
                            rest_rug = (existing_rug_mask > 0) & (m_bed == 0)
                            lab_gap = float(np.linalg.norm(np.median(rug_lab[m_bed > 0], axis=0) - med_rug_lab))
                            if (mx2 - mx1) <= int(0.58 * orig_w) and my2 >= int(0.94 * orig_h) and my1 >= int(0.60 * orig_h) and int(rest_rug.sum()) >= int(0.015 * total_pixels) and lab_gap >= 40.0:
                                m_bed_dil = cv2.dilate(m_bed, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7)))
                                existing_rug_mask[m_bed_dil > 0] = 0
                                base_furniture_mask = cv2.bitwise_or(base_furniture_mask, m_bed)
                                detected_instances.append({
                                    "id": next_bed_id,
                                    "label": "bed",
                                    "area": int(len(by_i)),
                                    "box": [mx1, my1, mx2, my2],
                                    "y_max": my2,
                                    "mask": m_bed,
                                })
                                next_bed_id += 1
                except Exception as bed_sam_err:
                    print(f"[RoomIQ] Foreground corner rescue warning: {bed_sam_err}")

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
        rug_clean = cv2.morphologyEx(existing_rug_mask * 255, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7)))
        kernel_rug = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
        rug_closed = cv2.morphologyEx(rug_clean, cv2.MORPH_CLOSE, kernel_rug)
        rug_contours, _ = cv2.findContours(rug_closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if rug_contours:
            largest_rug = max(rug_contours, key=cv2.contourArea)
            rug_area = cv2.contourArea(largest_rug)

            if rug_area > (total_pixels * 0.012):
                peri = cv2.arcLength(largest_rug, True)
                approx = cv2.approxPolyDP(largest_rug, 0.025 * peri, True)
                rect = cv2.minAreaRect(largest_rug)
                rect_box = cv2.boxPoints(rect)

                # Prefer the actual four-sided contour to a rotated bounding box. A
                # phone camera sees a rug as a projective trapezoid, not a rectangle;
                # replacing it with minAreaRect is what flattens perspective and makes
                # dimensions drift. Fall back only when segmentation is too irregular.
                if len(approx) == 4 and cv2.isContourConvex(approx):
                    quad = approx.reshape(4, 2).astype(np.float32)
                else:
                    quad = rect_box.astype(np.float32)

                # Metric calibration expects [near-left, near-right, far-right,
                # far-left]. OpenCV returns minAreaRect points in implementation-
                # dependent order, so normalize the order before returning it.
                y_order = np.argsort(quad[:, 1])
                far_pair = quad[y_order[:2]]
                near_pair = quad[y_order[-2:]]
                far_pair = far_pair[np.argsort(far_pair[:, 0])]
                near_pair = near_pair[np.argsort(near_pair[:, 0])]
                ordered_quad = np.array(
                    [near_pair[0], near_pair[1], far_pair[1], far_pair[0]],
                    dtype=np.float32,
                )
                box = np.int32(np.rint(ordered_quad))

                poly_pts = [[round(float(pt[0][0] / orig_w), 4), round(float(pt[0][1] / orig_h), 4)] for pt in approx]
                box_corners = [[round(float(pt[0] / orig_w), 4), round(float(pt[1] / orig_h), 4)] for pt in box]

                center_u = round(float(rect[0][0] / orig_w), 4)
                center_v = round(float(rect[0][1] / orig_h), 4)
                size_u = round(float(rect[1][0] / orig_w), 4)
                size_v = round(float(rect[1][1] / orig_h), 4)
                # Fold OpenCV minAreaRect orientation unambiguously onto horizontal ground axis in [-45, +45] deg
                best_edge_deg = 0.0
                best_horiz_score = -1.0
                for ei in range(4):
                    p0 = box[ei]
                    p1 = box[(ei + 1) % 4]
                    dx = float(p1[0] - p0[0])
                    dy = float(p1[1] - p0[1])
                    if dx < 0:
                        dx, dy = -dx, -dy
                    elen = math.hypot(dx, dy)
                    if elen > 1e-3 and abs(dx) >= abs(dy):
                        deg = math.degrees(math.atan2(dy, dx))
                        if elen > best_horiz_score:
                            best_horiz_score = elen
                            best_edge_deg = deg
                angle = round(float(best_edge_deg), 2)
                if abs(angle) < 3.5:
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

    # 3. Robust Floor Quad & Horizon Ray Estimation (Calibrated to Pinhole Geometry & Furniture Scale)
    is_handheld_pitched = False
    if ground_pixel_count < (total_pixels * 0.012):
        horizon_y = 0.65
        near_y = 0.995
        x_vp, y_vp = 0.50, 0.39
        near_left_x, near_right_x = 0.02, 0.98
        ray_L = (near_left_x - x_vp) / (near_y - y_vp)
        ray_R = (near_right_x - x_vp) / (near_y - y_vp)
        far_left_x = float(x_vp + ray_L * (horizon_y - y_vp))
        far_right_x = float(x_vp + ray_R * (horizon_y - y_vp))
    else:
        y_indices, x_indices = np.where(traversable_ground_mask > 0)
        # Find exposed back-wall baseboard row from columns where true vertical wall meets floor
        # (no foreground furniture body in the band directly above, and vertical wall directly above)
        # so neither deep foreground sofas nor curtains/recessed cabinets skew horizon_y.
        wall_seam_ys = []
        backdrop_seam_ys = []
        col_top_ys = []
        x_start_band, x_end_band = int(orig_w * 0.14), int(orig_w * 0.86)
        cx_mid_start, cx_mid_end = int(orig_w * 0.22), int(orig_w * 0.78)
        furn_band_px = max(14, int(round(orig_h * 0.022)))
        wall_band_px = max(8, int(round(orig_h * 0.014)))
        wall_or_window = cv2.bitwise_or(true_wall_obstacle, upper_structure_mask)
        step_cx = max(2, orig_w // 240)
        for cx in range(x_start_band, x_end_band, step_cx):
            ys_c = np.where(traversable_ground_mask[:, cx] > 0)[0]
            if len(ys_c) > 0:
                yt = int(ys_c[0])
                above_y = max(0, yt - 3)
                if base_furniture_mask[above_y, cx] == 0:
                    col_top_ys.append(yt)
                    has_furn_above = bool(base_furniture_mask[max(0, yt - furn_band_px):yt + 1, cx].any())
                    if not has_furn_above:
                        y0_w = max(0, yt - wall_band_px)
                        if true_wall_obstacle[y0_w:yt + 1, cx].any():
                            wall_seam_ys.append(yt)
                        elif cx_mid_start <= cx <= cx_mid_end and wall_or_window[y0_w:yt + 1, cx].any():
                            backdrop_seam_ys.append(yt)
        if len(wall_seam_ys) + len(backdrop_seam_ys) < 6:
            # In bed-heavy or tight rooms, exposed floor baseboards often sit near left/right edges
            for cx in range(int(orig_w * 0.03), int(orig_w * 0.97), step_cx):
                if x_start_band <= cx < x_end_band:
                    continue
                ys_c = np.where(traversable_ground_mask[:, cx] > 0)[0]
                if len(ys_c) > 0:
                    yt = int(ys_c[0])
                    if base_furniture_mask[max(0, yt - 3), cx] == 0:
                        col_top_ys.append(yt)
                        if not base_furniture_mask[max(0, yt - furn_band_px):yt + 1, cx].any():
                            y0_w = max(0, yt - wall_band_px)
                            if wall_or_window[y0_w:yt + 1, cx].any():
                                wall_seam_ys.append(yt)
        combined_seam_ys = wall_seam_ys + backdrop_seam_ys
        if len(combined_seam_ys) >= 6:
            horizon_y = float(np.percentile(combined_seam_ys, 16.0) / orig_h)
        elif len(col_top_ys) >= 12:
            horizon_y = float(np.percentile(col_top_ys, 24.0) / orig_h)
        else:
            horizon_y = float(np.percentile(y_indices, 1.8) / orig_h)
        horizon_y = max(0.38, min(0.78, horizon_y))
        near_y = float(np.percentile(y_indices, 98.8) / orig_h)
        near_y = min(0.995, max(near_y, horizon_y + 0.16))

        far_band_y0 = min(orig_h - 2, max(0, int((horizon_y + 0.02) * orig_h)))
        far_band_y1 = min(orig_h, max(far_band_y0 + 2, int((horizon_y + 0.10) * orig_h)))
        far_band_xs = np.where(traversable_ground_mask[far_band_y0:far_band_y1, :] > 0)[1]
        exp_far_left = 0.30
        exp_far_right = 0.70
        exp_far_span = 0.40
        if len(far_band_xs) > 40:
            exp_far_left = float(np.percentile(far_band_xs, 5.0)) / orig_w
            exp_far_right = float(np.percentile(far_band_xs, 95.0)) / orig_w
            exp_far_span = exp_far_right - exp_far_left

        aspect_pre = float(orig_w) / float(max(1, orig_h))
        is_handheld_pitched = bool(horizon_y < 0.538 or (aspect_pre <= 1.45 and horizon_y <= 0.615))
        prior_y_vp = max(0.04 if is_handheld_pitched else 0.24, min(0.48, horizon_y - (0.44 if is_handheld_pitched else 0.22)))
        x_vp = 0.50
        y_vp = prior_y_vp

        # Estimate vanishing point from clean architectural & floor-border rays (excluding foreground clutter)
        try:
            roi_top = max(0, int(0.05 * orig_h))
            roi_bot = int(0.95 * orig_h)
            gray_roi = cv2.cvtColor(img_cv[roi_top:roi_bot, :], cv2.COLOR_BGR2GRAY)
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
            edges = cv2.Canny(clahe.apply(gray_roi), 35, 105, apertureSize=3)

            # Suppress dense inner carpet patterns and tabletop/bed/seat clutter so true structural perspective dominates
            struct_mask = np.ones((orig_h, orig_w), dtype=np.uint8)
            if has_existing_rug:
                rug_inner = cv2.erode(existing_rug_mask, cv2.getStructuringElement(cv2.MORPH_RECT, (17, 17)))
                struct_mask[rug_inner > 0] = 0
            for inst in detected_instances:
                lbl_l = inst["label"]
                if any(ck in lbl_l for ck in [
                    "bottle", "box", "cushion", "pillow", "bag", "book", "vase", "clothes",
                    "blanket", "tray", "person", "bed", "armchair", "chair", "coffee table",
                ]):
                    struct_mask[inst["mask"] > 0] = 0
            edges = cv2.bitwise_and(edges, struct_mask[roi_top:roi_bot, :] * 255)

            h_lines = cv2.HoughLinesP(
                edges,
                1,
                np.pi / 180,
                threshold=45,
                minLineLength=max(36, int(0.08 * orig_w)),
                maxLineGap=14,
            )
            left_rays, right_rays = [], []
            if h_lines is not None:
                for hl in h_lines:
                    lx1, ly1, lx2, ly2 = hl[0]
                    ly1 += roi_top
                    ly2 += roi_top
                    if ly2 < ly1:
                        lx1, ly1, lx2, ly2 = lx2, ly2, lx1, ly1
                    ang = abs(np.degrees(np.arctan2(ly2 - ly1, lx2 - lx1)))
                    if 14.0 <= ang <= 76.0 or 104.0 <= ang <= 166.0:
                        seg_len = math.hypot(lx2 - lx1, ly2 - ly1) / float(max(1, orig_w))
                        seg = (lx1 / orig_w, ly1 / orig_h, lx2 / orig_w, ly2 / orig_h, seg_len)
                        if seg[2] < seg[0] and seg[2] < 0.48:
                            left_rays.append(seg)
                        elif seg[2] > seg[0] and seg[2] > 0.52:
                            right_rays.append(seg)

            # Also add authentic carpet left/right perspective borders when clearly visible
            if has_existing_rug and existing_rug_data.get("corners"):
                rug_polys, _ = cv2.findContours(
                    cv2.morphologyEx(existing_rug_mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))),
                    cv2.RETR_EXTERNAL,
                    cv2.CHAIN_APPROX_SIMPLE,
                )
                if rug_polys:
                    rcnt = max(rug_polys, key=cv2.contourArea)
                    ry_lo = int((horizon_y + 0.03) * orig_h)
                    ry_hi = int(0.90 * orig_h)
                    pts_r = rcnt.reshape(-1, 2)
                    band_pts = pts_r[(pts_r[:, 1] >= ry_lo) & (pts_r[:, 1] <= ry_hi)]
                    if len(band_pts) >= 6:
                        left_pts, right_pts = [], []
                        for by in np.linspace(ry_lo, ry_hi, 8, dtype=int):
                            row_xs = np.where(existing_rug_mask[max(0, by - 3):min(orig_h, by + 4), :] > 0)[1]
                            if len(row_xs) > int(0.15 * orig_w):
                                lx_r = int(row_xs.min())
                                rx_r = int(row_xs.max())
                                if lx_r > int(0.03 * orig_w) and base_furniture_mask[by, max(0, lx_r - 6)] == 0:
                                    left_pts.append([lx_r / orig_w, by / orig_h])
                                if rx_r < int(0.97 * orig_w) and base_furniture_mask[by, min(orig_w - 1, rx_r + 6)] == 0:
                                    right_pts.append([rx_r / orig_w, by / orig_h])
                        if len(left_pts) >= 3:
                            lp = np.array(left_pts)
                            m_l, b_l = np.polyfit(lp[:, 1], lp[:, 0], 1)
                            if 0.06 <= abs(m_l) <= 1.2:
                                left_rays.append((float(m_l * lp[0, 1] + b_l), float(lp[0, 1]), float(m_l * lp[-1, 1] + b_l), float(lp[-1, 1]), 0.35))
                        if len(right_pts) >= 3:
                            rp = np.array(right_pts)
                            m_r, b_r = np.polyfit(rp[:, 1], rp[:, 0], 1)
                            if 0.06 <= abs(m_r) <= 1.2:
                                right_rays.append((float(m_r * rp[0, 1] + b_r), float(rp[0, 1]), float(m_r * rp[-1, 1] + b_r), float(rp[-1, 1]), 0.35))

            left_rays.sort(key=lambda s: -s[4])
            right_rays.sort(key=lambda s: -s[4])
            vp_xs, vp_ys, vp_ws = [], [], []
            min_py_allowed = -0.06 if is_handheld_pitched else 0.14
            for l1 in left_rays[:20]:
                for l2 in right_rays[:20]:
                    ax1, ay1, ax2, ay2, len1 = l1
                    bx1, by1, bx2, by2, len2 = l2
                    den = (ax1 - ax2) * (by1 - by2) - (ay1 - ay2) * (bx1 - bx2)
                    if abs(den) > 1e-4:
                        px = ((ax1 * ay2 - ay1 * ax2) * (bx1 - bx2) - (ax1 - ax2) * (bx1 * by2 - by1 * bx2)) / den
                        py = ((ax1 * ay2 - ay1 * ax2) * (by1 - by2) - (ay1 - ay2) * (bx1 * by2 - by1 * bx2)) / den
                        if 0.37 <= px <= 0.63 and min_py_allowed <= py <= (horizon_y - 0.08):
                            vp_xs.append(px)
                            vp_ys.append(py)
                            vp_ws.append(max(0.01, float(len1 * len2)))
            if len(vp_ys) >= 4 and float(np.std(vp_ys)) < 0.15:
                w_arr = np.asarray(vp_ws, dtype=np.float64)
                y_arr = np.asarray(vp_ys, dtype=np.float64)
                x_arr = np.asarray(vp_xs, dtype=np.float64)
                order_y = np.argsort(y_arr)
                cum_w = np.cumsum(w_arr[order_y])
                med_y = float(y_arr[order_y][np.searchsorted(cum_w, cum_w[-1] * 0.5)]) if len(y_arr) else prior_y_vp
                y_vp = 0.65 * med_y + 0.35 * prior_y_vp
                y_vp_floor = -0.04 if is_handheld_pitched else max(0.24, horizon_y - 0.29)
                y_vp_ceil = horizon_y - (0.37 if is_handheld_pitched else (0.18 if horizon_y <= 0.68 else 0.12))
                y_vp = max(y_vp_floor, min(0.49, y_vp_ceil, y_vp))
                if len(vp_xs) >= 6 and float(np.std(vp_xs)) < 0.09:
                    order_x = np.argsort(x_arr)
                    cum_wx = np.cumsum(w_arr[order_x])
                    med_x = float(x_arr[order_x][np.searchsorted(cum_wx, cum_wx[-1] * 0.5)])
                    x_vp = max(0.42, min(0.58, 0.55 * med_x + 0.45 * 0.50))
        except Exception:
            y_vp = prior_y_vp

        near_left_x = 0.02
        near_right_x = 0.98

        # Anti-pinch safeguard: downward-pitched handheld rooms and squeezed wide rooms keep natural perspective width
        if is_handheld_pitched:
            target_far_span = min(0.54, max(0.45, exp_far_span * 0.72)) if exp_far_span > 0.48 else 0.45
            min_ratio = target_far_span / (near_right_x - near_left_x)
            max_safe_y_vp = (horizon_y - min_ratio * near_y) / max(0.05, 1.0 - min_ratio)
            y_vp = min(y_vp, max(-0.04, min(horizon_y - 0.37, max_safe_y_vp)))

        ray_L = (near_left_x - x_vp) / (near_y - y_vp)
        ray_R = (near_right_x - x_vp) / (near_y - y_vp)

        far_left_x = max(0.08, min(0.45, float(x_vp + ray_L * (horizon_y - y_vp))))
        far_right_x = min(0.92, max(0.55, float(x_vp + ray_R * (horizon_y - y_vp))))

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

    # Pinhole metric estimation anchored by detected primary furniture dimensions
    aspect = float(orig_w) / float(max(1, orig_h))
    near_span_norm = near_right_x - near_left_x
    dy_near = max(0.18, near_y - y_vp)
    dy_far = max(0.09, horizon_y - y_vp)

    # Level-camera pinhole model (y_vp >= 0.28) blended smoothly with tilted handheld camera geometry (y_vp < 0.28)
    h_cam_level = 3.7
    f_x_level = 0.90 if aspect >= 1.1 else (0.85 / max(0.5, aspect))
    level_width_ft = near_span_norm * h_cam_level * aspect / dy_near
    level_depth_ft = h_cam_level * (aspect * f_x_level) * ((1.0 / dy_far) - (1.0 / dy_near))

    if y_vp < 0.28 or is_handheld_pitched:
        tilt_blend = min(1.0, max(0.70 if is_handheld_pitched else 0.0, (0.32 - y_vp) / 0.16))
        h_cam_tilt = 5.0
        f_x_tilt = 0.72 if aspect >= 1.1 else (0.68 / max(0.5, aspect))
        f_y_tilt = f_x_tilt * aspect
        tilt_rad = math.atan2(max(0.0, 0.50 - y_vp), f_y_tilt)
        beta_far = max(0.14, tilt_rad + math.atan2(horizon_y - 0.50, f_y_tilt))
        beta_near = min(1.38, tilt_rad + math.atan2(near_y - 0.50, f_y_tilt))
        z_far_tilt = h_cam_tilt / math.tan(beta_far)
        z_near_tilt = h_cam_tilt / math.tan(beta_near)
        tilt_depth_ft = max(9.0 if is_handheld_pitched else 8.2, z_far_tilt - z_near_tilt)
        tilt_width_ft = near_span_norm * math.hypot(h_cam_tilt, z_near_tilt) / f_x_tilt
        pinhole_width_ft = (1.0 - tilt_blend) * level_width_ft + tilt_blend * tilt_width_ft
        pinhole_depth_ft = (1.0 - tilt_blend) * level_depth_ft + tilt_blend * tilt_depth_ft
    else:
        pinhole_width_ft = level_width_ft
        pinhole_depth_ft = level_depth_ft

    all_labels_joined = " ".join(i["label"] for i in detected_instances)
    is_tight_floor_shot = ground_pixel_count < (total_pixels * 0.08)
    has_wide_bed = False
    anchor_estimates = []
    for inst in detected_instances:
        lbl = inst["label"]
        bx1, by1, bx2, by2 = inst["box"]
        bw_norm = (bx2 - bx1) / float(max(1, orig_w))
        bh_norm = (by2 - by1) / float(max(1, orig_h))
        touches_both_edges = (bx1 <= int(0.02 * orig_w)) and (bx2 >= int(0.98 * orig_w))
        touches_edge = (bx1 <= int(0.02 * orig_w)) or (bx2 >= int(0.98 * orig_w))
        if "bed" in lbl and bw_norm >= 0.30:
            has_wide_bed = True
        allow_bed_tight = is_tight_floor_shot and ("bed" in lbl) and bw_norm >= 0.35 and not touches_both_edges
        if (touches_edge and not allow_bed_tight) or bw_norm < 0.16:
            continue

        expected_ft = None
        if ("sofa" in lbl or "couch" in lbl) and bw_norm >= 0.28 and (bw_norm * aspect) > (bh_norm * 1.15):
            if bw_norm >= 0.58:
                expected_ft = 9.2
            elif bw_norm >= 0.45:
                expected_ft = 8.0
            else:
                expected_ft = 6.4
        elif ("wardrobe" in lbl or "closet" in lbl) and bw_norm >= 0.18 and bh_norm >= 0.35:
            expected_ft = 5.1 if bw_norm >= 0.27 else 3.6
        elif "bed" in lbl and bw_norm >= 0.18 and (bw_norm * aspect) > (bh_norm * (1.05 if is_tight_floor_shot else 1.75)):
            expected_ft = 6.2
        elif "desk" in lbl and bw_norm >= 0.22:
            expected_ft = 5.6
        elif ("dining" in lbl or "table" in lbl) and ("dining" in all_labels_joined or bw_norm >= 0.32) and (bw_norm * aspect) > (bh_norm * 1.25):
            expected_ft = 7.4 if bw_norm >= 0.34 else 6.0

        if expected_ft is not None:
            v_furn = max(horizon_y + 0.01, min(near_y, inst["y_max"] / float(max(1, orig_h))))
            span_at_furn = near_span_norm * (v_furn - y_vp) / dy_near
            raw_w_ft = expected_ft * (span_at_furn / bw_norm)
            max_anchor_mult = 1.85 if is_tight_floor_shot else 1.38
            clamped_w_ft = max(pinhole_width_ft * 0.78, min(pinhole_width_ft * max_anchor_mult, raw_w_ft))
            anchor_estimates.append(clamped_w_ft)

    if anchor_estimates:
        anchor_width_ft = float(np.median(anchor_estimates))
        raw_width_ft = 0.55 * anchor_width_ft + 0.45 * pinhole_width_ft
    else:
        raw_width_ft = pinhole_width_ft

    scale_factor = max(0.78, min(1.85 if (is_tight_floor_shot and has_wide_bed) else 1.32, raw_width_ft / max(0.1, pinhole_width_ft)))
    min_width_ft = 9.0 if (is_tight_floor_shot and has_wide_bed) else 5.5
    est_width_ft = round(max(min_width_ft, min(14.5, raw_width_ft)), 1)
    min_depth_ft = 9.0 if (is_tight_floor_shot and has_wide_bed) else (8.8 if is_handheld_pitched else 6.0)
    est_depth_ft = round(max(min_depth_ft, min(19.5, pinhole_depth_ft * scale_factor)), 1)
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

    # 4. Priority-Batched SAM High-Precision Boundary Refinement Pass
    floor_threshold_y = horizon_y - 0.15

    # A patterned or partially covered existing rug is valid floor, never furniture.
    # Panoptic models regularly split a high-contrast rug into tiny "object" instances;
    # treating those fragments as occluders is the direct cause of the punched-out rug
    # artefacts seen in consumer phone photographs. Keep only grounded physical objects
    # and be deliberately conservative for anonymous fallback components on a rug.
    STRUCTURAL_OCCLUDERS = (
        "table", "desk", "chair", "sofa", "couch", "bed", "cabinet", "wardrobe",
        "closet", "bookcase", "shelf", "bench", "ottoman", "stool", "armchair",
        "footstool", "pouf", "stand", "console", "sideboard", "credenza",
    )
    SMALL_GROUND_OCCLUDERS = ("plant", "pot", "basket", "box", "bag")

    def is_trustworthy_occluder(inst):
        lbl = str(inst["label"]).lower()
        bx1, by1, bx2, by2 = inst["box"]
        height_px = max(1, by2 - by1)
        area = max(1, int(inst["area"]))
        reaches_floor = (inst["y_max"] / float(orig_h)) >= floor_threshold_y
        if not reaches_floor:
            return False

        inst_mask = inst["mask"] > 0
        rug_overlap = 0.0
        if has_existing_rug:
            rug_overlap = float((inst_mask & (existing_rug_mask > 0)).sum()) / float(area)

        is_structural = any(token in lbl for token in STRUCTURAL_OCCLUDERS)
        is_small_ground = any(token in lbl for token in SMALL_GROUND_OCCLUDERS)
        if is_structural:
            return True
        if is_small_ground:
            # Small decor may occlude a rug only when it is not a carpet motif.
            return rug_overlap < 0.82 and height_px >= max(12, int(orig_h * 0.025))

        # SegFormer uses the generic "furniture" class for many visual fragments.
        # Retain only a substantial, vertically coherent, grounded component when it
        # sits largely inside an existing rug; this keeps a coffee table but removes
        # woven pattern islands and shadows.
        if lbl == "furniture":
            return rug_overlap < 0.48 or (
                height_px >= max(48, int(orig_h * 0.13))
                and by1 < int(orig_h * 0.84)
            )

        return rug_overlap < 0.35 and height_px >= max(56, int(orig_h * 0.14))

    sam_candidates = []
    furniture_columns = []
    detected_objects_summary = []

    HIGH_PRIORITY_LEGGED = ("coffee table", "table", "desk", "chair", "armchair", "swivel", "stool", "bench", "ottoman", "plant", "pot")
    MID_PRIORITY_ANCHORS = ("sofa", "couch", "bed", "cabinet", "wardrobe")
    SKIP_SAM_DECOR = ("cushion", "pillow", "book", "clock")

    for inst in detected_instances:
        bx1, by1, bx2, by2 = inst["box"]
        y_max = inst["y_max"]
        lbl = inst["label"]
        reaches_ground = (y_max / orig_h) >= floor_threshold_y
        is_occluder = is_trustworthy_occluder(inst)

        if is_occluder and inst["area"] > 150:
            furniture_columns.append((bx1, bx2, y_max))

            bw = bx2 - bx1
            bh = by2 - by1
            pad_x = int(bw * 0.08)
            pad_y_top = int(bh * 0.05)
            pad_y_bot = int(bh * 0.12)

            px1 = max(0, bx1 - pad_x)
            py1 = max(0, by1 - pad_y_top)
            px2 = min(orig_w, bx2 + pad_x)
            py2 = min(orig_h, by2 + pad_y_bot)

            if any(k in lbl for k in HIGH_PRIORITY_LEGGED):
                tier = 3
            elif any(k in lbl for k in MID_PRIORITY_ANCHORS):
                tier = 2
            elif any(k in lbl for k in SKIP_SAM_DECOR) and (y_max / orig_h) < (horizon_y + 0.08):
                tier = 0
            else:
                tier = 1

            if tier > 0:
                sam_candidates.append((tier, inst["area"], inst, [px1, py1, px2, py2]))

        detected_objects_summary.append({
            "instance_id": f"furn_{inst['id']}",
            "class_name": lbl,
            "bounding_box": [
                round(float(bx1 / orig_w), 4),
                round(float(by1 / orig_h), 4),
                round(float((bx2 - bx1) / orig_w), 4),
                round(float((by2 - by1) / orig_h), 4)
            ],
            "ground_contact_y": round(float(y_max / orig_h), 4),
            "occludes_rug": is_occluder
        })

    sam_candidates.sort(key=lambda item: (-item[0], -item[1]))
    top_sam_items = sam_candidates[:16]

    # Start from accepted, non-replaced instances so carpet texture fragments are
    # never re-filled blindly as foreground furniture.
    replaced_ids = set()
    sam_refined_mask = np.zeros((orig_h, orig_w), dtype=np.uint8)

    if top_sam_items:
        try:
            sam_proc, sam_model = get_sam()
            batch_size = 8
            for start_idx in range(0, len(top_sam_items), batch_size):
                chunk_items = top_sam_items[start_idx:start_idx + batch_size]
                chunk_boxes = [it[3] for it in chunk_items]
                s_inputs = sam_proc(pil_img, input_boxes=[chunk_boxes], return_tensors="pt").to(CPU_DEVICE)
                with torch.no_grad():
                    s_outputs = sam_model(**s_inputs)

                masks = sam_proc.post_process_masks(
                    s_outputs.pred_masks.cpu(),
                    s_inputs["original_sizes"].cpu(),
                    s_inputs["reshaped_input_sizes"].cpu()
                )[0]
                iou_scores = s_outputs.iou_scores.cpu()[0]

                for b_idx, (_, _, inst, box) in enumerate(chunk_items):
                    lbl_l = inst["label"]
                    best_idx = int(torch.argmax(iou_scores[b_idx]).item())
                    best_score = float(iou_scores[b_idx, best_idx].item())
                    m_np = (masks[b_idx, best_idx].numpy() > 0).astype(np.uint8)
                    # For carved/open-arch tables, prefer crisp fine-detail mask if nearly equal IoU leaves open arches un-cemented
                    if ("table" in lbl_l or "chair" in lbl_l) and iou_scores.shape[1] > 1:
                        best_area = max(1, int(m_np.sum()))
                        for cand_idx in range(iou_scores.shape[1]):
                            cand_score = float(iou_scores[b_idx, cand_idx].item())
                            if cand_idx != best_idx and cand_score >= (best_score - 0.09) and cand_score >= 0.72:
                                cand_m = (masks[b_idx, cand_idx].numpy() > 0).astype(np.uint8)
                                cand_area = int(cand_m.sum())
                                if 0.52 * best_area <= cand_area < 0.88 * best_area:
                                    m_np = cand_m
                                    best_area = cand_area
                    x1, y1, x2, y2 = box
                    box_clip = np.zeros((orig_h, orig_w), dtype=np.uint8)
                    box_clip[y1:y2, x1:x2] = 1

                    inst_mask = inst["mask"]
                    bx1, by1, bx2, by2 = inst["box"]
                    bw_i = max(1, bx2 - bx1)
                    bh_i = max(1, by2 - by1)
                    halo_k = max(11, min(29, int(round(max(bw_i, bh_i) * 0.05)) | 1))
                    halo = cv2.dilate(inst_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (halo_k, halo_k)))
                    # Allow slightly deeper leg/foot extension just under the detected base edge
                    foot_top = max(0, by2 - max(4, int(bh_i * 0.08)))
                    halo[foot_top:y2, x1:x2] = 1

                    sam_inst = (m_np & box_clip & halo).astype(np.uint8)
                    inst_area = max(1, int(inst_mask.sum()))
                    overlap_frac = float((sam_inst & inst_mask).sum()) / float(inst_area)

                    lbl_l = inst["label"]
                    is_legged = any(k in lbl_l for k in HIGH_PRIORITY_LEGGED)
                    if is_legged and overlap_frac >= 0.22 and int(sam_inst.sum()) >= 80:
                        # Replace thick lower OneFormer voids (carved coffee table arches, chair gaps) with SAM cutouts,
                        # while keeping upper tabletop/seat surfaces and <4.5px thin wire/wood legs intact.
                        split_y = min(orig_h, by1 + int(round(bh_i * 0.40)))
                        dist_map = cv2.distanceTransform(inst_mask, cv2.DIST_L2, 5)
                        thin_legs = ((inst_mask > 0) & (dist_map < 4.5)).astype(np.uint8)
                        refined = sam_inst.copy()
                        refined[:split_y, :] = cv2.bitwise_or(refined[:split_y, :], inst_mask[:split_y, :])
                        refined = cv2.bitwise_or(refined, thin_legs)
                        # Only remove thick pockets inside lower legged zone cleanly matched as background
                        sam_refined_mask = cv2.bitwise_or(sam_refined_mask, refined)
                        replaced_ids.add(inst["id"])
                    elif overlap_frac >= 0.30:
                        sam_refined_mask = cv2.bitwise_or(sam_refined_mask, sam_inst)
        except Exception as sam_err:
            print(f"[RoomIQ] SAM refinement warning: {sam_err}")

    # 5. Two-Tier Mask Fusion with Instance-Conditioned Proximity Grouping
    unreplaced_base = np.zeros((orig_h, orig_w), dtype=np.uint8)
    trusted_occluders = np.zeros((orig_h, orig_w), dtype=np.uint8)
    for inst in detected_instances:
        if is_trustworthy_occluder(inst):
            trusted_occluders = cv2.bitwise_or(trusted_occluders, inst["mask"].astype(np.uint8))
        if is_trustworthy_occluder(inst) and inst["id"] not in replaced_ids:
            unreplaced_base = cv2.bitwise_or(unreplaced_base, inst["mask"])

    fused_furn = cv2.bitwise_or(unreplaced_base * 255, sam_refined_mask * 255)

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

    # Fill only small interior pinholes without cementing open chair/coffee-table leg arches
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    clean_furn = cv2.morphologyEx(clean_furn, cv2.MORPH_CLOSE, kernel_close)
    contours, furn_hier = cv2.findContours(clean_furn, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    pinhole_max_area = max(90.0, total_pixels * 0.00018)
    if furn_hier is not None:
        for idx, cnt in enumerate(contours):
            if furn_hier[0][idx][3] != -1 and cv2.contourArea(cnt) <= pinhole_max_area:
                cv2.drawContours(clean_furn, [cnt], -1, 255, -1)

    if has_existing_rug:
        # Defensive final guard: after morphology, nothing inside a detected rug may
        # be an occluder unless it is connected to a trusted physical object. This is
        # intentionally applied after SAM so carved table legs remain intact.
        trusted_band = cv2.dilate(
            trusted_occluders,
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)),
        )
        clean_furn[(existing_rug_mask > 0) & (trusted_band == 0)] = 0

    # Enforce strict non-floor subtraction: floor mask must never penetrate furniture
    actual_floor_mask = cv2.bitwise_and(actual_floor_mask, cv2.bitwise_not((clean_furn > 128).astype(np.uint8)))

    # Save occlusion mask PNG (255 = foreground furniture, 0 = floor/rug)
    mask_id = uuid.uuid4().hex
    mask_filename = f"mask_{mask_id}.png"
    mask_path = os.path.join(OUTPUT_DIR, mask_filename)
    Image.fromarray(restore_source_resolution(clean_furn), mode="L").save(mask_path, format="PNG")

    # Authoritative Floor Support Mask for Roomvo-style Wall Boundary Disappearance
    # (255 = floor where rug can lie, including under furniture; 0 = wall/ceiling where rug is clipped)
    base_ground = cv2.bitwise_or((actual_floor_mask * 255).astype(np.uint8), (existing_rug_mask * 255).astype(np.uint8))
    base_ground = cv2.morphologyEx(base_ground, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7)))

    # Build column-wise floor top seam from exposed wall seams so furniture bases/skirts stay supported
    # without filling upper furniture bodies or gaps between chair/desk legs onto the back wall.
    col_has_ground = (base_ground > 128).any(axis=0)
    raw_seam = np.full(orig_w, horizon_y * orig_h, dtype=np.float32)
    if col_has_ground.any():
        first_ground_y = np.argmax(base_ground > 128, axis=0).astype(np.float32)
        hy_px_ref = horizon_y * orig_h
        cols_idx = np.arange(orig_w)
        vals = np.empty(orig_w, dtype=np.float32)
        for cx in range(orig_w):
            if col_has_ground[cx]:
                yt = int(first_ground_y[cx])
                above_y = max(0, yt - 3)
                is_wall_seam = (clean_furn[above_y, cx] < 128)
                vals[cx] = yt if is_wall_seam else min(yt, hy_px_ref)
        valid_mask = col_has_ground
        raw_seam = np.interp(cols_idx, cols_idx[valid_mask], vals[valid_mask]).astype(np.float32)
        win_k = max(15, (orig_w // 18) | 1)
        raw_seam = cv2.blur(raw_seam.reshape(1, -1), (win_k, 1)).reshape(-1)
    row_grid = np.arange(orig_h, dtype=np.float32)[:, None]
    seam_band = row_grid >= (raw_seam[None, :] - max(3, int(round(orig_h * 0.004))))

    furn_ground_footprint = cv2.bitwise_and(clean_furn, seam_band.astype(np.uint8) * 255)
    lower_support_fill = (seam_band & (hard_upper_obstacles == 0)).astype(np.uint8) * 255
    floor_support = cv2.bitwise_or(base_ground, furn_ground_footprint)
    floor_support = cv2.bitwise_or(floor_support, lower_support_fill)
    floor_support = cv2.morphologyEx(floor_support, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7)))

    # Fill interior pinholes inside the floor plane (allowing slightly larger heals inside patterned carpets)
    support_contours, support_hier = cv2.findContours(floor_support, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    max_support_hole = total_pixels * (0.032 if has_existing_rug else 0.008)
    if support_hier is not None:
        for idx, scnt in enumerate(support_contours):
            if support_hier[0][idx][3] != -1 and cv2.contourArea(scnt) <= max_support_hole:
                cv2.drawContours(floor_support, [scnt], -1, 255, -1)

    # Zero out verified wall core & upper obstacles while keeping geodesically recovered seams intact
    upper_block = cv2.bitwise_and(hard_upper_core, cv2.bitwise_not((actual_floor_mask > 0).astype(np.uint8)))
    floor_support[upper_block > 0] = 0
    # Zero out strictly above the geometric floor seam unless recovered floor legally extends deeper (e.g. doorways)
    safe_ceiling_px = max(0, int((horizon_y - 0.01) * orig_h))
    floor_support[:safe_ceiling_px, :] = cv2.bitwise_and(
        floor_support[:safe_ceiling_px, :],
        ((actual_floor_mask[:safe_ceiling_px, :] > 0).astype(np.uint8) * 255),
    )

    support_filename = f"floor_support_{mask_id}.png"
    support_path = os.path.join(OUTPUT_DIR, support_filename)
    Image.fromarray(restore_source_resolution(floor_support), mode="L").save(support_path, format="PNG")

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

    # 7. Intelligent Rug Placement Calculation (rot always in radians matching PlacedRug)
    suggested_rot = 0.0
    if existing_rug_data["detected"] and existing_rug_data["center"]:
        cu, cv_coord = existing_rug_data["center"]
        # Check if a coffee table sits ahead of a sofa to prevent foreground bed occlusion from pulling placement too low
        ct_boxes = [inst for inst in detected_instances if "coffee table" in inst["label"] or ("table" in inst["label"] and room_type == "living_room")]
        if ct_boxes and any("sofa" in inst["label"] or "couch" in inst["label"] for inst in detected_instances):
            best_ct = max(ct_boxes, key=lambda c: c["area"])
            ct_cu = (best_ct["box"][0] + best_ct["box"][2]) / (2.0 * orig_w)
            ct_anchor_v = (0.35 * best_ct["box"][1] + 0.65 * best_ct["box"][3]) / float(orig_h) + 0.03
            if abs(ct_cu - cu) > 0.14:
                target_u = ct_cu
                target_v = min(near_y - 0.18, max(horizon_y + 0.07, ct_anchor_v + 0.04))
                placement_reason = "Centered in front of sofa and coffee table on open floor space."
            else:
                target_u = 0.60 * ct_cu + 0.40 * cu
                target_v = min(near_y - 0.18, max(horizon_y + 0.07, 0.60 * ct_anchor_v + 0.40 * cv_coord))
                placement_reason = "Aligned cleanly in front of coffee table and sofa seating over existing floor space."
            rug_x, rug_z = unproject_uv_to_floor(target_u, target_v)
        else:
            rug_x, rug_z = unproject_uv_to_floor(cu, cv_coord)
            placement_reason = "Aligned directly with existing rug placement on room floor."
        orient_deg = float(existing_rug_data.get("orientation_deg", 0.0) or 0.0)
        if abs(orient_deg) > 6.5:
            suggested_rot = round(math.radians(max(-25.0, min(25.0, orient_deg))), 4)
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
            anchor_v = min(bottom_v, max(horizon_y + 0.08, near_y - 0.16))
            rug_x, rug_z = unproject_uv_to_floor(cu, anchor_v)
            rug_z = max(min(est_depth_ft * 0.44, 3.8), rug_z - 0.8)
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
    min_x_pad = min(0.8, est_width_ft * 0.08)
    min_z_pad = min(0.8, est_depth_ft * 0.08)
    fit_min_x = min_x_pad + rug_w / 2.0
    fit_max_x = est_width_ft - rug_w / 2.0 - min_x_pad
    if fit_min_x <= fit_max_x:
        rug_x = max(fit_min_x, min(fit_max_x, rug_x))
    else:
        flex_x = max(0.5, est_width_ft * 0.20)
        rug_x = max(est_width_ft * 0.50 - flex_x, min(est_width_ft * 0.50 + flex_x, rug_x))

    if est_depth_ft <= rug_h + 1.5:
        rug_z = max(est_depth_ft * 0.35, min(est_depth_ft * 0.72, rug_z))
    else:
        rug_z = max(rug_h / 2.0 + min_z_pad, min(est_depth_ft - rug_h / 2.0 - 0.5, rug_z))

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
            source_inpaint_mask = restore_source_resolution(inpaint_mask)
            clean_bgr = cv2.inpaint(source_img_cv, source_inpaint_mask, 5, cv2.INPAINT_TELEA)
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
    debug_source = (
        debug_arr
        if debug_arr.shape[1] == source_w and debug_arr.shape[0] == source_h
        else cv2.resize(debug_arr, (source_w, source_h), interpolation=cv2.INTER_LINEAR)
    )
    Image.fromarray(debug_source).save(debug_path, format="JPEG", quality=88)

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
            "source_image_dimensions": [source_w, source_h],
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
