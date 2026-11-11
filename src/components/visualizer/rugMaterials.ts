/**
 * VIZDECK RoomIQ — PBR Material Profiles & Shading Parameters
 * Senior Real-Time Graphics Engineer
 *
 * Defines physically accurate material responses for authentic Persian & Oriental rugs:
 * - WOOL: High roughness, soft micro-relief, subtle pile height, Oren-Nayar diffuse
 * - SILK: Directional anisotropic sheen, lower roughness, fine micro-fibers
 * - WOOL_AND_SILK: Blended profile (e.g. Fine Persian & Oriental Blend)
 * - COTTON: Flat matte weave, low pile relief
 */

export type RugMaterialType = "wool" | "silk" | "wool_silk" | "cotton" | "synthetic";

export interface RugMaterialProfile {
  id: RugMaterialType;
  name: string;
  description: string;
  
  // Physical Geometry (in metres)
  pileHeightM: number;       // Typical 0.008 to 0.012 m (8 to 12 mm)
  bevelWidthM: number;       // Bevel chamfer width (2 to 3 mm)
  sidewallThicknessM: number;// Total foundation + pile edge thickness
  
  // PBR Shading Parameters
  roughness: number;         // Microfacet roughness [0.0..1.0]
  specularStrength: number;  // Microfacet specular reflection intensity
  sheenIntensity: number;    // Anisotropic fiber sheen intensity (high for silk)
  sheenRoughness: number;    // Anisotropic highlight tightness
  pileCompressionUnderFurniture: number; // Factor reducing pile height under furniture
  
  // Normal and Height Mapping
  normalStrength: number;    // Perturbation of tangent-space normals
  heightParallaxScale: number;// Parallax mapping displacement scale
  macroTextureScale: number; // UV tiling frequency of the micro-fiber weave maps
  
  // Texture Map Assets
  normalMapUrl: string;
  heightMapUrl: string;
  roughnessMapUrl: string;
}

export const MATERIAL_PROFILES: Record<RugMaterialType, RugMaterialProfile> = {
  wool: {
    id: "wool",
    name: "Pure Hand-Spun Wool",
    description: "Plush, high-roughness matte surface with soft fiber depth and natural pile relief.",
    pileHeightM: 0.010, // 10 mm
    bevelWidthM: 0.0025, // 2.5 mm
    sidewallThicknessM: 0.011, // 11 mm
    roughness: 0.88,
    specularStrength: 0.16,
    sheenIntensity: 0.06,
    sheenRoughness: 0.65,
    pileCompressionUnderFurniture: 0.40,
    normalStrength: 1.8,
    heightParallaxScale: 0.012,
    macroTextureScale: 24.0,
    normalMapUrl: "/images/materials/wool_normal.png",
    heightMapUrl: "/images/materials/wool_height.png",
    roughnessMapUrl: "/images/materials/wool_roughness.png",
  },
  
  silk: {
    id: "silk",
    name: "Masterpiece Pure Silk",
    description: "Lustrous, dense low pile with distinctive anisotropic directional sheen.",
    pileHeightM: 0.0065, // 6.5 mm
    bevelWidthM: 0.0018, // 1.8 mm
    sidewallThicknessM: 0.0075, // 7.5 mm
    roughness: 0.38,
    specularStrength: 0.62,
    sheenIntensity: 0.85,
    sheenRoughness: 0.28,
    pileCompressionUnderFurniture: 0.60,
    normalStrength: 1.4,
    heightParallaxScale: 0.008,
    macroTextureScale: 32.0,
    normalMapUrl: "/images/materials/silk_normal.png",
    heightMapUrl: "/images/materials/silk_height.png",
    roughnessMapUrl: "/images/materials/silk_roughness.png",
  },
  
  wool_silk: {
    id: "wool_silk",
    name: "Hand-Spun Wool & Silk Blend",
    description: "Balanced Persian & Oriental blend: plush wool pile foundation with shimmering silk highlights.",
    pileHeightM: 0.009, // 9 mm
    bevelWidthM: 0.0022, // 2.2 mm
    sidewallThicknessM: 0.010, // 10 mm
    roughness: 0.64,
    specularStrength: 0.42,
    sheenIntensity: 0.48,
    sheenRoughness: 0.36,
    pileCompressionUnderFurniture: 0.45,
    normalStrength: 1.6,
    heightParallaxScale: 0.010,
    macroTextureScale: 28.0,
    normalMapUrl: "/images/materials/wool_normal.png",
    heightMapUrl: "/images/materials/wool_height.png",
    roughnessMapUrl: "/images/materials/wool_roughness.png",
  },
  
  cotton: {
    id: "cotton",
    name: "Natural Flatweave Cotton",
    description: "Flat matte woven structure with low pile relief and uniform diffuse scattering.",
    pileHeightM: 0.005, // 5 mm
    bevelWidthM: 0.0015, // 1.5 mm
    sidewallThicknessM: 0.006, // 6 mm
    roughness: 0.94,
    specularStrength: 0.10,
    sheenIntensity: 0.0,
    sheenRoughness: 0.80,
    pileCompressionUnderFurniture: 0.70,
    normalStrength: 1.2,
    heightParallaxScale: 0.006,
    macroTextureScale: 20.0,
    normalMapUrl: "/images/materials/wool_normal.png",
    heightMapUrl: "/images/materials/wool_height.png",
    roughnessMapUrl: "/images/materials/wool_roughness.png",
  },
  
  synthetic: {
    id: "synthetic",
    name: "Polypropylene Blend",
    description: "Standard machine-tufted synthetic fiber profile.",
    pileHeightM: 0.008,
    bevelWidthM: 0.002,
    sidewallThicknessM: 0.009,
    roughness: 0.72,
    specularStrength: 0.28,
    sheenIntensity: 0.15,
    sheenRoughness: 0.50,
    pileCompressionUnderFurniture: 0.50,
    normalStrength: 1.5,
    heightParallaxScale: 0.008,
    macroTextureScale: 22.0,
    normalMapUrl: "/images/materials/wool_normal.png",
    heightMapUrl: "/images/materials/wool_height.png",
    roughnessMapUrl: "/images/materials/wool_roughness.png",
  }
};

const FRINGED_RUG_IDS = new Set([
  "rug-navy-medallion-oriental",
  "rug-embroidered-cranes-blossoms",
  "rug-ornate-emerald-persian",
  "rug-ornate-pastel-ottoman-floral",
  "rug-persian-ruby-navy-medallion",
  "rug-afghan-blue-medallion",
  "rug-moroccan-berber-diamond",
  "rug-geometric-rust-blue-diamond",
  "rug-colorful-oriental-patchwork",
]);

/**
 * Returns whether the given processed catalog rug includes extracted top/bottom fringe textures.
 */
export function isFringedRug(productId: string): boolean {
  return FRINGED_RUG_IDS.has(productId);
}

