export type Vec2 = { x: number; y: number };

export const FT_TO_M = 0.3048;
export const M_TO_FT = 1.0 / 0.3048;

/** Floor quad in normalized image coordinates (origin top-left, y down). */
export type FloorQuad = {
  nearLeft: Vec2;
  nearRight: Vec2;
  farRight: Vec2;
  farLeft: Vec2;
};

export type FloorSize = { widthFt: number; depthFt: number };

export type ImageLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
  canvasW: number;
  canvasH: number;
};

export type MetricDimensions = {
  widthM: number;
  lengthM: number;
  widthFt: number;
  lengthFt: number;
  label: string;
  source: "catalog" | "metadata" | "user_specified";
};

export type CalibrationReferenceType = "tile" | "existing_rug" | "custom_rectangle";

export type CalibrationReference = {
  type: CalibrationReferenceType;
  name: string;
  widthM: number;
  lengthM: number;
  // 4 corners in normalized image coordinates [0..1]
  // Order: [nearLeft, nearRight, farRight, farLeft]
  corners: [Vec2, Vec2, Vec2, Vec2];
};

export type MetricCalibration = {
  isCalibrated: boolean;
  reference: CalibrationReference | null;
  H_metric: number[] | null; // (X_m, Z_m) -> (u, v)
  invH_metric: number[] | null; // (u, v) -> (X_m, Z_m)
  estimatedFloorSizeM: { widthM: number; depthM: number };
  maxRoundTripErrorM: number;
  calibratedAt?: string;
};

export type PlacedRug = {
  instanceId: string;
  productId: string;
  name: string;
  img: string;
  // Authoritative physical dimensions in metres
  widthM: number;
  lengthM: number;
  // Floor center coordinates in metres
  xM: number;
  zM: number;
  rot: number; // rotation in radians around center
  // Compatibility fields for display in feet
  w: number; // width in feet
  h: number; // length in feet
  x: number; // x in feet
  z: number; // z in feet
  sizeLabel?: string;
  hasAuthoritativeDimensions?: boolean;
};

export function defaultFloorQuad(): FloorQuad {
  return {
    farLeft: { x: 0.286, y: 0.66 },
    farRight: { x: 0.714, y: 0.66 },
    nearRight: { x: 0.98, y: 0.995 },
    nearLeft: { x: 0.02, y: 0.995 },
  };
}

export function coverLayout(
  canvasW: number,
  canvasH: number,
  imgW: number,
  imgH: number
): ImageLayout {
  const s = Math.max(canvasW / imgW, canvasH / imgH);
  const w = imgW * s;
  const h = imgH * s;
  return {
    x: (canvasW - w) / 2,
    y: (canvasH - h) / 2,
    w,
    h,
    canvasW,
    canvasH,
  };
}

export function containLayout(
  canvasW: number,
  canvasH: number,
  imgW: number,
  imgH: number
): ImageLayout {
  const s = Math.min(canvasW / imgW, canvasH / imgH);
  const w = imgW * s;
  const h = imgH * s;
  return {
    x: (canvasW - w) / 2,
    y: (canvasH - h) / 2,
    w,
    h,
    canvasW,
    canvasH,
  };
}

export function fitRoomLayout(
  canvasW: number,
  canvasH: number,
  imgW: number,
  imgH: number
): ImageLayout {
  // Always contain the full room photo so walls, furniture, and foreground floor up to the
  // camera edge remain visible and coverable on every desktop and mobile aspect ratio.
  return containLayout(canvasW, canvasH, imgW, imgH);
}

export function imageToCanvas(p: Vec2, layout: ImageLayout): Vec2 {
  return { x: layout.x + p.x * layout.w, y: layout.y + p.y * layout.h };
}

export function canvasToImage(p: Vec2, layout: ImageLayout): Vec2 {
  return {
    x: (p.x - layout.x) / layout.w,
    y: (p.y - layout.y) / layout.h,
  };
}

/**
 * Standard unit converter (converts units once).
 */
export function feetToMetres(ft: number): number {
  return ft * FT_TO_M;
}

export function metresToFeet(m: number): number {
  return m * M_TO_FT;
}

/**
 * Robust, unit-aware dimension parser.
 * Supports:
 * - "8x10 ft", "6 x 9 ft", "5x7 ft", "9 x 12 ft", "10x14 ft"
 * - Foot-inch notation: "6' x 9'", "8' x 10'"
 * - Metric cm: "240x300 cm", "160 x 230 cm"
 * - Metric m: "2.4 x 3.0 m", "1.8 x 2.7 m"
 * Returns null if dimensions are missing or ambiguous (no silent fallback to 6x9).
 */
export function parseAuthoritativeDimensions(
  product: {
    category?: string;
    size?: string;
    metadata?: Record<string, unknown>;
  } | null | undefined
): MetricDimensions | null {
  if (!product) return null;

  const candidates: { val: string; source: "catalog" | "metadata" }[] = [];
  if (product.metadata?.dimensions) candidates.push({ val: String(product.metadata.dimensions), source: "metadata" });
  if (product.metadata?.size) candidates.push({ val: String(product.metadata.size), source: "metadata" });
  if (product.size) candidates.push({ val: String(product.size), source: "catalog" });
  if (product.category) candidates.push({ val: String(product.category), source: "catalog" });

  for (const item of candidates) {
    const raw = item.val.trim();
    if (!raw) continue;

    // Check for metric cm (e.g. 240x300 cm or 240 x 300cm)
    const cmMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:cm)?\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*cm/i);
    if (cmMatch) {
      const wCm = parseFloat(cmMatch[1]);
      const lCm = parseFloat(cmMatch[2]);
      if (wCm > 20 && lCm > 20) {
        const widthM = wCm / 100.0;
        const lengthM = lCm / 100.0;
        return {
          widthM,
          lengthM,
          widthFt: Math.round(widthM * M_TO_FT * 10) / 10,
          lengthFt: Math.round(lengthM * M_TO_FT * 10) / 10,
          label: `${wCm} × ${lCm} cm`,
          source: item.source,
        };
      }
    }

    // Check for metric metres (e.g. 2.4 x 3.0 m or 2.4x3m)
    const mMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:m)?\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*m\b/i);
    if (mMatch) {
      const widthM = parseFloat(mMatch[1]);
      const lengthM = parseFloat(mMatch[2]);
      if (widthM > 0.4 && lengthM > 0.4 && widthM < 20 && lengthM < 20) {
        return {
          widthM,
          lengthM,
          widthFt: Math.round(widthM * M_TO_FT * 10) / 10,
          lengthFt: Math.round(lengthM * M_TO_FT * 10) / 10,
          label: `${widthM} × ${lengthM} m`,
          source: item.source,
        };
      }
    }

    // Check for feet (e.g. 8x10 ft, 6 x 9 ft, 8' x 10', 8x10)
    const ftMatch = raw.match(/(\d+(?:\.\d+)?)(?:'|\s*ft|\s*feet)?\s*[xX×*]\s*(\d+(?:\.\d+)?)(?:'|\s*ft|\s*feet)?/i);
    if (ftMatch) {
      let wFt = parseFloat(ftMatch[1]);
      let lFt = parseFloat(ftMatch[2]);
      // If values look like cm entered without units (e.g. 200x300)
      if (wFt > 30 || lFt > 30) {
        const widthM = wFt / 100.0;
        const lengthM = lFt / 100.0;
        return {
          widthM,
          lengthM,
          widthFt: Math.round(widthM * M_TO_FT * 10) / 10,
          lengthFt: Math.round(lengthM * M_TO_FT * 10) / 10,
          label: `${wFt} × ${lFt} cm`,
          source: item.source,
        };
      }
      if (wFt > 0.5 && lFt > 0.5) {
        const widthM = wFt * FT_TO_M;
        const lengthM = lFt * FT_TO_M;
        return {
          widthM,
          lengthM,
          widthFt: wFt,
          lengthFt: lFt,
          label: `${wFt} × ${lFt} ft`,
          source: item.source,
        };
      }
    }
  }

  return null;
}

/**
 * Gaussian elimination with partial pivoting.
 */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => row.concat(b[i]));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }
    const div = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row) => row[n]);
}

/**
 * 3x3 row-major homography mapping src -> dst.
 * Uses Direct Linear Transformation (DLT).
 */
export function findHomography(src: Vec2[], dst: Vec2[]): number[] | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const u = dst[i].x;
    const v = dst[i].y;
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  const h = solve(A, b);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/**
 * Applies a 3x3 homography to a 2D point.
 */
export function applyH(H: number[], p: Vec2): Vec2 {
  const x = H[0] * p.x + H[1] * p.y + H[2];
  const y = H[3] * p.x + H[4] * p.y + H[5];
  const w = H[6] * p.x + H[7] * p.y + H[8];
  if (Math.abs(w) < 1e-14) return { x: 0, y: 0 };
  return { x: x / w, y: y / w };
}

/**
 * Analytical inversion of a 3x3 row-major matrix.
 */
export function invertH(H: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = H;
  const C00 = e * i - f * h;
  const C01 = f * g - d * i;
  const C02 = d * h - e * g;
  const C10 = c * h - b * i;
  const C11 = a * i - c * g;
  const C12 = b * g - a * h;
  const C20 = b * f - c * e;
  const C21 = c * d - a * f;
  const C22 = a * e - b * d;
  const det = a * C00 + b * C01 + c * C02;
  if (Math.abs(det) < 1e-14) return null;
  return [
    C00 / det, C10 / det, C20 / det,
    C01 / det, C11 / det, C21 / det,
    C02 / det, C12 / det, C22 / det,
  ];
}

/**
 * Calculates metric homography from a measured physical floor reference.
 * The reference object (tile, mat, or existing rug) has known physical width (widthM)
 * and length (lengthM), and 4 clicked corners in the normalized photograph.
 *
 * Physical coordinates:
 * Corner 0 (near-left):  (0, 0)
 * Corner 1 (near-right): (widthM, 0)
 * Corner 2 (far-right):  (widthM, lengthM)
 * Corner 3 (far-left):   (0, lengthM)
 */
export function computeMetricCalibration(
  reference: CalibrationReference,
  estimatedFloorSizeFt: FloorSize
): MetricCalibration {
  const { widthM, lengthM, corners } = reference;
  const physCorners: Vec2[] = [
    { x: 0, y: 0 },
    { x: widthM, y: 0 },
    { x: widthM, y: lengthM },
    { x: 0, y: lengthM },
  ];

  const H_metric = findHomography(physCorners, corners);
  const invH_metric = H_metric ? invertH(H_metric) : null;

  // Numerical round-trip verification error check
  let maxErrorM = 0;
  if (H_metric && invH_metric) {
    for (let i = 0; i < 4; i++) {
      const orig = physCorners[i];
      const projected = applyH(H_metric, orig);
      const recovered = applyH(invH_metric, projected);
      const err = Math.hypot(recovered.x - orig.x, recovered.y - orig.y);
      if (err > maxErrorM) maxErrorM = err;
    }
  }

  const estW_M = estimatedFloorSizeFt.widthFt * FT_TO_M;
  const estD_M = estimatedFloorSizeFt.depthFt * FT_TO_M;

  return {
    isCalibrated: Boolean(H_metric && invH_metric && maxErrorM < 1e-4),
    reference,
    H_metric,
    invH_metric,
    estimatedFloorSizeM: { widthM: estW_M, depthM: estD_M },
    maxRoundTripErrorM: maxErrorM,
    calibratedAt: new Date().toISOString(),
  };
}

/**
 * Maps floor metric coordinates (x along width in metres, z along depth in metres)
 * onto normalized image coordinates [0..1] using either:
 * 1. Authoritative metric calibration homography, or
 * 2. Visual estimate quad homography (scaled to metres).
 */
export function floorToImageH(quad: FloorQuad, size: FloorSize): number[] | null {
  return findHomography(
    [
      { x: 0, y: 0 },
      { x: size.widthFt * FT_TO_M, y: 0 },
      { x: size.widthFt * FT_TO_M, y: size.depthFt * FT_TO_M },
      { x: 0, y: size.depthFt * FT_TO_M },
    ],
    [quad.nearLeft, quad.nearRight, quad.farRight, quad.farLeft]
  );
}

export function rotate2(p: Vec2, ang: number): Vec2 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/**
 * Returns physical corners of placed rug in METRES on the floor plane.
 * [nearLeft, nearRight, farRight, farLeft]
 */
export function rugFloorCornersM(rug: PlacedRug): Vec2[] {
  const hw = (Number.isFinite(rug.widthM) ? rug.widthM : (Number.isFinite(rug.w) ? rug.w * FT_TO_M : 1.5)) / 2.0;
  const hl = (Number.isFinite(rug.lengthM) ? rug.lengthM : (Number.isFinite(rug.h) ? rug.h * FT_TO_M : 2.4)) / 2.0;
  const x = Number.isFinite(rug.xM) ? rug.xM : (Number.isFinite(rug.x) ? rug.x * FT_TO_M : 2.0);
  const z = Number.isFinite(rug.zM) ? rug.zM : (Number.isFinite(rug.z) ? rug.z * FT_TO_M : 2.0);
  const rot = Number.isFinite(rug.rot) ? rug.rot : 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);

  // Local rug coordinates centered at (0,0)
  const local: Vec2[] = [
    { x: -hw, y: -hl },
    { x: hw, y: -hl },
    { x: hw, y: hl },
    { x: -hw, y: hl },
  ];
  return local.map((p) => {
    return {
      x: x + p.x * c - p.y * s,
      y: z + p.x * s + p.y * c,
    };
  });
}

/**
 * Compatibility helper returning corners in feet for legacy callers.
 */
export function rugFloorCorners(rug: PlacedRug): Vec2[] {
  const cornersM = rugFloorCornersM(rug);
  return cornersM.map((p) => ({ x: p.x * M_TO_FT, y: p.y * M_TO_FT }));
}

/**
 * Point-in-polygon test for floor boundary validation.
 */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const hit =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  let x = 0, y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  const n = poly.length || 1;
  return { x: x / n, y: y / n };
}

/**
 * Clamps placed rug position in metres to stay comfortably on the floor plane.
 */
export function clampRugM(
  rug: PlacedRug,
  floorBoundsM: { widthM: number; depthM: number }
): PlacedRug {
  const pad = 0.02; // 2 cm margin so rugs can sit flush near the front wall and foreground edge
  const rot = Number.isFinite(rug.rot) ? rug.rot : 0;
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));

  const rugW_M = Number.isFinite(rug.widthM) ? rug.widthM : (Number.isFinite(rug.w) ? rug.w * FT_TO_M : 1.5);
  const rugL_M = Number.isFinite(rug.lengthM) ? rug.lengthM : (Number.isFinite(rug.h) ? rug.h * FT_TO_M : 2.4);

  const halfEffectiveWidthM = (rugW_M * c + rugL_M * s) / 2.0;
  const halfEffectiveLengthM = (rugW_M * s + rugL_M * c) / 2.0;

  const fitMinX = halfEffectiveWidthM + pad;
  const fitMaxX = floorBoundsM.widthM - halfEffectiveWidthM - pad;
  // When the rug is wider than the calibrated floor bay, keep it centered while allowing natural lateral reach.
  const flexX = Math.max(0.35, floorBoundsM.widthM * 0.40);
  const minX = fitMinX <= fitMaxX ? fitMinX : Math.max(0.10, floorBoundsM.widthM / 2.0 - flexX);
  const maxX = fitMinX <= fitMaxX ? fitMaxX : Math.min(floorBoundsM.widthM - 0.10, floorBoundsM.widthM / 2.0 + flexX);

  const fitMinZ = halfEffectiveLengthM + pad;
  const fitMaxZ = floorBoundsM.depthM - halfEffectiveLengthM - pad;
  // For deep rugs (e.g. 10x14 or 12x18 in a shorter bay), allow extending to both far wall and camera edge;
  // homogeneous clip-space rendering handles near vertices crossing behind w <= 0 safely.
  const maxSafeNearOverhang = Math.max(2.4, floorBoundsM.depthM * 0.85);
  const minZ = fitMinZ <= fitMaxZ
    ? fitMinZ
    : Math.max(floorBoundsM.depthM * 0.08, halfEffectiveLengthM - maxSafeNearOverhang);
  const maxZ = fitMinZ <= fitMaxZ
    ? fitMaxZ
    : Math.max(minZ, floorBoundsM.depthM * 0.92);

  // Synchronize input coordinates:
  let inputXM = Number.isFinite(rug.xM) ? rug.xM : (Number.isFinite(rug.x) ? rug.x * FT_TO_M : floorBoundsM.widthM / 2.0);
  let inputZM = Number.isFinite(rug.zM) ? rug.zM : (Number.isFinite(rug.z) ? rug.z * FT_TO_M : floorBoundsM.depthM / 2.0);

  // If both x and xM exist and x was updated (differs from xM):
  if (Number.isFinite(rug.x) && Number.isFinite(rug.xM)) {
    if (Math.abs(rug.x * FT_TO_M - rug.xM) > 0.01) {
      inputXM = rug.x * FT_TO_M;
    }
  }
  if (Number.isFinite(rug.z) && Number.isFinite(rug.zM)) {
    if (Math.abs(rug.z * FT_TO_M - rug.zM) > 0.01) {
      inputZM = rug.z * FT_TO_M;
    }
  }

  const clampedXM = Math.min(maxX, Math.max(minX, inputXM));
  const clampedZM = Math.min(maxZ, Math.max(minZ, inputZM));

  return {
    ...rug,
    widthM: rugW_M,
    lengthM: rugL_M,
    w: rugW_M * M_TO_FT,
    h: rugL_M * M_TO_FT,
    xM: clampedXM,
    zM: clampedZM,
    x: clampedXM * M_TO_FT,
    z: clampedZM * M_TO_FT,
    rot,
  };
}

export function clampRug(rug: PlacedRug, size: FloorSize): PlacedRug {
  return clampRugM(rug, {
    widthM: size.widthFt * FT_TO_M,
    depthM: size.depthFt * FT_TO_M,
  });
}

/**
 * Strict numerical round-trip acceptance test.
 * Verifies that projecting physical rug corners through H and back through invH
 * recovers the exact original physical width and length within numerical tolerance.
 */
export function verifyRugDimensionalInvariance(
  rug: PlacedRug,
  H: number[],
  invH: number[]
): {
  isValid: boolean;
  actualWidthM: number;
  actualLengthM: number;
  recoveredWidthM: number;
  recoveredLengthM: number;
  widthErrorM: number;
  lengthErrorM: number;
  maxCornerDriftM: number;
} {
  const origCorners = rugFloorCornersM(rug);
  const projectedCorners = origCorners.map((p) => applyH(H, p));
  const recoveredCorners = projectedCorners.map((p) => applyH(invH, p));

  const recWidth = Math.hypot(
    recoveredCorners[1].x - recoveredCorners[0].x,
    recoveredCorners[1].y - recoveredCorners[0].y
  );
  const recLength = Math.hypot(
    recoveredCorners[2].x - recoveredCorners[1].x,
    recoveredCorners[2].y - recoveredCorners[1].y
  );

  const widthErrorM = Math.abs(recWidth - rug.widthM);
  const lengthErrorM = Math.abs(recLength - rug.lengthM);

  let maxCornerDriftM = 0;
  for (let i = 0; i < 4; i++) {
    const drift = Math.hypot(
      recoveredCorners[i].x - origCorners[i].x,
      recoveredCorners[i].y - origCorners[i].y
    );
    if (drift > maxCornerDriftM) maxCornerDriftM = drift;
  }

  return {
    isValid: widthErrorM < 1e-4 && lengthErrorM < 1e-4 && maxCornerDriftM < 1e-4,
    actualWidthM: rug.widthM,
    actualLengthM: rug.lengthM,
    recoveredWidthM: recWidth,
    recoveredLengthM: recLength,
    widthErrorM,
    lengthErrorM,
    maxCornerDriftM,
  };
}
