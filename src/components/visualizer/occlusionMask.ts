import { pointInPolygon, type FloorQuad, type Vec2 } from "./floorMath";

export type OccludeClick = { x: number; y: number; add: boolean };

const MAX_W = 480;

function floorPoly(q: FloorQuad): Vec2[] {
  return [q.nearLeft, q.nearRight, q.farRight, q.farLeft];
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function drawImage(img: HTMLImageElement, maxW: number) {
  const scale = Math.min(1, maxW / img.naturalWidth);
  const w = Math.max(2, Math.round(img.naturalWidth * scale));
  const h = Math.max(2, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  return { w, h, data: ctx.getImageData(0, 0, w, h).data };
}

function idx(x: number, y: number, w: number) {
  return (y * w + x) * 4;
}

function farY(q: FloorQuad) {
  return (q.farLeft.y + q.farRight.y) * 0.5;
}

function rasterFloor(w: number, h: number, q: FloorQuad) {
  const poly = floorPoly(q);
  const inside = new Uint8Array(w * h);
  let area = 0;
  for (let y = 0; y < h; y++) {
    const py = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const px = (x + 0.5) / w;
      if (pointInPolygon({ x: px, y: py }, poly)) {
        inside[y * w + x] = 1;
        area++;
      }
    }
  }
  return { inside, area };
}

function flood(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  out: Uint8Array,
  add: boolean,
  thresh = 38
) {
  sx = clamp(sx | 0, 0, w - 1);
  sy = clamp(sy | 0, 0, h - 1);
  const si = idx(sx, sy, w);
  const tr = src[si], tg = src[si + 1], tb = src[si + 2];
  const seen = new Uint8Array(w * h);
  const stack = [sx, sy];
  let n = 0;
  const max = w * h * 0.22;
  while (stack.length && n < max) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    const dr = src[i] - tr;
    const dg = src[i + 1] - tg;
    const db = src[i + 2] - tb;
    if (dr * dr + dg * dg + db * db > thresh * thresh) continue;
    out[p] = add ? 1 : 0;
    n++;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
}

function connectedComponents(bin: Uint8Array, w: number, h: number) {
  const labels = new Int32Array(w * h);
  labels.fill(-1);
  const comps: { minY: number; maxY: number; area: number }[] = [];
  const stack: number[] = [];
  let id = 0;
  for (let i = 0; i < bin.length; i++) {
    if (!bin[i] || labels[i] !== -1) continue;
    let area = 0, minY = h, maxY = 0;
    stack.push(i);
    labels[i] = id;
    while (stack.length) {
      const p = stack.pop()!;
      area++;
      const y = (p / w) | 0;
      const x = p - y * w;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const nbs = [p + 1, p - 1, p + w, p - w];
      for (const q of nbs) {
        if (q < 0 || q >= bin.length) continue;
        if (!bin[q] || labels[q] !== -1) continue;
        const qy = (q / w) | 0;
        const qx = q - qy * w;
        if (Math.abs(qx - x) + Math.abs(qy - y) !== 1) continue;
        labels[q] = id;
        stack.push(q);
      }
    }
    comps.push({ minY, maxY, area });
    id++;
  }
  return { labels, comps };
}

function dilate(src: Uint8Array, w: number, h: number, r: number) {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let dy = -r; dy <= r && !on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          if (src[yy * w + xx]) {
            on = 1;
            break;
          }
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

function toImageData(bin: Uint8Array, w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = bin[i] ? 255 : 0;
    data[i * 4] = a;
    data[i * 4 + 1] = a;
    data[i * 4 + 2] = a;
    data[i * 4 + 3] = 255;
  }
  return new ImageData(data, w, h);
}

/** Auto + click occlusion mask in image UV space (y down). */
export function buildOcclusionMask(
  img: HTMLImageElement,
  floor: FloorQuad,
  clicks: OccludeClick[],
  auto = true
): ImageData {
  const { w, h, data } = drawImage(img, MAX_W);
  const { inside, area: floorArea } = rasterFloor(w, h, floor);
  const bin = new Uint8Array(w * h);
  const fy = farY(floor);

  if (auto) {
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    }
    const blur = new Float32Array(w * h);
    const rad = 6;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let dy = -rad; dy <= rad; dy += 2) {
          const yy = clamp(y + dy, 0, h - 1);
          for (let dx = -rad; dx <= rad; dx += 2) {
            const xx = clamp(x + dx, 0, w - 1);
            s += gray[yy * w + xx];
            n++;
          }
        }
        blur[y * w + x] = s / n;
      }
    }

    let floorR = 0, floorG = 0, floorB = 0, floorN = 0;
    for (let i = 0; i < w * h; i++) {
      if (!inside[i]) continue;
      const dog = Math.abs(gray[i] - blur[i]);
      if (dog > 10) continue;
      floorR += data[i * 4];
      floorG += data[i * 4 + 1];
      floorB += data[i * 4 + 2];
      floorN++;
    }
    if (floorN < 20) {
      floorR = 140;
      floorG = 120;
      floorB = 100;
      floorN = 1;
    }
    floorR /= floorN;
    floorG /= floorN;
    floorB /= floorN;

    const raw = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const dr = data[o] - floorR;
      const dg = data[o + 1] - floorG;
      const db = data[o + 2] - floorB;
      const colorD = Math.sqrt(dr * dr + dg * dg + db * db);
      const dog = Math.abs(gray[i] - blur[i]);
      const y = (i / w) | 0;
      const inFloor = inside[i];
      const aboveFloor = y / h < fy - 0.01;
      if (inFloor && (colorD > 42 || dog > 14)) raw[i] = 1;
      else if (aboveFloor && y / h > fy - 0.42 && (colorD > 55 && dog > 12)) raw[i] = 1;
    }

    const grown = dilate(raw, w, h, 1);
    const { labels, comps } = connectedComponents(grown, w, h);
    const keep = new Uint8Array(comps.length);
    for (let c = 0; c < comps.length; c++) {
      const comp = comps[c];
      let hits = 0;
      for (let i = 0; i < labels.length; i++) if (labels[i] === c && inside[i]) hits++;
      const minYn = comp.minY / h;
      const heightN = (comp.maxY - comp.minY) / h;
      const onFloor = hits > 12;
      const reachesWall = minYn < fy;
      if (onFloor || reachesWall || comp.area > 20) {
        keep[c] = 1;
      }
    }
    for (let i = 0; i < bin.length; i++) {
      const L = labels[i];
      if (L >= 0 && keep[L]) bin[i] = 1;
    }

    // Grow furniture upward so tabletops / sofa backs cover the rug.
    const colTop = new Int16Array(w);
    colTop.fill(h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (bin[y * w + x] && y < colTop[x]) colTop[x] = y;
      }
    }
    for (let x = 1; x < w - 1; x++) {
      const start = colTop[x];
      if (start >= h) continue;
      const i0 = start * w + x;
      const r0 = data[i0 * 4], g0 = data[i0 * 4 + 1], b0 = data[i0 * 4 + 2];
      const limit = Math.max(0, start - Math.round(h * 0.28));
      for (let y = start - 1; y >= limit; y--) {
        const p = y * w + x;
        const o = p * 4;
        const dr = data[o] - r0;
        const dg = data[o + 1] - g0;
        const db = data[o + 2] - b0;
        if (dr * dr + dg * dg + db * db > 70 * 70) break;
        bin[p] = 1;
      }
    }
  }

  for (const click of clicks) {
    flood(data, w, h, Math.round(click.x * w), Math.round(click.y * h), bin, click.add);
  }

  return toImageData(bin, w, h);
}

/**
 * Deterministically composites AI baseline segmentation with manual Under/Reveal corrections.
 * - If baseMaskUrl is provided: uses the AI mask as baseline.
 * - Under clicks mark regions as foreground (1).
 * - Reveal clicks mark regions as non-foreground (0).
 * - If baseMaskUrl is null, falls back to heuristic auto mask.
 */
export async function composeOcclusionMask(
  roomImg: HTMLImageElement,
  baseMaskUrl: string | null,
  nextFloor: FloorQuad,
  clicks: OccludeClick[],
  auto: boolean
): Promise<ImageData> {
  if (!baseMaskUrl) {
    return buildOcclusionMask(roomImg, nextFloor, clicks, auto);
  }

  try {
    const baseImg = await loadRoomImage(baseMaskUrl);
    const { w, h, data } = drawImage(roomImg, MAX_W);

    // Draw baseline AI mask scaled to identical dimension
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = w;
    maskCanvas.height = h;
    const mctx = maskCanvas.getContext("2d", { willReadFrequently: true })!;
    mctx.drawImage(baseImg, 0, 0, w, h);
    const mdata = mctx.getImageData(0, 0, w, h).data;

    const bin = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      // White (255) in mask means furniture foreground
      if (mdata[i * 4] > 120) {
        bin[i] = 1;
      }
    }

    // Apply manual user corrections
    for (const click of clicks) {
      flood(data, w, h, Math.round(click.x * w), Math.round(click.y * h), bin, click.add);
    }

    return toImageData(bin, w, h);
  } catch (err) {
    console.warn("Failed to composite AI mask with manual clicks, falling back to heuristic:", err);
    return buildOcclusionMask(roomImg, nextFloor, clicks, auto);
  }
}

export function loadRoomImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(url) && typeof window !== "undefined" && !url.startsWith(window.location.origin)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("room image failed: " + url));
    img.src = url;
    if (img.complete && img.naturalWidth > 0) {
      resolve(img);
    }
  });
}
