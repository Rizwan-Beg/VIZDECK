"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import {
  FT_TO_M,
  M_TO_FT,
  applyH,
  canvasToImage,
  coverLayout,
  floorToImageH,
  imageToCanvas,
  invertH,
  pointInPolygon,
  polygonCentroid,
  rugFloorCornersM,
  rugFloorCorners,
  type FloorQuad,
  type FloorSize,
  type ImageLayout,
  type PlacedRug,
  type Vec2,
  type MetricCalibration,
} from "./floorMath";
import { Rug3DRenderer } from "./Rug3DRenderer";
import { isFringedRug, MATERIAL_PROFILES, type RugMaterialProfile, type RugMaterialType } from "./rugMaterials";

export type PointerTool = "move" | "under" | "reveal";

type Props = {
  roomSrc: string;
  floorPlateSrc?: string | null;
  floor: FloorQuad;
  floorSize: FloorSize;
  rugs: PlacedRug[];
  selectedId: string | null;
  calibrating: boolean;
  calibration?: MetricCalibration | null;
  measuredCalibrating?: boolean;
  calibrationCorners?: [Vec2, Vec2, Vec2, Vec2] | null;
  onCalibrationCornerChange?: (idx: number, pt: Vec2) => void;
  tool: PointerTool;
  occlusion: ImageData | null;
  occlusionMaskUrl?: string | null;
  floorSupportMaskUrl?: string | null;
  showDebug?: boolean;
  debugOverlayUrl?: string | null;
  enable3DRendering?: boolean;
  materialType?: RugMaterialType;
  onFloorChange: (floor: FloorQuad) => void;
  onRugsChange: (rugs: PlacedRug[]) => void;
  onSelect: (id: string | null) => void;
  onToolbar: (pos: { x: number; y: number } | null) => void;
  onReadyCanvas: (canvas: HTMLCanvasElement | null) => void;
  onOccludeClick: (pt: Vec2, add: boolean) => void;
};

const DIV = 32;
const VERT_STRIDE = 4; // x, y, u, v

const VS = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_uv;
}
`;

const FS_TEX = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_room;
uniform sampler2D u_floorSupport;
uniform float u_hasFloorSupport;
uniform float u_horizonY;
uniform float u_shade;
uniform float u_alpha;
uniform float u_lightMix;
uniform vec4 u_layout;
uniform vec2 u_css;
uniform float u_dpr;

void main() {
  vec4 c = texture2D(u_tex, v_uv);
  float outAlpha = clamp(c.a * u_alpha, 0.0, 1.0);
  if (outAlpha < 0.01) discard;

  vec2 cssPt = vec2(gl_FragCoord.x, u_css.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec2 ruv = (cssPt - u_layout.xy) / u_layout.zw;
  
  // Roomvo-grade wall boundary clipping:
  // Discard fragments outside the photograph bounds
  if (ruv.x < 0.0 || ruv.x > 1.0 || ruv.y < 0.0 || ruv.y > 1.0) discard;

  // Discard fragments on walls, baseboards, or beyond the visible floor
  if (u_hasFloorSupport > 0.5) {
    float sup = texture2D(u_floorSupport, ruv).r;
    if (sup < 0.15) discard;
  } else {
    if (ruv.y < u_horizonY) discard;
  }

  vec3 room = texture2D(u_room, ruv).rgb;

  // Extract room luminance for natural ambient lighting
  float lum = dot(room, vec3(0.299, 0.587, 0.114));

  // Ground the rug with subtle room luminance without washing out or distorting rug colors
  float lightFactor = mix(1.0, clamp(0.86 + lum * 0.28, 0.88, 1.12), u_lightMix * 0.30);
  vec3 lit = c.rgb * lightFactor * u_shade;

  // Preserve source texture alpha and user configured opacity with antialiased borders
  gl_FragColor = vec4(lit, outAlpha);
}
`;

const FS_SHADOW = `
precision mediump float;
varying vec2 v_uv;
uniform float u_sigma;
uniform float u_maxAlpha;
uniform vec2 u_innerSize;
uniform sampler2D u_floorSupport;
uniform float u_hasFloorSupport;
uniform float u_horizonY;
uniform vec4 u_layout;
uniform vec2 u_css;
uniform float u_dpr;

void main() {
  discard;
  vec2 cssPt = vec2(gl_FragCoord.x, u_css.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec2 ruv = (cssPt - u_layout.xy) / u_layout.zw;
  
  // Discard shadow outside the photograph frame
  if (ruv.x < 0.0 || ruv.x > 1.0 || ruv.y < 0.0 || ruv.y > 1.0) discard;

  // Shadow must never render on walls, baseboards, or beyond the floor boundary
  if (u_hasFloorSupport > 0.5) {
    float sup = texture2D(u_floorSupport, ruv).r;
    if (sup < 0.15) discard;
  } else {
    if (ruv.y < u_horizonY) discard;
  }

  // Continuous distance to rug perimeter
  vec2 p = abs(v_uv * 2.0 - 1.0);
  vec2 d = max(p - u_innerSize, vec2(0.0));
  float dist = length(d);

  // Smooth Gaussian falloff outwards from rug perimeter
  float falloff = exp(-(dist * dist) / (2.0 * u_sigma * u_sigma));
  
  // Tight contact crevice grounding directly along the edge
  float edgeDist = abs(max(p.x - u_innerSize.x, p.y - u_innerSize.y));
  float contact = exp(-edgeDist * 120.0) * 0.25;

  float alpha = clamp(falloff * u_maxAlpha + contact, 0.0, 0.25);
  if (alpha < 0.005) discard;
  
  gl_FragColor = vec4(0.02, 0.02, 0.03, alpha);
}
`;

const FS_OCCLUDE = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_room;
uniform sampler2D u_mask;
void main() {
  float m = texture2D(u_mask, v_uv).r;
  if (m < 0.10) discard;
  vec3 room = texture2D(u_room, v_uv).rgb;
  // Solid foreground furniture: alpha is 1.0 inside furniture silhouette,
  // with tight antialiasing transition to avoid transparency ghosting.
  float alpha = smoothstep(0.10, 0.45, m);
  gl_FragColor = vec4(room, alpha);
}
`;

const FS_SOLID = `
precision mediump float;
varying vec2 v_uv;
uniform vec4 u_color;
void main() {
  gl_FragColor = u_color;
}
`;

const FS_ROOM = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
void main() {
  gl_FragColor = texture2D(u_tex, v_uv);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(log || "shader compile failed");
  }
  return s;
}

function program(gl: WebGLRenderingContext, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || "link failed");
  }
  return p;
}

function pxToClip(x: number, y: number, w: number, h: number): Vec2 {
  return { x: (x / w) * 2 - 1, y: 1 - (y / h) * 2 };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(url) && typeof window !== "undefined" && !url.startsWith(window.location.origin)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed: " + url));
    img.src = url;
    if (img.complete && img.naturalWidth > 0) {
      resolve(img);
    }
  });
}

export default function FloorRugCanvas({
  roomSrc,
  floorPlateSrc,
  floor,
  floorSize,
  rugs,
  selectedId,
  calibrating,
  tool,
  occlusion,
  occlusionMaskUrl,
  floorSupportMaskUrl,
  showDebug,
  debugOverlayUrl,
  enable3DRendering = true,
  materialType = "wool_silk",
  calibration,
  measuredCalibrating = false,
  calibrationCorners,
  onCalibrationCornerChange,
  onFloorChange,
  onRugsChange,
  onSelect,
  onToolbar,
  onReadyCanvas,
  onOccludeClick,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const rug3DRendererRef = useRef<Rug3DRenderer | null>(null);
  const enable3DRenderingRef = useRef(enable3DRendering);
  const materialTypeRef = useRef<RugMaterialType>(materialType);
  const animFrameRef = useRef<number | null>(null);
  const texProg = useRef<WebGLProgram | null>(null);
  const roomProg = useRef<WebGLProgram | null>(null);
  const solidProg = useRef<WebGLProgram | null>(null);
  const occProg = useRef<WebGLProgram | null>(null);
  const shadowProg = useRef<WebGLProgram | null>(null);
  const bufRef = useRef<WebGLBuffer | null>(null);
  const maskTex = useRef<WebGLTexture | null>(null);
  const texCache = useRef<Map<string, WebGLTexture>>(new Map());
  const imgCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const layoutRef = useRef<ImageLayout | null>(null);
  const HRef = useRef<number[] | null>(null);
  const invHRef = useRef<number[] | null>(null);
  const dragRef = useRef<
    | { kind: "rug"; id: string; dxM: number; dzM: number }
    | { kind: "corner"; key: keyof FloorQuad }
    | { kind: "calib_corner"; idx: number }
    | { kind: "rotate"; id: string; cx: number; cz: number; start: number; base: number }
    | null
  >(null);
  const rugsRef = useRef(rugs);
  const floorRef = useRef(floor);
  const sizeRef = useRef(floorSize);
  const selectedRef = useRef(selectedId);
  const calRef = useRef(calibrating);
  const calibrationRef = useRef(calibration);
  const measuredCalibratingRef = useRef(measuredCalibrating);
  const calibrationCornersRef = useRef(calibrationCorners);
  const onCalibrationCornerChangeRef = useRef(onCalibrationCornerChange);
  const showDebugRef = useRef(showDebug);
  const toolRef = useRef(tool);
  const roomSrcRef = useRef(roomSrc);
  const floorPlateSrcRef = useRef(floorPlateSrc);
  const occRef = useRef(occlusion);
  const occMaskUrlRef = useRef(occlusionMaskUrl);
  const floorSupportMaskUrlRef = useRef(floorSupportMaskUrl);
  const [layout, setLayout] = useState<ImageLayout | null>(null);
  const onFloorChangeRef = useRef(onFloorChange);
  const onRugsChangeRef = useRef(onRugsChange);
  const onSelectRef = useRef(onSelect);
  const onToolbarRef = useRef(onToolbar);
  const onReadyCanvasRef = useRef(onReadyCanvas);
  const onOccludeClickRef = useRef(onOccludeClick);
  const lastTbRef = useRef<string>("");
  const lastRhRef = useRef<string>("");
  const [rotHandle, setRotHandle] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    rugsRef.current = rugs;
    floorRef.current = floor;
    sizeRef.current = floorSize;
    selectedRef.current = selectedId;
    calRef.current = calibrating;
    calibrationRef.current = calibration;
    measuredCalibratingRef.current = measuredCalibrating;
    calibrationCornersRef.current = calibrationCorners;
    onCalibrationCornerChangeRef.current = onCalibrationCornerChange;
    showDebugRef.current = showDebug;
    enable3DRenderingRef.current = enable3DRendering;
    materialTypeRef.current = materialType;
    toolRef.current = tool;
    occRef.current = occlusion;
    occMaskUrlRef.current = occlusionMaskUrl;
    floorSupportMaskUrlRef.current = floorSupportMaskUrl;
    roomSrcRef.current = roomSrc;
    floorPlateSrcRef.current = floorPlateSrc;
    onFloorChangeRef.current = onFloorChange;
    onRugsChangeRef.current = onRugsChange;
    onSelectRef.current = onSelect;
    onToolbarRef.current = onToolbar;
    onReadyCanvasRef.current = onReadyCanvas;
    onOccludeClickRef.current = onOccludeClick;
  }, [
    rugs,
    floor,
    floorSize,
    selectedId,
    calibrating,
    calibration,
    measuredCalibrating,
    calibrationCorners,
    onCalibrationCornerChange,
    showDebug,
    enable3DRendering,
    materialType,
    tool,
    occlusion,
    occlusionMaskUrl,
    floorSupportMaskUrl,
    roomSrc,
    floorPlateSrc,
    onFloorChange,
    onRugsChange,
    onSelect,
    onToolbar,
    onReadyCanvas,
    onOccludeClick,
  ]);

  const ensureTex = useCallback(async (gl: WebGLRenderingContext, url: string) => {
    const cached = texCache.current.get(url);
    if (cached) return cached;
    
    let img = imgCache.current.get(url);
    if (!img) {
      try {
        img = await loadImage(url);
        imgCache.current.set(url, img);
      } catch (e) {
        console.error("Failed to load image element:", url, e);
        return null;
      }
    }

    if (glRef.current !== gl) return null;
    const tex = gl.createTexture();
    if (!tex) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    const isPot = ((img.naturalWidth & (img.naturalWidth - 1)) === 0) &&
                  ((img.naturalHeight & (img.naturalHeight - 1)) === 0);
    if (isPot) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    }
    texCache.current.set(url, tex);
    return tex;
  }, []);

  const projectFloor = useCallback((p: Vec2): Vec2 | null => {
    const H = HRef.current;
    const layout = layoutRef.current;
    if (!H || !layout) return null;
    const uv = applyH(H, p);
    if (!Number.isFinite(uv.x) || !Number.isFinite(uv.y)) return null;
    return imageToCanvas(uv, layout);
  }, []);

  const unproject = useCallback((canvasPt: Vec2): Vec2 | null => {
    const inv = invHRef.current;
    const layout = layoutRef.current;
    if (!inv || !layout) return null;
    const imgPt = canvasToImage(canvasPt, layout);

    // Safeguard against projection singularity near/above horizon when dragging into wall
    const w = inv[6] * imgPt.x + inv[7] * imgPt.y + inv[8];
    if (w <= 0.035) {
      const depthM = sizeRef.current.depthFt * FT_TO_M;
      const widthM = sizeRef.current.widthFt * FT_TO_M;
      const xOffset = (imgPt.x - 0.5) * widthM * 2.8 + widthM * 0.5;
      return { x: xOffset, y: depthM * 2.5 };
    }

    const floorPt = applyH(inv, imgPt);
    if (!Number.isFinite(floorPt.x) || !Number.isFinite(floorPt.y)) return null;
    return floorPt;
  }, []);

  const upload = (data: Float32Array) => {
    const gl = glRef.current;
    const buf = bufRef.current;
    if (!gl || !buf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
  };

  const draw = useCallback(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    const texP = texProg.current;
    const roomP = roomProg.current;
    const solP = solidProg.current;
    const occP = occProg.current;
    const buf = bufRef.current;
    if (!gl || !canvas || !texP || !solP || !occP || !buf) return;

    const roomImg = imgCache.current.get(roomSrcRef.current);
    if (!roomImg) {
      console.warn("Room image not in imgCache for draw:", roomSrcRef.current);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW < 2 || cssH < 2) return;
    const pw = Math.round(cssW * dpr);
    const ph = Math.round(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }

    const layout = coverLayout(cssW, cssH, roomImg.naturalWidth, roomImg.naturalHeight);
    layoutRef.current = layout;
    setLayout((prev) =>
      prev && prev.x === layout.x && prev.y === layout.y && prev.w === layout.w && prev.h === layout.h && prev.canvasW === layout.canvasW && prev.canvasH === layout.canvasH
        ? prev
        : layout
    );
    const isCalibrated = Boolean(calibrationRef.current?.isCalibrated && calibrationRef.current.H_metric);
    const H = isCalibrated
      ? calibrationRef.current!.H_metric
      : floorToImageH(floorRef.current, sizeRef.current);
    const invH = isCalibrated
      ? calibrationRef.current!.invH_metric
      : (H ? invertH(H) : null);
    HRef.current = H;
    invHRef.current = invH;

    gl.viewport(0, 0, pw, ph);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    const bindTexProg = (light = true) => {
      gl.useProgram(texP);
      const aPosTex = gl.getAttribLocation(texP, "a_pos");
      const aUvTex = gl.getAttribLocation(texP, "a_uv");
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPosTex);
      gl.vertexAttribPointer(aPosTex, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(aUvTex);
      gl.vertexAttribPointer(aUvTex, 2, gl.FLOAT, false, 16, 8);
      gl.uniform4f(gl.getUniformLocation(texP, "u_layout"), layout.x, layout.y, layout.w, layout.h);
      gl.uniform2f(gl.getUniformLocation(texP, "u_css"), cssW, cssH);
      gl.uniform1f(gl.getUniformLocation(texP, "u_dpr"), dpr);
      gl.uniform1f(gl.getUniformLocation(texP, "u_lightMix"), light ? 0.62 : 0);

      const horizonY = Math.min(floorRef.current.farLeft.y, floorRef.current.farRight.y);
      gl.uniform1f(gl.getUniformLocation(texP, "u_horizonY"), horizonY);

      const rTex = texCache.current.get(roomSrcRef.current);
      if (rTex) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, rTex);
        gl.uniform1i(gl.getUniformLocation(texP, "u_room"), 1);
      }

      const activeSupportUrl = floorSupportMaskUrlRef.current;
      const supTex = activeSupportUrl ? texCache.current.get(activeSupportUrl) : null;
      if (supTex) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, supTex);
        gl.uniform1i(gl.getUniformLocation(texP, "u_floorSupport"), 2);
        gl.uniform1f(gl.getUniformLocation(texP, "u_hasFloorSupport"), 1.0);
      } else {
        gl.uniform1f(gl.getUniformLocation(texP, "u_hasFloorSupport"), 0.0);
      }
    };
    const bindSolid = () => {
      gl.useProgram(solP);
      const aPosSol = gl.getAttribLocation(solP, "a_pos");
      const aUvSol = gl.getAttribLocation(solP, "a_uv");
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPosSol);
      gl.vertexAttribPointer(aPosSol, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(aUvSol);
      gl.vertexAttribPointer(aUvSol, 2, gl.FLOAT, false, 16, 8);
    };

    const roomTex = texCache.current.get(roomSrcRef.current);
    const floorPlateTex = floorPlateSrcRef.current ? texCache.current.get(floorPlateSrcRef.current) : null;
    const baseTex = floorPlateTex || roomTex;
    if (baseTex && roomP) {
      const tl = pxToClip(layout.x, layout.y, cssW, cssH);
      const tr = pxToClip(layout.x + layout.w, layout.y, cssW, cssH);
      const br = pxToClip(layout.x + layout.w, layout.y + layout.h, cssW, cssH);
      const bl = pxToClip(layout.x, layout.y + layout.h, cssW, cssH);
      
      const verts = new Float32Array([
        tl.x, tl.y, 0, 0,
        tr.x, tr.y, 1, 0,
        bl.x, bl.y, 0, 1,
        tr.x, tr.y, 1, 0,
        br.x, br.y, 1, 1,
        bl.x, bl.y, 0, 1,
      ]);
      
      upload(verts);
      gl.useProgram(roomP);
      const aPos = gl.getAttribLocation(roomP, "a_pos");
      const aUv = gl.getAttribLocation(roomP, "a_uv");
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, baseTex);
      gl.uniform1i(gl.getUniformLocation(roomP, "u_tex"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    const pushGrid = () => {
      if (!H) return;
      const lines: number[] = [];
      const addSeg = (a: Vec2, b: Vec2) => {
        const pa = projectFloor(a);
        const pb = projectFloor(b);
        if (!pa || !pb) return;
        const ca = pxToClip(pa.x, pa.y, cssW, cssH);
        const cb = pxToClip(pb.x, pb.y, cssW, cssH);
        lines.push(ca.x, ca.y, 0, 0, cb.x, cb.y, 0, 0);
      };
      const widthM = sizeRef.current.widthFt * FT_TO_M;
      const depthM = sizeRef.current.depthFt * FT_TO_M;
      for (let x = 0; x <= widthM + 0.01; x += 0.5) addSeg({ x, y: 0 }, { x, y: depthM });
      for (let z = 0; z <= depthM + 0.01; z += 0.5) addSeg({ x: 0, y: z }, { x: widthM, y: z });
      if (!lines.length) return;
      upload(new Float32Array(lines));
      bindSolid();
      const alpha = calRef.current ? 0.35 : 0.20;
      gl.uniform4f(gl.getUniformLocation(solP, "u_color"), 1, 1, 1, alpha);
      gl.drawArrays(gl.LINES, 0, lines.length / 4);
    };

    // Customer viewing: hide grid completely. Only show during floor calibration or developer debug.
    if ((calRef.current || showDebugRef.current) && H) {
      pushGrid();
    }

    const tessellate = (cornersFloorM: Vec2[], expand = 0, offsetZ = 0) => {
      if (!H) return null;
      const verts: number[] = [];
      const pts: Vec2[][] = [];
      for (let j = 0; j <= DIV; j++) {
        const row: Vec2[] = [];
        const v = j / DIV;
        for (let i = 0; i <= DIV; i++) {
          const u = i / DIV;
          const a = 1 - u;
          const b = 1 - v;
          // bilinear in physical floor space (metres), then homography -> perspective
          const p = {
            x: cornersFloorM[0].x * a * b + cornersFloorM[1].x * u * b + cornersFloorM[2].x * u * v + cornersFloorM[3].x * a * v,
            y: cornersFloorM[0].y * a * b + cornersFloorM[1].y * u * b + cornersFloorM[2].y * u * v + cornersFloorM[3].y * a * v,
          };
          
          if (offsetZ) {
            p.y += offsetZ; // Offset along the floor depth
          }

          if (expand) {
            const c = {
              x: (cornersFloorM[0].x + cornersFloorM[1].x + cornersFloorM[2].x + cornersFloorM[3].x) / 4,
              y: (cornersFloorM[0].y + cornersFloorM[1].y + cornersFloorM[2].y + cornersFloorM[3].y) / 4,
            };
            p.x = c.x + (p.x - c.x) * (1 + expand);
            p.y = c.y + (p.y - c.y) * (1 + expand);
          }
          const scr = projectFloor(p);
          if (!scr) return null;
          row.push(pxToClip(scr.x, scr.y, cssW, cssH));
        }
        pts.push(row);
      }
      for (let j = 0; j < DIV; j++) {
        for (let i = 0; i < DIV; i++) {
          const u0 = i / DIV, u1 = (i + 1) / DIV;
          const v0 = j / DIV, v1 = (j + 1) / DIV;
          const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i + 1], d = pts[j + 1][i];
          verts.push(
            a.x, a.y, u0, v0,
            b.x, b.y, u1, v0,
            d.x, d.y, u0, v1,
            b.x, b.y, u1, v0,
            c.x, c.y, u1, v1,
            d.x, d.y, u0, v1
          );
        }
      }
      return new Float32Array(verts);
    };

    for (const rug of rugsRef.current) {
      const corners = rugFloorCornersM(rug);
      const zNorm = Math.min(1, Math.max(0, (rug.zM ?? (rug.z * FT_TO_M)) / (sizeRef.current.depthFt * FT_TO_M)));
      const shade = 1 - zNorm * 0.22;
      
      const mesh = tessellate(corners);
      const tex = texCache.current.get(rug.img);
      if (mesh && tex) {
        upload(mesh);
        bindTexProg(true);
        gl.uniform1f(gl.getUniformLocation(texP, "u_shade"), shade);
        gl.uniform1f(gl.getUniformLocation(texP, "u_alpha"), 0.98);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(gl.getUniformLocation(texP, "u_tex"), 0);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.length / VERT_STRIDE);
      }
      if (rug.instanceId === selectedRef.current) {
        const outline: number[] = [];
        for (let i = 0; i < 4; i++) {
          const a = projectFloor(corners[i]);
          const b = projectFloor(corners[(i + 1) % 4]);
          if (!a || !b) continue;
          const ca = pxToClip(a.x, a.y, cssW, cssH);
          const cb = pxToClip(b.x, b.y, cssW, cssH);
          outline.push(ca.x, ca.y, 0, 0, cb.x, cb.y, 0, 0);
        }
        if (outline.length) {
          upload(new Float32Array(outline));
          bindSolid();
          gl.uniform4f(gl.getUniformLocation(solP, "u_color"), 0.48, 0.05, 0.07, 0.9);
          gl.drawArrays(gl.LINES, 0, outline.length / 4);
        }
        const scr = corners.map((c) => projectFloor(c)).filter(Boolean) as Vec2[];
        if (scr.length === 4) {
          const cen = polygonCentroid(scr);
          const next = { x: cen.x, y: Math.max(...scr.map((p) => p.y)) + 14 };
          if (Number.isFinite(next.x) && Number.isFinite(next.y)) {
            const key = `${selectedRef.current}:${next.x.toFixed(1)}:${next.y.toFixed(1)}`;
            if (lastTbRef.current !== key) {
              lastTbRef.current = key;
              onToolbarRef.current(next);
            }
          }
          const top = scr.reduce((a, p) => (p.y < a.y ? p : a), scr[0]);
          const rh = { x: top.x, y: top.y - 22 };
          if (Number.isFinite(rh.x) && Number.isFinite(rh.y)) {
            const rhKey = `${rh.x.toFixed(0)}:${rh.y.toFixed(0)}`;
            if (lastRhRef.current !== rhKey) {
              lastRhRef.current = rhKey;
              setRotHandle(rh);
            }
          }
        }
      }
    }

    const activeMaskUrl = occMaskUrlRef.current;
    // Prefer native high-resolution AI mask texture directly when available to avoid downsample blur
    const mask = (activeMaskUrl ? texCache.current.get(activeMaskUrl) : null) || maskTex.current;
    const roomTex2 = floorPlateTex || texCache.current.get(roomSrcRef.current);
    if (mask && roomTex2 && (activeMaskUrl || occRef.current)) {
      const tl = pxToClip(layout.x, layout.y, cssW, cssH);
      const tr = pxToClip(layout.x + layout.w, layout.y, cssW, cssH);
      const br = pxToClip(layout.x + layout.w, layout.y + layout.h, cssW, cssH);
      const bl = pxToClip(layout.x, layout.y + layout.h, cssW, cssH);
      upload(new Float32Array([
        tl.x, tl.y, 0, 0,
        tr.x, tr.y, 1, 0,
        bl.x, bl.y, 0, 1,
        tr.x, tr.y, 1, 0,
        br.x, br.y, 1, 1,
        bl.x, bl.y, 0, 1,
      ]));
      gl.useProgram(occP);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const aPosO = gl.getAttribLocation(occP, "a_pos");
      const aUvO = gl.getAttribLocation(occP, "a_uv");
      gl.enableVertexAttribArray(aPosO);
      gl.vertexAttribPointer(aPosO, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(aUvO);
      gl.vertexAttribPointer(aUvO, 2, gl.FLOAT, false, 16, 8);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, roomTex2);
      gl.uniform1i(gl.getUniformLocation(occP, "u_room"), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, mask);
      gl.uniform1i(gl.getUniformLocation(occP, "u_mask"), 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    if (!selectedRef.current && lastTbRef.current !== "") {
      lastTbRef.current = "";
      onToolbarRef.current(null);
      lastRhRef.current = "";
      setRotHandle(null);
    }
  }, [projectFloor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { 
      preserveDrawingBuffer: true, 
      antialias: true,
      alpha: true,
      premultipliedAlpha: false
    });
    if (!gl) return;
    glRef.current = gl;
    texProg.current = program(gl, FS_TEX);
    roomProg.current = program(gl, FS_ROOM);
    solidProg.current = program(gl, FS_SOLID);
    occProg.current = program(gl, FS_OCCLUDE);
    shadowProg.current = program(gl, FS_SHADOW);
    bufRef.current = gl.createBuffer();
    try {
      rug3DRendererRef.current = new Rug3DRenderer(gl);
    } catch (e) {
      console.error("Rug3DRenderer initialization error:", e);
    }
    onReadyCanvasRef.current(canvas);
    
    // Initial draw to ensure clear state
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      texCache.current.forEach((t) => gl.deleteTexture(t));
      texCache.current.clear();
      if (bufRef.current) gl.deleteBuffer(bufRef.current);
      if (texProg.current) gl.deleteProgram(texProg.current);
      if (solidProg.current) gl.deleteProgram(solidProg.current);
      if (occProg.current) gl.deleteProgram(occProg.current);
      if (maskTex.current) gl.deleteTexture(maskTex.current);
      rug3DRendererRef.current = null;
      glRef.current = null;
      onReadyCanvasRef.current(null);
    };
  }, []);

  const rugUrls = rugs.map((r) => r.img).join("|");
  const maskUrl = occlusionMaskUrl || "";

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureTex(gl, roomSrc);
        if (floorPlateSrc) {
          await ensureTex(gl, floorPlateSrc);
        }
        if (maskUrl) {
          await ensureTex(gl, maskUrl);
        }
        if (floorSupportMaskUrl) {
          await ensureTex(gl, floorSupportMaskUrl);
        }
        for (const url of rugUrls.split("|")) {
          if (url) {
            await ensureTex(gl, url);
          }
        }

        // Preload PBR material maps
        const mat = materialTypeRef.current || "wool_silk";
        const prof = MATERIAL_PROFILES[mat] || MATERIAL_PROFILES.wool_silk;
        if (prof.normalMapUrl) await ensureTex(gl, prof.normalMapUrl);
        if (prof.heightMapUrl) await ensureTex(gl, prof.heightMapUrl);
        if (prof.roughnessMapUrl) await ensureTex(gl, prof.roughnessMapUrl);
        await ensureTex(gl, "/images/materials/silk_normal.png");
        await ensureTex(gl, "/images/materials/silk_height.png");
        await ensureTex(gl, "/images/materials/silk_roughness.png");

        // Preload fringe textures for fringed rugs
        for (const rug of rugsRef.current) {
          if (isFringedRug(rug.productId)) {
            await ensureTex(gl, `/images/processed_rugs/${rug.productId}/fringe_top.png`).catch(() => null);
            await ensureTex(gl, `/images/processed_rugs/${rug.productId}/fringe_bottom.png`).catch(() => null);
          }
        }

        if (!cancelled) {
          draw();
        }
      } catch (e) {
        console.error("Texture loading error:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomSrc, floorPlateSrc, rugUrls, maskUrl, floorSupportMaskUrl, ensureTex, draw]);

  useEffect(() => {
    occRef.current = occlusion;
    const gl = glRef.current;
    if (!gl) return;
    if (!occlusion) {
      maskTex.current = null;
      draw();
      return;
    }
    if (!maskTex.current) maskTex.current = gl.createTexture();
    const tex = maskTex.current;
    if (!tex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, occlusion.width, occlusion.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, occlusion.data);
    draw();
  }, [occlusion, draw]);

  useEffect(() => {
    draw();
  }, [floor, floorSize, rugs, selectedId, calibrating, showDebug, occlusionMaskUrl, floorSupportMaskUrl, draw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  const localPoint = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const hitCorner = (pt: Vec2): keyof FloorQuad | null => {
    if (!calRef.current) return null;
    const keys: (keyof FloorQuad)[] = ["nearLeft", "nearRight", "farRight", "farLeft"];
    const layout = layoutRef.current;
    if (!layout) return null;
    for (const k of keys) {
      const p = imageToCanvas(floorRef.current[k], layout);
      const dx = p.x - pt.x;
      const dy = p.y - pt.y;
      if (dx * dx + dy * dy < 22 * 22) return k;
    }
    return null;
  };

  const hitCalibCorner = (pt: Vec2): number | null => {
    if (!measuredCalibratingRef.current || !calibrationCornersRef.current) return null;
    const layout = layoutRef.current;
    if (!layout) return null;
    const corners = calibrationCornersRef.current;
    for (let i = 0; i < 4; i++) {
      const p = imageToCanvas(corners[i], layout);
      const dx = p.x - pt.x;
      const dy = p.y - pt.y;
      if (dx * dx + dy * dy < 26 * 26) return i;
    }
    return null;
  };

  const hitRug = (floorPtM: Vec2): PlacedRug | null => {
    for (let i = rugsRef.current.length - 1; i >= 0; i--) {
      const rug = rugsRef.current[i];
      if (pointInPolygon(floorPtM, rugFloorCornersM(rug))) return rug;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = localPoint(e);

    // 1. Measured floor reference calibration handles
    const calIdx = hitCalibCorner(pt);
    if (calIdx !== null) {
      dragRef.current = { kind: "calib_corner", idx: calIdx };
      return;
    }

    // 2. Room floor boundary handles
    const corner = hitCorner(pt);
    if (corner) {
      dragRef.current = { kind: "corner", key: corner };
      return;
    }

    const layout = layoutRef.current;
    if (toolRef.current !== "move" && layout) {
      const img = canvasToImage(pt, layout);
      onOccludeClickRef.current(img, toolRef.current === "under");
      return;
    }

    // 3. Unproject into floor coordinates (metres)
    const floorPtM = unproject(pt);
    if (!floorPtM) {
      onSelectRef.current(null);
      return;
    }
    const rug = hitRug(floorPtM);
    if (rug) {
      onSelectRef.current(rug.instanceId);
      const rxM = rug.xM ?? (rug.x * FT_TO_M);
      const rzM = rug.zM ?? (rug.z * FT_TO_M);
      dragRef.current = {
        kind: "rug",
        id: rug.instanceId,
        dxM: rxM - floorPtM.x,
        dzM: rzM - floorPtM.y,
      };
    } else {
      onSelectRef.current(null);
      dragRef.current = null;
    }
  };

  const beginRotate = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rug = rugsRef.current.find((r) => r.instanceId === selectedRef.current);
    if (!rug) return;
    const pt = localPoint(e);
    const floorPtM = unproject(pt);
    if (!floorPtM) return;
    const rxM = rug.xM ?? (rug.x * FT_TO_M);
    const rzM = rug.zM ?? (rug.z * FT_TO_M);
    dragRef.current = {
      kind: "rotate",
      id: rug.instanceId,
      cx: rxM,
      cz: rzM,
      start: Math.atan2(floorPtM.y - rzM, floorPtM.x - rxM),
      base: rug.rot,
    };
  };

  const schedulePhysicsDraw = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(() => {
      draw();
      if (rug3DRendererRef.current && !rug3DRendererRef.current.fringePhysics.isSleeping) {
        schedulePhysicsDraw();
      }
    });
  }, [draw]);

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pt = localPoint(e);

    if (drag.kind === "calib_corner") {
      const layout = layoutRef.current;
      if (!layout) return;
      const img = canvasToImage(pt, layout);
      onCalibrationCornerChangeRef.current?.(drag.idx, {
        x: Math.min(1, Math.max(0, img.x)),
        y: Math.min(1, Math.max(0, img.y)),
      });
      return;
    }

    if (drag.kind === "corner") {
      const layout = layoutRef.current;
      if (!layout) return;
      const img = canvasToImage(pt, layout);
      onFloorChangeRef.current({ ...floorRef.current, [drag.key]: { x: img.x, y: img.y } });
      return;
    }

    const floorPtM = unproject(pt);
    if (!floorPtM) return;

    if (drag.kind === "rotate") {
      const ang = Math.atan2(floorPtM.y - drag.cz, floorPtM.x - drag.cx);
      const rot = drag.base + (ang - drag.start);
      onRugsChangeRef.current(
        rugsRef.current.map((r) => (r.instanceId === drag.id ? { ...r, rot } : r))
      );
      schedulePhysicsDraw();
    } else if (drag.kind === "rug") {
      onRugsChangeRef.current(
        rugsRef.current.map((r) => {
          if (r.instanceId !== drag.id) return r;
          // Roomvo-grade free dragging: allow moving partially or completely beyond wall boundaries
          const nextXM = floorPtM.x + drag.dxM;
          const nextZM = floorPtM.y + drag.dzM;
          return {
            ...r,
            xM: nextXM,
            zM: nextZM,
            x: nextXM * M_TO_FT,
            z: nextZM * M_TO_FT,
          };
        })
      );
      schedulePhysicsDraw();
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
    schedulePhysicsDraw();
  };

  const handles = (["nearLeft", "nearRight", "farRight", "farLeft"] as const).map((key) => {
    if (!layout) return { key, x: 0, y: 0 };
    const p = imageToCanvas(floor[key], layout);
    return { key, x: p.x, y: p.y };
  });

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden bg-[#0d0d0d]">
      {layout && (
        <img
          src={roomSrc}
          alt="Room space"
          className="absolute pointer-events-none select-none"
          style={{
            left: `${layout.x}px`,
            top: `${layout.y}px`,
            width: `${layout.w}px`,
            height: `${layout.h}px`,
            maxWidth: "none",
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full touch-none ${
          tool === "move" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {calibrating && layout && handles.map((h) => (
        <div
          key={h.key}
          className="absolute z-20 w-4 h-4 -ml-2 -mt-2 rounded-full bg-white border-2 border-[#7A0C13] pointer-events-none shadow-md"
          style={{ left: h.x, top: h.y }}
        />
      ))}
      {measuredCalibrating && calibrationCorners && layout && (() => {
        const pts = calibrationCorners.map((c) => imageToCanvas(c, layout));
        const polyPoints = pts.map((p) => `${p.x},${p.y}`).join(" ");
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
            <polygon
              points={polyPoints}
              fill="rgba(245, 158, 11, 0.18)"
              stroke="#f59e0b"
              strokeWidth="2.5"
              strokeDasharray="6 4"
            />
            {pts.map((p, idx) => (
              <g key={idx} transform={`translate(${p.x}, ${p.y})`}>
                <circle r="14" fill="#f59e0b" stroke="#ffffff" strokeWidth="2.5" className="filter drop-shadow" />
                <text
                  textAnchor="middle"
                  dy="4.5"
                  fill="#000000"
                  fontSize="12"
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  {idx + 1}
                </text>
              </g>
            ))}
          </svg>
        );
      })()}
      {showDebug && debugOverlayUrl && layout && (
        <img
          src={debugOverlayUrl}
          alt="AI Vision Debug"
          className="absolute z-10 pointer-events-none opacity-50 select-none mix-blend-screen"
          style={{
            left: `${layout.x}px`,
            top: `${layout.y}px`,
            width: `${layout.w}px`,
            height: `${layout.h}px`,
            maxWidth: "none",
          }}
        />
      )}
      {rotHandle && selectedId && tool === "move" && !calibrating && !measuredCalibrating && (
        <button
          type="button"
          aria-label="Rotate rug"
          className="absolute z-20 w-7 h-7 -ml-3.5 -mt-3.5 rounded-full bg-white text-black flex items-center justify-center border border-black/20 cursor-grab active:cursor-grabbing shadow-lg"
          style={{ left: rotHandle.x, top: rotHandle.y }}
          onPointerDown={beginRotate}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <RotateCw size={13} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
