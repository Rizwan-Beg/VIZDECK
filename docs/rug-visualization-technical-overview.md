# VIZDECK Rug Visualization: Technical Overview

## What the product does

VIZDECK lets a customer upload a room photograph, select a rug, and see that rug placed on the room floor with correct perspective, scale, shadows, and foreground furniture overlap. It is built to work with ordinary mobile-phone photographs as well as cleaner interior images.

This is a **visualization system**, not a generative image model. The selected rug image is geometrically projected into the customer’s actual room photograph. This preserves the product’s real pattern, border, colour, and aspect ratio.

## End-to-end flow

1. The browser uploads the room image to `POST /api/analyze-room`.
2. The Next.js API route invokes the Python RoomIQ analyzer (`ai-service/room_analyzer.py`) either through the configured analysis service or its local command-line fallback.
3. RoomIQ returns a floor/support mask, a furniture/foreground occlusion mask, estimated perspective information, suggested rug placement, estimated room dimensions, and diagnostics.
4. The React/WebGL visualizer warps the selected rug texture into the returned floor plane.
5. The final rendering composites the rug below genuine foreground objects such as coffee tables, chairs, sofas, and beds, then adds contact shadows and lighting treatment.
6. Customers can still drag, resize, rotate, and manually correct masking when an unusual room photo needs it.

## AI models used by RoomIQ

| Role | Model | Why it is used |
| --- | --- | --- |
| Primary room understanding | `shi-labs/oneformer_ade20k_swin_large` (OneFormer Swin-Large) | Panoptic/semantic understanding of floors, rugs, furniture, walls, beds, tables, chairs, and room layout. |
| Object-boundary refinement | `facebook/sam-vit-base` (Segment Anything Model, ViT-Base) | Refines eligible structural-object contours, especially thin table/chair legs and irregular foreground boundaries. |
| Resilience fallback | `nvidia/segformer-b0-finetuned-ade-512-512` (SegFormer B0) | Keeps basic room analysis available when the primary OneFormer pass is unavailable or fails. |

The Python service uses PyTorch, Hugging Face Transformers, OpenCV, and Pillow. On macOS the configured inference device is CPU for stability with these model operations.

## Perspective, scale, and placement

RoomIQ combines segmented floor/rug evidence with image geometry. It calculates a metric floor homography and vanishing-direction-aware placement, then provides a four-corner floor plane to the frontend. The visualizer uses that plane to perspective-warp the rug rather than simply stretching a flat rectangle.

The estimated room dimensions are helpful defaults, not a measurement guarantee. Users can adjust the rug after automatic placement; that is intentional for rooms with no known real-world scale reference.

## Occlusion and realism

The system uses a separate occlusion layer so a new rug appears *under* real foreground furniture instead of being painted over it. Only grounded, trustworthy structural components are admitted to that layer. This is important because generic segmentation can mistake patterns in an existing carpet, reflections, or clutter for furniture.

Manual **Under** and **Reveal** mask edits take priority in the final renderer. That makes user corrections predictable and prevents the raw AI mask from overriding an approved adjustment.

Optional existing-rug cleanup uses OpenCV Telea inpainting. The default operation is direct overlay: it does not destructively alter the original room image.

## Mobile-photo reliability improvements

The current pipeline was specifically strengthened for real, handheld room photographs:

- Analysis and returned masks retain substantially more source-image resolution, preserving rug borders and thin furniture legs.
- Existing-rug detection prefers real four-corner geometry over a simplified bounding rectangle, improving perspective on patterned carpets.
- Rug-pattern fragments and small generic segmentation islands are suppressed before they can create holes in the placed rug.
- Only physically plausible, grounded structural objects can occlude the rug; decorative fragments and carpet motifs cannot.
- The rendered result uses the composed correction mask, not an earlier raw server mask.
- The API budget avoids spending most of the request waiting for an unavailable default upstream service; it reserves time for a local analysis fallback.

## Operational requirements

- The first use of each model may download/load model weights unless they are already cached. Later requests reuse the in-process model instances.
- The Python environment must have `torch`, `transformers`, `opencv-python`/`cv2`, Pillow, and the project requirements installed.
- Set `VISUALIZER_API_URL` only when an external RoomIQ service is actually available. Without it, the API route uses its local analyzer fallback.
- Analysis is intentionally bounded by the route’s execution time budget. If AI analysis is unavailable, the product falls back to interactive perspective placement rather than failing the visualization altogether.

## Honest product description

> VIZDECK uses room-scene segmentation, object-boundary refinement, and perspective-aware WebGL compositing to place a real rug product into a customer’s own room photo. It detects the usable floor, keeps rugs behind furniture where appropriate, and gives the customer controls to fine-tune placement. The system is designed for everyday mobile photos, including rooms with existing carpets and clutter.

## Known limits and best practice

No automated visualizer can infer exact physical dimensions from every single photograph. Results are strongest when the photo shows a meaningful portion of the floor, has reasonable lighting, and is taken from standing height. Highly obstructed floors, extreme wide-angle images, very low light, or a bed covering most of the floor may require a manual adjustment.

The right quality promise is **realistic automated placement with manual refinement available**, rather than guaranteed perfect measurement from every photo.
