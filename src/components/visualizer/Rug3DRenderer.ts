/**
 * VIZDECK RoomIQ — Advanced 3D/2.5D Physically Based Rug Renderer
 * Senior Real-Time Graphics & Shader Engineer
 *
 * Architecture: Native WebGL2/GLSL PBR Pipeline (Approach A)
 * - Subdivided top pile mesh with physical elevation and vertex displacement
 * - Physical sidewalls and beveled pile rim
 * - Multi-profile PBR materials: Wool (diffuse, rough), Silk (anisotropic sheen), Blends
 * - Restrained micro-relief parallax mapping
 * - Dynamic spring-constrained Verlet fringe ribbons
 * - OneFormer + SAM furniture pile compression & contact shadows
 * - Room-aware luminance grounding and wall clipping
 */

import {
  applyH,
  rugFloorCornersM,
  rotate2,
  type PlacedRug,
  type Vec2,
  type ImageLayout,
} from "./floorMath";
import {
  isFringedRug,
  MATERIAL_PROFILES,
  type RugMaterialProfile,
  type RugMaterialType,
} from "./rugMaterials";
import { FringePhysicsSystem } from "./fringePhysics";

const VS_3D = `
attribute vec2 a_pos;        // Screen clip-space x, y
attribute vec2 a_uv;         // Albedo UV [0..1]
attribute vec3 a_normal;     // Tangent/World normal
attribute float a_elevation; // Normalized elevation (0 = floor, 1 = top of pile)
attribute vec2 a_macroUv;    // Tiling micro-fiber UV

varying vec2 v_uv;
varying vec3 v_normal;
varying float v_elevation;
varying vec2 v_macroUv;

void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_uv;
  v_normal = a_normal;
  v_elevation = a_elevation;
  v_macroUv = a_macroUv;
}
`;

const FS_3D_PBR = `
precision mediump float;

varying vec2 v_uv;
varying vec3 v_normal;
varying float v_elevation;
varying vec2 v_macroUv;

uniform sampler2D u_tex;           // Albedo (transparent rug texture)
uniform sampler2D u_normalMap;     // Tangent-space micro-weave normal map
uniform sampler2D u_heightMap;     // Micro-pile height map
uniform sampler2D u_roughnessMap;  // Microfacet roughness map
uniform sampler2D u_room;          // Room photograph texture
uniform sampler2D u_floorSupport;  // Floor segmentation support mask
uniform float u_hasFloorSupport;
uniform sampler2D u_furnitureMask; // SAM furniture occlusion mask
uniform float u_hasFurnitureMask;

uniform float u_horizonY;
uniform float u_shade;
uniform float u_alpha;
uniform float u_lightMix;
uniform vec4 u_layout;
uniform vec2 u_css;
uniform float u_dpr;

// PBR Material Uniforms
uniform float u_roughness;
uniform float u_specularStrength;
uniform float u_sheenIntensity;
uniform float u_sheenRoughness;
uniform float u_normalStrength;
uniform float u_heightParallax;
uniform float u_isSidewall;        // 1.0 for sidewalls, 0.0 for top pile
uniform vec3 u_lightDir;           // Directional light vector in tangent space

void main() {
  // Screen-space point and photograph UV
  vec2 cssPt = vec2(gl_FragCoord.x, u_css.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec2 ruv = (cssPt - u_layout.xy) / u_layout.zw;

  // Discard fragments outside the photograph bounds
  if (ruv.x < 0.0 || ruv.x > 1.0 || ruv.y < 0.0 || ruv.y > 1.0) discard;

  // Floor support boundary clipping
  if (u_hasFloorSupport > 0.5) {
    float sup = texture2D(u_floorSupport, ruv).r;
    if (sup < 0.15) discard;
  } else {
    if (ruv.y < u_horizonY) discard;
  }

  // Parallax mapping for micro-pile depth
  vec2 uv = v_uv;
  if (u_isSidewall < 0.5) {
    float h = texture2D(u_heightMap, v_macroUv).r;
    vec2 viewDir = normalize(v_uv - 0.5);
    uv += (h - 0.5) * u_heightParallax * viewDir;
  }

  vec4 albedo = texture2D(u_tex, uv);
  float outAlpha = clamp(albedo.a * u_alpha, 0.0, 1.0);
  if (outAlpha < 0.01) discard;

  // Normal Mapping: perturb surface normal using tangent-space micro-weave
  vec3 geomN = normalize(v_normal);
  vec3 normTex = texture2D(u_normalMap, v_macroUv).rgb * 2.0 - 1.0;
  normTex.xy *= u_normalStrength;
  vec3 N = normalize(geomN + vec3(normTex.x * 0.6, normTex.y * 0.6, normTex.z - 1.0));

  // Sample room lighting
  vec3 room = texture2D(u_room, ruv).rgb;
  float roomLum = dot(room, vec3(0.299, 0.587, 0.114));

  // Furniture interaction: contact ambient occlusion & pile compression
  float contactAO = 1.0;
  if (u_hasFurnitureMask > 0.5) {
    float fMask = texture2D(u_furnitureMask, ruv).r;
    // Darken slightly where furniture legs contact the pile
    contactAO = mix(1.0, 0.60, smoothstep(0.08, 0.40, fMask));
  }

  // Sample roughness from map modulated by profile
  float rMap = texture2D(u_roughnessMap, v_macroUv).r;
  float roughness = clamp(u_roughness * (0.85 + rMap * 0.30), 0.05, 1.0);

  // Oren-Nayar style soft diffuse scattering (characteristic of natural wool pile)
  vec3 L = normalize(u_lightDir);
  float NdotL = max(dot(N, L), 0.0);
  float softDiffuse = mix(NdotL, clamp(NdotL * 0.70 + 0.30, 0.0, 1.0), roughness * 0.55);

  // Microfacet Specular Reflection
  vec3 V = vec3(0.0, 0.0, 1.0); // View direction (perpendicular to screen)
  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0);
  float specPower = mix(48.0, 4.0, roughness);
  float spec = pow(NdotH, specPower) * u_specularStrength;

  // Directional Anisotropic Sheen for Silk Fibers
  vec3 fiberDir = vec3(0.0, 1.0, 0.0); // Primary warp direction
  float TdotH = dot(cross(N, fiberDir), H);
  float sheen = pow(1.0 - abs(TdotH), mix(24.0, 3.0, u_sheenRoughness)) * u_sheenIntensity;

  // Ambient lighting factor grounded in the room photograph
  float ambient = mix(0.75, clamp(0.86 + roomLum * 0.28, 0.88, 1.14), u_lightMix * 0.30);

  // Combine lighting components
  vec3 lit = albedo.rgb * (ambient * softDiffuse + spec + sheen * room) * contactAO * u_shade;

  // Physical sidewalls have natural self-shadowing crevice falloff
  if (u_isSidewall > 0.5) {
    lit *= mix(0.72, 0.95, v_elevation);
  }

  gl_FragColor = vec4(lit, outAlpha);
}
`;

const STRIDE_3D = 10; // x, y, u, v, nx, ny, nz, elev, macroU, macroV

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(err || "3D shader compilation failed");
  }
  return s;
}

function createProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const err = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(err || "3D program link failed");
  }
  return p;
}

export class Rug3DRenderer {
  private gl: WebGLRenderingContext;
  private prog3D: WebGLProgram | null = null;
  private buf3D: WebGLBuffer | null = null;
  private fringeBuf: WebGLBuffer | null = null;

  public fringePhysics: FringePhysicsSystem;
  public activeMaterial: RugMaterialType = "wool_silk";
  public is3DEnabled: boolean = true;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.fringePhysics = new FringePhysicsSystem(true);
    this.initGL();
  }

  private initGL() {
    const gl = this.gl;
    this.prog3D = createProgram(gl, VS_3D, FS_3D_PBR);
    this.buf3D = gl.createBuffer();
    this.fringeBuf = gl.createBuffer();
  }

  /**
   * Projects a floor coordinate (x, z in metres) with optional vertical elevation (h in metres)
   * onto normalized screen clip space [-1..1].
   */
  public projectPointToClip(
    floorM: Vec2,
    elevationM: number,
    H: number[],
    layout: ImageLayout,
    cssW: number,
    cssH: number
  ): Vec2 | null {
    // 1. Planar homography projection
    const x = H[0] * floorM.x + H[1] * floorM.y + H[2];
    const y = H[3] * floorM.x + H[4] * floorM.y + H[5];
    const w = H[6] * floorM.x + H[7] * floorM.y + H[8];
    if (Math.abs(w) < 1e-12) return null;

    let imgU = x / w;
    let imgV = y / w;

    // 2. Physical vertical elevation displacement:
    // Follows camera perspective: displacement in image space is inversely proportional to depth (w)
    if (elevationM > 0) {
      const vertScale = 0.85; // calibrated elevation projection factor
      const deltaImgV = -(elevationM * vertScale) / Math.max(w, 0.1);
      imgV += deltaImgV;
    }

    // 3. Layout and clip-space conversion
    const canvasX = layout.x + imgU * layout.w;
    const canvasY = layout.y + imgV * layout.h;

    return {
      x: (canvasX / cssW) * 2 - 1,
      y: 1 - (canvasY / cssH) * 2,
    };
  }

  /**
   * Constructs the full 3D physical mesh:
   * 1. Subdivided top pile grid (elevation = pileHeight)
   * 2. Beveled pile rim chamfer
   * 3. Physical vertical sidewalls (connecting bevel to floor)
   */
  public build3DMesh(
    rug: PlacedRug,
    profile: RugMaterialProfile,
    H: number[],
    layout: ImageLayout,
    cssW: number,
    cssH: number
  ): Float32Array | null {
    const verts: number[] = [];
    const GRID_DIV = 36;

    const hw = rug.widthM / 2.0;
    const hl = rug.lengthM / 2.0;
    const pileH = profile.pileHeightM;
    const bevelW = profile.bevelWidthM;
    const sideT = profile.sidewallThicknessM;

    // Inner top grid bounds (shrunk slightly by bevel width)
    const topHw = Math.max(0.1, hw - bevelW);
    const topHl = Math.max(0.1, hl - bevelW);

    const project = (localFloorM: Vec2, elevM: number) => {
      const rotP = rotate2(localFloorM, rug.rot);
      const worldM: Vec2 = { x: rotP.x + rug.xM, y: rotP.y + rug.zM };
      return this.projectPointToClip(worldM, elevM, H, layout, cssW, cssH);
    };

    // ==========================================
    // 1. SUBDIVIDED TOP PILE SURFACE
    // ==========================================
    const topPts: Vec2[][] = [];
    for (let j = 0; j <= GRID_DIV; j++) {
      const row: Vec2[] = [];
      const v = j / GRID_DIV;
      const localY = -topHl + v * (topHl * 2.0);

      for (let i = 0; i <= GRID_DIV; i++) {
        const u = i / GRID_DIV;
        const localX = -topHw + u * (topHw * 2.0);
        const clipPt = project({ x: localX, y: localY }, pileH);
        if (!clipPt) return null;
        row.push(clipPt);
      }
      topPts.push(row);
    }

    const macroTiling = profile.macroTextureScale;

    for (let j = 0; j < GRID_DIV; j++) {
      for (let i = 0; i < GRID_DIV; i++) {
        const u0 = i / GRID_DIV, u1 = (i + 1) / GRID_DIV;
        const v0 = j / GRID_DIV, v1 = (j + 1) / GRID_DIV;
        const a = topPts[j][i], b = topPts[j][i + 1], c = topPts[j + 1][i + 1], d = topPts[j + 1][i];

        // Normals point upward (0, 0, 1 in tangent space)
        // Stride: x, y, u, v, nx, ny, nz, elev, macroU, macroV
        verts.push(
          a.x, a.y, u0, v0, 0, 0, 1, 1.0, u0 * macroTiling, v0 * macroTiling,
          b.x, b.y, u1, v0, 0, 0, 1, 1.0, u1 * macroTiling, v0 * macroTiling,
          d.x, d.y, u0, v1, 0, 0, 1, 1.0, u0 * macroTiling, v1 * macroTiling,
          b.x, b.y, u1, v0, 0, 0, 1, 1.0, u1 * macroTiling, v0 * macroTiling,
          c.x, c.y, u1, v1, 0, 0, 1, 1.0, u1 * macroTiling, v1 * macroTiling,
          d.x, d.y, u0, v1, 0, 0, 1, 1.0, u0 * macroTiling, v1 * macroTiling
        );
      }
    }

    // ==========================================
    // 2. BEVELED PILE RIM & 3. PHYSICAL SIDEWALLS
    // ==========================================
    // 4 edges: Near (bottom), Far (top), Left, Right
    const addEdgeGeometry = (
      pStartInner: Vec2, pEndInner: Vec2,
      pStartOuter: Vec2, pEndOuter: Vec2,
      uStart: number, uEnd: number,
      vInner: number, vOuter: number,
      normalOut: Vec2
    ) => {
      const steps = 18;
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        const uA = uStart + t0 * (uEnd - uStart);
        const uB = uStart + t1 * (uEnd - uStart);

        // Inner beveled top edge (pileH)
        const inA = {
          x: pStartInner.x + t0 * (pEndInner.x - pStartInner.x),
          y: pStartInner.y + t0 * (pEndInner.y - pStartInner.y),
        };
        const inB = {
          x: pStartInner.x + t1 * (pEndInner.x - pStartInner.x),
          y: pStartInner.y + t1 * (pEndInner.y - pStartInner.y),
        };

        // Outer beveled edge (bevelH)
        const outA = {
          x: pStartOuter.x + t0 * (pEndOuter.x - pStartOuter.x),
          y: pStartOuter.y + t0 * (pEndOuter.y - pStartOuter.y),
        };
        const outB = {
          x: pStartOuter.x + t1 * (pEndOuter.x - pStartOuter.x),
          y: pStartOuter.y + t1 * (pEndOuter.y - pStartOuter.y),
        };

        const scInA = project(inA, pileH);
        const scInB = project(inB, pileH);
        const scBevelA = project(outA, sideT * 0.85);
        const scBevelB = project(outB, sideT * 0.85);
        const scFloorA = project(outA, 0.0);
        const scFloorB = project(outB, 0.0);

        if (!scInA || !scInB || !scBevelA || !scBevelB || !scFloorA || !scFloorB) continue;

        // Quad 1: Bevel Chamfer (45 deg angle)
        const bNx = normalOut.x * 0.707;
        const bNy = normalOut.y * 0.707;
        const bNz = 0.707;
        verts.push(
          scInA.x, scInA.y, uA, vInner, bNx, bNy, bNz, 0.9, uA * macroTiling, 0.9 * macroTiling,
          scInB.x, scInB.y, uB, vInner, bNx, bNy, bNz, 0.9, uB * macroTiling, 0.9 * macroTiling,
          scBevelA.x, scBevelA.y, uA, vOuter, bNx, bNy, bNz, 0.75, uA * macroTiling, 0.75 * macroTiling,
          scInB.x, scInB.y, uB, vInner, bNx, bNy, bNz, 0.9, uB * macroTiling, 0.9 * macroTiling,
          scBevelB.x, scBevelB.y, uB, vOuter, bNx, bNy, bNz, 0.75, uB * macroTiling, 0.75 * macroTiling,
          scBevelA.x, scBevelA.y, uA, vOuter, bNx, bNy, bNz, 0.75, uA * macroTiling, 0.75 * macroTiling
        );

        // Quad 2: Vertical Sidewall (elevation down to floor)
        const sNx = normalOut.x;
        const sNy = normalOut.y;
        const sNz = 0.0;
        verts.push(
          scBevelA.x, scBevelA.y, uA, vOuter, sNx, sNy, sNz, 0.5, uA * macroTiling, 0.5 * macroTiling,
          scBevelB.x, scBevelB.y, uB, vOuter, sNx, sNy, sNz, 0.5, uB * macroTiling, 0.5 * macroTiling,
          scFloorA.x, scFloorA.y, uA, vOuter, sNx, sNy, sNz, 0.0, uA * macroTiling, 0.0,
          scBevelB.x, scBevelB.y, uB, vOuter, sNx, sNy, sNz, 0.5, uB * macroTiling, 0.5 * macroTiling,
          scFloorB.x, scFloorB.y, uB, vOuter, sNx, sNy, sNz, 0.0, uB * macroTiling, 0.0,
          scFloorA.x, scFloorA.y, uA, vOuter, sNx, sNy, sNz, 0.0, uA * macroTiling, 0.0
        );
      }
    };

    // Bottom Edge (near, facing viewer)
    addEdgeGeometry(
      { x: -topHw, y: topHl }, { x: topHw, y: topHl },
      { x: -hw, y: hl }, { x: hw, y: hl },
      0.0, 1.0, 1.0 - bevelW / (hl * 2.0), 1.0,
      { x: 0, y: 1 }
    );

    // Top Edge (far)
    addEdgeGeometry(
      { x: topHw, y: -topHl }, { x: -topHw, y: -topHl },
      { x: hw, y: -hl }, { x: -hw, y: -hl },
      1.0, 0.0, bevelW / (hl * 2.0), 0.0,
      { x: 0, y: -1 }
    );

    // Left Edge
    addEdgeGeometry(
      { x: -topHw, y: -topHl }, { x: -topHw, y: topHl },
      { x: -hw, y: -hl }, { x: -hw, y: hl },
      bevelW / (hw * 2.0), bevelW / (hw * 2.0), 0.0, 1.0,
      { x: -1, y: 0 }
    );

    // Right Edge
    addEdgeGeometry(
      { x: topHw, y: topHl }, { x: topHw, y: -topHl },
      { x: hw, y: hl }, { x: hw, y: -hl },
      1.0 - bevelW / (hw * 2.0), 1.0 - bevelW / (hw * 2.0), 1.0, 0.0,
      { x: 1, y: 0 }
    );

    return new Float32Array(verts);
  }

  /**
   * Renders the 3D rug with PBR shading, sidewalls, bevel, and dynamic fringe.
   */
  public renderRug3D(
    rug: PlacedRug,
    albedoTex: WebGLTexture,
    materialTextures: {
      normalTex: WebGLTexture | null;
      heightTex: WebGLTexture | null;
      roughnessTex: WebGLTexture | null;
    },
    fringeTextures: {
      topTex: WebGLTexture | null;
      botTex: WebGLTexture | null;
    },
    roomTex: WebGLTexture | null,
    floorSupportTex: WebGLTexture | null,
    furnitureMaskTex: WebGLTexture | null,
    H: number[],
    layout: ImageLayout,
    cssW: number,
    cssH: number,
    dpr: number,
    horizonY: number,
    lightMix: number,
    shade: number,
    currentTime: number
  ) {
    const gl = this.gl;
    const p = this.prog3D;
    const buf = this.buf3D;
    if (!p || !buf || !albedoTex) return;

    const profile = MATERIAL_PROFILES[this.activeMaterial] || MATERIAL_PROFILES.wool_silk;

    // 1. Build & Upload 3D Physical Mesh
    const mesh = this.build3DMesh(rug, profile, H, layout, cssW, cssH);
    if (!mesh) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.DYNAMIC_DRAW);

    gl.useProgram(p);

    // Bind Attributes
    const aPos = gl.getAttribLocation(p, "a_pos");
    const aUv = gl.getAttribLocation(p, "a_uv");
    const aNorm = gl.getAttribLocation(p, "a_normal");
    const aElev = gl.getAttribLocation(p, "a_elevation");
    const aMacro = gl.getAttribLocation(p, "a_macroUv");

    const strideBytes = STRIDE_3D * 4;
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, strideBytes, 0);

    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, strideBytes, 8);

    gl.enableVertexAttribArray(aNorm);
    gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, strideBytes, 16);

    gl.enableVertexAttribArray(aElev);
    gl.vertexAttribPointer(aElev, 1, gl.FLOAT, false, strideBytes, 28);

    gl.enableVertexAttribArray(aMacro);
    gl.vertexAttribPointer(aMacro, 2, gl.FLOAT, false, strideBytes, 32);

    // Bind Textures to Units 0..6
    // Unit 0: Albedo
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, albedoTex);
    gl.uniform1i(gl.getUniformLocation(p, "u_tex"), 0);

    // Unit 1: Normal Map
    if (materialTextures.normalTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, materialTextures.normalTex);
      gl.uniform1i(gl.getUniformLocation(p, "u_normalMap"), 1);
    }

    // Unit 2: Height Map
    if (materialTextures.heightTex) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, materialTextures.heightTex);
      gl.uniform1i(gl.getUniformLocation(p, "u_heightMap"), 2);
    }

    // Unit 3: Roughness Map
    if (materialTextures.roughnessTex) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, materialTextures.roughnessTex);
      gl.uniform1i(gl.getUniformLocation(p, "u_roughnessMap"), 3);
    }

    // Unit 4: Room Photograph
    if (roomTex) {
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, roomTex);
      gl.uniform1i(gl.getUniformLocation(p, "u_room"), 4);
    }

    // Unit 5: Floor Support
    if (floorSupportTex) {
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, floorSupportTex);
      gl.uniform1i(gl.getUniformLocation(p, "u_floorSupport"), 5);
      gl.uniform1f(gl.getUniformLocation(p, "u_hasFloorSupport"), 1.0);
    } else {
      gl.uniform1f(gl.getUniformLocation(p, "u_hasFloorSupport"), 0.0);
    }

    // Unit 6: Furniture Mask
    if (furnitureMaskTex) {
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, furnitureMaskTex);
      gl.uniform1i(gl.getUniformLocation(p, "u_furnitureMask"), 6);
      gl.uniform1f(gl.getUniformLocation(p, "u_hasFurnitureMask"), 1.0);
    } else {
      gl.uniform1f(gl.getUniformLocation(p, "u_hasFurnitureMask"), 0.0);
    }

    // Set Uniforms
    gl.uniform1f(gl.getUniformLocation(p, "u_horizonY"), horizonY);
    gl.uniform1f(gl.getUniformLocation(p, "u_shade"), shade);
    gl.uniform1f(gl.getUniformLocation(p, "u_alpha"), 0.98);
    gl.uniform1f(gl.getUniformLocation(p, "u_lightMix"), lightMix);
    gl.uniform4f(gl.getUniformLocation(p, "u_layout"), layout.x, layout.y, layout.w, layout.h);
    gl.uniform2f(gl.getUniformLocation(p, "u_css"), cssW, cssH);
    gl.uniform1f(gl.getUniformLocation(p, "u_dpr"), dpr);

    // PBR parameters
    gl.uniform1f(gl.getUniformLocation(p, "u_roughness"), profile.roughness);
    gl.uniform1f(gl.getUniformLocation(p, "u_specularStrength"), profile.specularStrength);
    gl.uniform1f(gl.getUniformLocation(p, "u_sheenIntensity"), profile.sheenIntensity);
    gl.uniform1f(gl.getUniformLocation(p, "u_sheenRoughness"), profile.sheenRoughness);
    gl.uniform1f(gl.getUniformLocation(p, "u_normalStrength"), profile.normalStrength);
    gl.uniform1f(gl.getUniformLocation(p, "u_heightParallax"), profile.heightParallaxScale);
    gl.uniform1f(gl.getUniformLocation(p, "u_isSidewall"), 0.0);

    // Directional room light vector (slightly from top-left, pointing forward-down)
    gl.uniform3f(gl.getUniformLocation(p, "u_lightDir"), 0.28, 0.58, 0.76);

    // Draw 3D Rug Mesh
    gl.drawArrays(gl.TRIANGLES, 0, mesh.length / STRIDE_3D);

    // ==========================================
    // 4. DYNAMIC FRINGE SIMULATION & RENDERING
    // ==========================================
    const hasFringe = isFringedRug(rug.productId);
    this.fringePhysics.hasFringe = hasFringe;

    if (hasFringe) {
      if (this.fringePhysics.strands.length === 0) {
        this.fringePhysics.init(
          rug.widthM,
          rug.lengthM,
          { x: rug.xM, y: rug.zM },
          rug.rot,
          Boolean(fringeTextures.topTex),
          Boolean(fringeTextures.botTex)
        );
      }

      // Step physics simulation
      this.fringePhysics.update(
        currentTime,
        { x: rug.xM, y: rug.zM },
        rug.rot,
        rug.widthM,
        rug.lengthM
      );

      // Generate dynamic ribbon mesh
      const ribbonMesh = this.fringePhysics.generateRibbonMesh((floorM) => {
        return this.projectPointToClip(floorM, 0.0, H, layout, cssW, cssH);
      });

      if (ribbonMesh && this.fringeBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.fringeBuf);
        gl.bufferData(gl.ARRAY_BUFFER, ribbonMesh, gl.DYNAMIC_DRAW);

        // Render fringe ribbons with albedo texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fringeTextures.botTex || fringeTextures.topTex || albedoTex);
        gl.uniform1i(gl.getUniformLocation(p, "u_tex"), 0);

        // Fringe ribbons have 4-stride attributes (x, y, u, v)
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
        gl.disableVertexAttribArray(aNorm);
        gl.disableVertexAttribArray(aElev);
        gl.disableVertexAttribArray(aMacro);

        gl.uniform1f(gl.getUniformLocation(p, "u_isSidewall"), 0.0);
        gl.uniform1f(gl.getUniformLocation(p, "u_roughness"), 0.92);
        gl.uniform1f(gl.getUniformLocation(p, "u_sheenIntensity"), 0.05);

        gl.drawArrays(gl.TRIANGLES, 0, ribbonMesh.length / 4);
      }
    }
  }
}

