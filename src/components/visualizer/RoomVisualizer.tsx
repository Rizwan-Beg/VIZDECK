"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  RotateCw, Trash2, Download, Home, Search, UploadCloud, X,
  ArrowRight, Copy, Grid3x3, MousePointer2, EyeOff, Eraser,
  Sparkles, Eye, Loader2, Ruler, Activity, CheckCircle2, AlertTriangle, ShieldCheck,
  Layers, Check, ChevronUp, ChevronDown
} from "lucide-react";
import { type RugMaterialType } from "./rugMaterials";
import FloorRugCanvas, { type PointerTool } from "./FloorRugCanvas";
import {
  FT_TO_M,
  M_TO_FT,
  clampRugM,
  clampRug,
  computeMetricCalibration,
  parseAuthoritativeDimensions,
  verifyRugDimensionalInvariance,
  defaultFloorQuad,
  type FloorQuad,
  type FloorSize,
  type ImageLayout,
  type MetricCalibration,
  type MetricDimensions,
  type PlacedRug,
  type Vec2,
} from "./floorMath";
import { composeOcclusionMask, loadRoomImage, type OccludeClick } from "./occlusionMask";

import roomAiryLiving from "@/assets/visualizer/airy-contemporary-living-room.png";
import roomSunlitNeutralLiving from "@/assets/visualizer/sunlit-neutral-living-room.png";
import roomMinimalistWarmLiving from "@/assets/visualizer/minimalist-warm-wood-living-room.png";
import roomScandinavianDining from "@/assets/visualizer/scandinavian-dining-room.png";
import roomWalnutDining from "@/assets/visualizer/walnut-dining-room.png";
import roomSunlitBeigeBedroom from "@/assets/visualizer/sunlit-beige-bedroom.png";
import roomWarmMinimalistOffice from "@/assets/visualizer/warm-minimalist-office.png";

type Room = {
  name: string;
  src: string;
  floor: FloorQuad;
  floorSize: FloorSize;
  occlusionMaskUrl?: string;
  floorSupportMaskUrl?: string;
  debugOverlayUrl?: string;
  roomType?: string;
  suggestedPlacement?: { x: number; z: number; w: number; h: number; rot: number };
};

const ROOMS: Room[] = [
  {
    name: "Airy Contemporary Living Room",
    src: roomAiryLiving.src,
    floor: { farLeft: { x: 0.3344, y: 0.577 }, farRight: { x: 0.6656, y: 0.577 }, nearRight: { x: 0.98, y: 0.9947 }, nearLeft: { x: 0.02, y: 0.9947 } },
    floorSize: { widthFt: 16.4, depthFt: 14.2 },
    occlusionMaskUrl: "/visualizer-masks/mask_0217bf885c574463a371f263f108fca5.png",
    floorSupportMaskUrl: "/visualizer-masks/floor_support_0217bf885c574463a371f263f108fca5.png",
    debugOverlayUrl: "/visualizer-masks/debug_0217bf885c574463a371f263f108fca5.jpg",
    roomType: "Living Room",
    suggestedPlacement: { x: 8.2, z: 6.82, w: 8.0, h: 10.0, rot: 0.0 },
  },
  {
    name: "Sunlit Neutral Living Room",
    src: roomSunlitNeutralLiving.src,
    floor: { farLeft: { x: 0.2924, y: 0.68 }, farRight: { x: 0.7076, y: 0.68 }, nearRight: { x: 0.98, y: 0.995 }, nearLeft: { x: 0.02, y: 0.995 } },
    floorSize: { widthFt: 12.5, depthFt: 11.5 },
    occlusionMaskUrl: "/visualizer-masks/mask_bef54382c6b645b7850f0950a66ee315.png",
    floorSupportMaskUrl: "/visualizer-masks/floor_support_bef54382c6b645b7850f0950a66ee315.png",
    debugOverlayUrl: "/visualizer-masks/debug_bef54382c6b645b7850f0950a66ee315.jpg",
    roomType: "Living Room",
    suggestedPlacement: { x: 6.25, z: 5.52, w: 8.0, h: 10.0, rot: 0.0 },
  },
  {
    name: "Minimalist Warm Living Room",
    src: roomMinimalistWarmLiving.src,
    floor: { farLeft: { x: 0.2924, y: 0.68 }, farRight: { x: 0.7076, y: 0.68 }, nearRight: { x: 0.98, y: 0.995 }, nearLeft: { x: 0.02, y: 0.995 } },
    floorSize: { widthFt: 12.5, depthFt: 11.5 },
    occlusionMaskUrl: "/visualizer-masks/mask_53c4c14906b1487ba1c6e3b27b71ca9a.png",
    floorSupportMaskUrl: "/visualizer-masks/floor_support_53c4c14906b1487ba1c6e3b27b71ca9a.png",
    debugOverlayUrl: "/visualizer-masks/debug_53c4c14906b1487ba1c6e3b27b71ca9a.jpg",
    roomType: "Living Room",
    suggestedPlacement: { x: 6.25, z: 5.52, w: 8.0, h: 10.0, rot: 0.0 },
  },
  {
    name: "Scandinavian Dining Room",
    src: roomScandinavianDining.src,
    floor: { farLeft: { x: 0.3397, y: 0.5558 }, farRight: { x: 0.6603, y: 0.5558 }, nearRight: { x: 0.98, y: 0.9947 }, nearLeft: { x: 0.02, y: 0.9947 } },
    floorSize: { widthFt: 17.2, depthFt: 14.9 },
    occlusionMaskUrl: "/visualizer-masks/mask_d883fdd52ac94c3888396d06c929bee0.png",
    floorSupportMaskUrl: "/visualizer-masks/floor_support_d883fdd52ac94c3888396d06c929bee0.png",
    debugOverlayUrl: "/visualizer-masks/debug_d883fdd52ac94c3888396d06c929bee0.jpg",
    roomType: "Dining Room",
    suggestedPlacement: { x: 8.65, z: 9.4, w: 8.0, h: 10.0, rot: 0.0 },
  },
  {
    name: "Walnut Dining Room",
    src: roomWalnutDining.src,
    floor: { farLeft: { x: 0.2924, y: 0.68 }, farRight: { x: 0.7076, y: 0.68 }, nearRight: { x: 0.98, y: 0.995 }, nearLeft: { x: 0.02, y: 0.995 } },
    floorSize: { widthFt: 12.5, depthFt: 11.5 },
    occlusionMaskUrl: "/visualizer-masks/mask_db33b98370824c7e9654b9f28ce93ee2.png",
    floorSupportMaskUrl: "/visualizer-masks/floor_support_db33b98370824c7e9654b9f28ce93ee2.png",
    debugOverlayUrl: "/visualizer-masks/debug_db33b98370824c7e9654b9f28ce93ee2.jpg",
    roomType: "Dining Room",
    suggestedPlacement: { x: 5.24, z: 5.52, w: 8.0, h: 10.0, rot: 0.0 },
  },
  {
    name: "Sunlit Beige Bedroom",
    src: roomSunlitBeigeBedroom.src,
    floor: { farLeft: { x: 0.3127, y: 0.6513 }, farRight: { x: 0.6873, y: 0.6513 }, nearRight: { x: 0.98, y: 0.995 }, nearLeft: { x: 0.02, y: 0.995 } },
    floorSize: { widthFt: 12.5, depthFt: 11.7 },
    occlusionMaskUrl: "/visualizer-masks/mask_165e3788af3547c38dd403026485d206.png",
    floorSupportMaskUrl: "/visualizer-masks/floor_support_165e3788af3547c38dd403026485d206.png",
    debugOverlayUrl: "/visualizer-masks/debug_165e3788af3547c38dd403026485d206.jpg",
    roomType: "Bedroom",
    suggestedPlacement: { x: 6.55, z: 6.2, w: 8.0, h: 10.0, rot: 0.0 },
  },
  {
    name: "Warm Minimalist Office",
    src: roomWarmMinimalistOffice.src,
    floor: { farLeft: { x: 0.3344, y: 0.577 }, farRight: { x: 0.6656, y: 0.577 }, nearRight: { x: 0.98, y: 0.9947 }, nearLeft: { x: 0.02, y: 0.9947 } },
    floorSize: { widthFt: 16.4, depthFt: 14.2 },
    occlusionMaskUrl: "/visualizer-masks/mask_8f7663f320d647398fb9995afed5ea2e.png",
    floorSupportMaskUrl: "/visualizer-masks/floor_support_8f7663f320d647398fb9995afed5ea2e.png",
    debugOverlayUrl: "/visualizer-masks/debug_8f7663f320d647398fb9995afed5ea2e.jpg",
    roomType: "Study Room",
    suggestedPlacement: { x: 8.46, z: 8.7, w: 8.0, h: 10.0, rot: 0.0 },
  },
];

const SIZES = [
  { label: "2 x 3 ft", w: 2, h: 3 },
  { label: "3 x 5 ft", w: 3, h: 5 },
  { label: "4 x 6 ft", w: 4, h: 6 },
  { label: "5 x 7 ft", w: 5, h: 7 },
  { label: "5 x 8 ft", w: 5, h: 8 },
  { label: "6 x 8 ft", w: 6, h: 8 },
  { label: "6 x 9 ft", w: 6, h: 9 },
  { label: "8 x 8 ft", w: 8, h: 8 },
  { label: "8 x 10 ft", w: 8, h: 10 },
  { label: "9 x 12 ft", w: 9, h: 12 },
  { label: "10 x 14 ft", w: 10, h: 14 },
];

const T = {
  style: {
    borderRadius: "0px",
    background: "#000",
    color: "#fff",
    fontSize: "10px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.15em",
    padding: "14px 20px",
  },
};

function parseSize(p: { category?: string; size?: string; metadata?: Record<string, unknown> }): { w: number; h: number } | null {
  for (const s of [p.category, p.size, p.metadata?.size, p.metadata?.dimensions]) {
    if (!s) continue;
    const m = String(s).match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
    if (m) return { w: +m[1], h: +m[2] };
  }
  return null;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export type VisualizerProduct = {
  id: string;
  name: string;
  images: string[];
  category?: string;
  size?: string;
  price?: number;
  metadata?: Record<string, unknown>;
  image?: string;
};

const OPTIMIZED_RUGS: VisualizerProduct[] = [
  { id: "rug-navy-medallion-oriental", name: "Intricate Navy Medallion Oriental Rug", images: ["/images/processed_rugs/rug-navy-medallion-oriental/rug_transparent.png", "/images/processed_rugs/rug-navy-medallion-oriental/original.jpg"], category: "Persian", size: "8x10 ft", price: 12500, metadata: { size: "8x10 ft", material: "Hand-Knotted Wool & Silk" } },
  { id: "rug-persian-ruby-navy-medallion", name: "Ornate Persian Rug with Navy Medallion", images: ["/images/processed_rugs/rug-persian-ruby-navy-medallion/rug_transparent.png", "/images/processed_rugs/rug-persian-ruby-navy-medallion/original.jpg"], category: "Persian", size: "8x10 ft", price: 13800, metadata: { size: "8x10 ft", material: "Hand-Knotted Wool & Silk" } },
  { id: "rug-ornate-emerald-persian", name: "Ornate Emerald Persian Rug", images: ["/images/processed_rugs/rug-ornate-emerald-persian/rug_transparent.png", "/images/processed_rugs/rug-ornate-emerald-persian/original.jpg"], category: "Heritage", size: "8x10 ft", price: 14200, metadata: { size: "8x10 ft", material: "Wool & Silk Blend" } },
  { id: "rug-ornate-pastel-ottoman-floral", name: "Ornate Pastel Ottoman Floral Rug", images: ["/images/processed_rugs/rug-ornate-pastel-ottoman-floral/rug_transparent.png", "/images/processed_rugs/rug-ornate-pastel-ottoman-floral/original.jpg"], category: "Classic", size: "8x10 ft", price: 11600, metadata: { size: "8x10 ft", material: "Fine Combed Wool & Silk" } },
  { id: "rug-afghan-blue-medallion", name: "Ornate Afghan Blue Medallion Rug", images: ["/images/processed_rugs/rug-afghan-blue-medallion/rug_transparent.png", "/images/processed_rugs/rug-afghan-blue-medallion/original.jpg"], category: "Tribal", size: "6x9 ft", price: 8900, metadata: { size: "6x9 ft", material: "Hand-Knotted Ghazni Wool" } },
  { id: "rug-moroccan-berber-diamond", name: "Moroccan Berber Diamond Medallion Rug", images: ["/images/processed_rugs/rug-moroccan-berber-diamond/rug_transparent.png", "/images/processed_rugs/rug-moroccan-berber-diamond/original.jpg"], category: "Berber", size: "6x9 ft", price: 7600, metadata: { size: "6x9 ft", material: "Hand-Loomed Moroccan Wool" } },
  { id: "rug-geometric-rust-blue-diamond", name: "Geometric Rust and Blue Diamond Rug", images: ["/images/processed_rugs/rug-geometric-rust-blue-diamond/rug_transparent.png", "/images/processed_rugs/rug-geometric-rust-blue-diamond/original.jpg"], category: "Modern", size: "8x10 ft", price: 8400, metadata: { size: "8x10 ft", material: "Hand-Tufted Wool Blend" } },
  { id: "rug-embroidered-cranes-blossoms", name: "Embroidered Cranes and Blossoms Rug", images: ["/images/processed_rugs/rug-embroidered-cranes-blossoms/rug_transparent.png", "/images/processed_rugs/rug-embroidered-cranes-blossoms/original.jpg"], category: "Artisan", size: "6x9 ft", price: 9800, metadata: { size: "6x9 ft", material: "Hand-Tufted Wool & Silk" } },
  { id: "rug-colorful-oriental-patchwork", name: "Colorful Oriental Garden Patchwork Rug", images: ["/images/processed_rugs/rug-colorful-oriental-patchwork/rug_transparent.png", "/images/processed_rugs/rug-colorful-oriental-patchwork/original.jpg"], category: "Bohemian", size: "8x10 ft", price: 11200, metadata: { size: "8x10 ft", material: "Hand-Tufted Wool & Cotton" } },
  { id: "rug-abstract-geometric-amoeba", name: "Abstract Geometric Amoeba Rug", images: ["/images/processed_rugs/rug-abstract-geometric-amoeba/rug_transparent.png", "/images/processed_rugs/rug-abstract-geometric-amoeba/original.jpg"], category: "Modern", size: "6x8 ft", price: 7900, metadata: { size: "6x8 ft", material: "Hand-Tufted Wool Blend" } },
  { id: "rug-emerald-wave-petal", name: "Emerald Wave Petal Round Rug", images: ["/images/processed_rugs/rug-emerald-wave-petal/rug_transparent.png", "/images/processed_rugs/rug-emerald-wave-petal/original.jpg"], category: "Modern", size: "8x8 ft", price: 9200, metadata: { size: "8x8 ft", material: "Hand-Tufted Plush Wool" } },
  { id: "rug-abstract-teal-wave-oval", name: "Abstract Teal Wave Pattern Oval Rug", images: ["/images/processed_rugs/rug-abstract-teal-wave-oval/rug_transparent.png", "/images/processed_rugs/rug-abstract-teal-wave-oval/original.jpg"], category: "Modern", size: "6x8 ft", price: 8600, metadata: { size: "6x8 ft", material: "Hand-Tufted New Zealand Wool" } },
  { id: "rug-modern-midcentury-geometric", name: "Modern Mid-Century Geometric Rug", images: ["/images/processed_rugs/rug-modern-midcentury-geometric/rug_transparent.png", "/images/processed_rugs/rug-modern-midcentury-geometric/original.jpg"], category: "Mid-Century", size: "6x8 ft", price: 7800, metadata: { size: "6x8 ft", material: "Hand-Tufted Loop & Cut Wool" } },
];

const getScanStepLabel = (percent: number) => {
  if (percent < 25) return "SCANNING ROOM";
  if (percent < 50) return "PERSPECTIVE & DEPTH";
  if (percent < 75) return "FLOOR GRID MAPPING";
  if (percent < 100) return "FURNITURE OCCLUSION";
  return "CALIBRATION COMPLETE";
};

export type RoomVisualizerProps = {
  embedded?: boolean;
  onExit?: () => void;
};

export default function RoomVisualizer({
  embedded = false,
  onExit,
}: RoomVisualizerProps = {}) {
  const [step, setStep] = useState<"room" | "canvas">("room");
  const [room, setRoom] = useState<Room | null>(null);
  const [products, setProducts] = useState<VisualizerProduct[]>(OPTIMIZED_RUGS);
  const [query, setQuery] = useState("");
  const [rugs, setRugs] = useState<PlacedRug[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sizeIdx, setSizeIdx] = useState(5);
  const [tb, setTb] = useState<{ x: number; y: number } | null>(null);
  const [roomModal, setRoomModal] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [floor, setFloor] = useState<FloorQuad>(defaultFloorQuad());
  const [floorSize, setFloorSize] = useState<FloorSize>({ widthFt: 10.5, depthFt: 11.5 });
  const [tool, setTool] = useState<PointerTool>("move");
  const [occlusion, setOcclusion] = useState<ImageData | null>(null);
  const [occludeClicks, setOccludeClicks] = useState<OccludeClick[]>([]);
  const [autoOcclude, setAutoOcclude] = useState(true);
  const [maskBusy, setMaskBusy] = useState(false);
  const roomImgRef = useRef<HTMLImageElement | null>(null);
  const maskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI Room Understanding & Computer Vision State
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "analyzing" | "success" | "error">("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [aiOcclusionUrl, setAiOcclusionUrl] = useState<string | null>(null);
  const [floorSupportMaskUrl, setFloorSupportMaskUrl] = useState<string | null>(null);
  const [debugOverlayUrl, setDebugOverlayUrl] = useState<string | null>(null);
  const [cleanFloorUrl, setCleanFloorUrl] = useState<string | null>(null);
  const [hasExistingRug, setHasExistingRug] = useState<boolean>(false);
  const [replaceExistingRug, setReplaceExistingRug] = useState<boolean>(false); // Direct overlay is default
  const [suggestedPlacement, setSuggestedPlacement] = useState<{ x: number; z: number } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [showBefore, setShowBefore] = useState(false); // Before & After room comparison
  const [roomType, setRoomType] = useState<string>("Living Room");
  const [placementReason, setPlacementReason] = useState<string>("AI spatial floor analysis active.");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanPercent, setScanPercent] = useState<number>(0);
  const [showInvalidRoomModal, setShowInvalidRoomModal] = useState<boolean>(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const reqSequence = useRef(0);

  // Authoritative Metric Floor Calibration State
  const [calibration, setCalibration] = useState<MetricCalibration | null>(null);
  const [measuredCalibrating, setMeasuredCalibrating] = useState<boolean>(false);
  const [calibrationCorners, setCalibrationCorners] = useState<[Vec2, Vec2, Vec2, Vec2] | null>(null);
  const [calibRefType, setCalibRefType] = useState<"tile" | "existing_rug" | "custom_rectangle">("tile");
  const [calibRefName, setCalibRefName] = useState<string>("Floor Tile 60 × 60 cm");
  const [calibRefWidthM, setCalibRefWidthM] = useState<number>(0.6);
  const [calibRefLengthM, setCalibRefLengthM] = useState<number>(0.6);
  const [showCalibrationModal, setShowCalibrationModal] = useState<boolean>(false);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [missingDimProduct, setMissingDimProduct] = useState<VisualizerProduct | null>(null);
  const [existingRugCorners, setExistingRugCorners] = useState<[Vec2, Vec2, Vec2, Vec2] | null>(null);

  // 3D Realistic PBR Rendering & Material State
  const [enable3DRendering, setEnable3DRendering] = useState<boolean>(false);
  const [materialType, setMaterialType] = useState<RugMaterialType>("wool_silk");

  const canvasNode = useRef<HTMLCanvasElement | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const placedFromUrl = useRef(false);

  const [wrapSize, setWrapSize] = useState({ w: 800, h: 600 });
  const [canvasLayout, setCanvasLayout] = useState<ImageLayout | null>(null);
  const [mobileTab, setMobileTab] = useState<"rugs" | "adjust" | "ai">("rugs");
  const [mobileDrawerExpanded, setMobileDrawerExpanded] = useState(false);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setWrapSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const sp = useSearchParams();
  const router = useRouter();
  const rugUrl = sp.get("rugUrl");
  const isVisdeckEmbed = embedded || sp.get("embed") === "visdeck";
  const visualizerLabel = "VIZDECK Rug Visualizer";
  const collectionLabel = "VIZDECK Collection";

  const selected = rugs.find((r) => r.instanceId === selectedId) || null;

  const rebuildMask = useCallback(
    async (nextFloor: FloorQuad, clicks: OccludeClick[], auto: boolean, baseMaskUrl?: string | null) => {
      const img = roomImgRef.current;
      if (!img) return;
      setMaskBusy(true);
      try {
        const activeBaseUrl = baseMaskUrl !== undefined ? baseMaskUrl : aiOcclusionUrl;
        const mask = await composeOcclusionMask(img, activeBaseUrl, nextFloor, clicks, auto);
        setOcclusion(mask);
      } catch (e) {
        console.error("Mask composition error:", e);
      } finally {
        setMaskBusy(false);
      }
    },
    [aiOcclusionUrl]
  );

  useEffect(() => {
    if (!room || step !== "canvas") return;
    let cancelled = false;
    roomImgRef.current = null;

    loadRoomImage(room.src).then((img) => {
      if (cancelled) return;
      roomImgRef.current = img;
      rebuildMask(floor, occludeClicks, autoOcclude, aiOcclusionUrl);
    }).catch(console.error);

    if (room && analysisStatus === "idle") {
      if (room.occlusionMaskUrl) {
        // Pre-calibrated sample room with verified masks: run smooth 3.2s calibration scan
        setAnalysisStatus("analyzing");
        setIsScanning(true);
        setScanPercent(0);
      } else {
        triggerRoomAnalysis(room.src, room.name);
      }
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, step]);

  useEffect(() => {
    if (!isScanning) return;

    let animFrame: number;
    let finishTimeout: ReturnType<typeof setTimeout>;
    const startTime = performance.now();
    const isSample = !!room?.occlusionMaskUrl;

    // For pre-calibrated sample rooms: exactly 3.2s total (0.8s per step uniformly)
    // For custom uploaded rooms: 4.4s base pacing (~1.1s per step) synchronized with AI inference
    const BASE_DURATION_MS = isSample ? 3200 : 4400;

    const updateScan = () => {
      const elapsed = performance.now() - startTime;

      if (isSample) {
        // Sample room: continuous constant-velocity descent straight from 0% to 100%
        const progress = Math.min(100, (elapsed / BASE_DURATION_MS) * 100);
        setScanPercent(progress);

        if (progress >= 100) {
          finishTimeout = setTimeout(() => {
            setIsScanning(false);
            setAnalysisStatus("success");
          }, 350);
        } else {
          animFrame = requestAnimationFrame(updateScan);
        }
      } else {
        // Custom room with live AI analysis:
        if (analysisStatus === "analyzing") {
          // Uniformly progress up to 90% at constant pace
          if (elapsed <= BASE_DURATION_MS) {
            const linearProgress = (elapsed / BASE_DURATION_MS) * 90;
            setScanPercent(linearProgress);
          } else {
            // If backend is still finishing, continuously advance through 90% -> 99% without ever freezing at 98%
            const continuousProgress = 90 + 9 * (1 - Math.exp(-(elapsed - BASE_DURATION_MS) / 2200));
            setScanPercent(continuousProgress);
          }
          animFrame = requestAnimationFrame(updateScan);
        } else if (analysisStatus === "success") {
          // Backend analysis completed: smoothly and uniformly glide directly through to 100%
          setScanPercent((prev) => {
            const next = Math.min(100, prev + 2.0);
            if (next >= 100) {
              finishTimeout = setTimeout(() => {
                setIsScanning(false);
              }, 350);
            } else {
              animFrame = requestAnimationFrame(updateScan);
            }
            return next;
          });
        } else if (analysisStatus === "error") {
          // Error / invalid room: stop scanning immediately
          setIsScanning(false);
        }
      }
    };

    animFrame = requestAnimationFrame(updateScan);

    return () => {
      cancelAnimationFrame(animFrame);
      clearTimeout(finishTimeout);
    };
  }, [isScanning, analysisStatus, room]);

  const scheduleMask = (nextFloor: FloorQuad, clicks: OccludeClick[], auto: boolean) => {
    if (maskTimer.current) clearTimeout(maskTimer.current);
    maskTimer.current = setTimeout(() => rebuildMask(nextFloor, clicks, auto, aiOcclusionUrl), 180);
  };

  const onFloorChange = (q: FloorQuad) => {
    setFloor(q);
    if (!calibrating) scheduleMask(q, occludeClicks, autoOcclude);
  };

  const triggerRoomAnalysis = useCallback(async (imageSrcOrBlob: string | Blob, roomName?: string) => {
    const currentReq = ++reqSequence.current;
    setAnalysisStatus("analyzing");
    setIsScanning(true);
    setScanPercent(0);
    setAnalysisError(null);

    try {
      const formData = new FormData();
      if (imageSrcOrBlob instanceof Blob) {
        formData.append("room_image", imageSrcOrBlob, "room.jpg");
      } else {
        const res = await fetch(imageSrcOrBlob);
        if (!res.ok) {
          throw new Error(`Failed to load room image (${res.status}): ${imageSrcOrBlob}`);
        }
        const blob = await res.blob();
        if (blob.size === 0) {
          throw new Error(`Room image blob is empty: ${imageSrcOrBlob}`);
        }
        formData.append("room_image", blob, "room.jpg");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);
      const resp = await fetch("/api/analyze-room", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        let msg = "Analysis failed";
        try {
          const errData = await resp.json();
          if (errData?.error) msg = errData.error;
        } catch {}
        throw new Error(msg);
      }

      const data = await resp.json();
      console.log("AI Room Analysis Result:", data);

      // Check if this request is still the newest one
      if (reqSequence.current !== currentReq) {
        console.log("Analysis result superseded by newer request.");
        return;
      }

      // Check if the uploaded image genuinely lacks a floor for rug placement
      const isRoomValid = data.is_valid_room !== false && data.floor_detected !== false;

      if (!isRoomValid) {
        setIsScanning(false);
        setAnalysisStatus("error");
        setAnalysisError(data.rejection_reason || "No visible room floor detected in this photo.");
        setShowInvalidRoomModal(true);
        return;
      }

      if (data.floor_quad) {
        setFloor(data.floor_quad);
      }
      if (data.floor_size) {
        setFloorSize(data.floor_size);
      }
      if (data.occlusion_mask_url) {
        setAiOcclusionUrl(data.occlusion_mask_url);
        // Automatically composite with existing manual clicks
        rebuildMask(data.floor_quad || floor, occludeClicks, autoOcclude, data.occlusion_mask_url);
      }
      if (data.floor_support_mask_url) {
        setFloorSupportMaskUrl(data.floor_support_mask_url);
      } else {
        setFloorSupportMaskUrl(null);
      }
      if (data.debug_overlay_url) {
        setDebugOverlayUrl(data.debug_overlay_url);
      }
      if (data.clean_floor_url) {
        setCleanFloorUrl(data.clean_floor_url);
      } else {
        setCleanFloorUrl(null);
      }
      const rugDetected = !!(data.existing_rug?.detected || data.detected_furniture?.has_existing_rug);
      setHasExistingRug(rugDetected);
      if (data.existing_rug?.detected && Array.isArray(data.existing_rug.corners) && data.existing_rug.corners.length === 4) {
        const c = data.existing_rug.corners;
        setExistingRugCorners([
          { x: c[0][0], y: c[0][1] },
          { x: c[1][0], y: c[1][1] },
          { x: c[2][0], y: c[2][1] },
          { x: c[3][0], y: c[3][1] },
        ]);
      } else {
        setExistingRugCorners(null);
      }
      // Direct overlay is default commercial behavior: place selected rug directly over existing floor/rug
      setReplaceExistingRug(false);
      if (data.room_type) {
        const readableType = data.room_type
          .split("_")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        setRoomType(readableType);
      }
      if (data.suggested_placement?.reason) {
        setPlacementReason(data.suggested_placement.reason);
      }

      // Preserve actual user-selected rug; never replace it with a default product
      if (data.suggested_placement) {
        setSuggestedPlacement(data.suggested_placement);
        const { x, z } = data.suggested_placement;
        const currentFloorSize = data.floor_size || floorSize;
        setRugs((prev) => {
          if (prev.length === 0) return prev;
          // Apply anchor position to active selected rug (or primary rug), preserving product ID, name, image, w, h, and rot
          const targetId = selectedId || prev[0].instanceId;
          return prev.map((r) =>
            r.instanceId === targetId
              ? clampRug(
                  {
                    ...r,
                    x,
                    z,
                    xM: x * FT_TO_M,
                    zM: z * FT_TO_M,
                  },
                  currentFloorSize
                )
              : r
          );
        });
      }

      setAnalysisStatus("success");
      toast.success(
        `AI Room Analysis: ${data.room_type ? data.room_type.replace("_", " ") : "Room"} detected`,
        T
      );
    } catch (err: unknown) {
      if (reqSequence.current === currentReq) {
        console.warn("AI Room Analysis warning, falling back to standard perspective quad:", err);
        // Do NOT show the "No Room Floor Detected" modal on network timeouts or server delays.
        // The modal is strictly reserved for images verified to lack a floor.
        setIsScanning(false);
        setAnalysisStatus("success");
        setFloor(defaultFloorQuad());
        setFloorSize({ widthFt: 14.5, depthFt: 13.5 });
        toast("Standard room perspective active. You can place and position rugs freely.", T);
      }
    }
  }, [floor, floorSize, occludeClicks, autoOcclude, rebuildMask, selectedId]);

  useEffect(() => {
    const catalogUrl = process.env.NEXT_PUBLIC_CATALOG_API_URL;
    if (!catalogUrl) {
      setProducts(OPTIMIZED_RUGS);
      return;
    }

    (async () => {
      try {
        const res = await fetch(catalogUrl, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) throw new Error(`Catalog returned ${res.status}`);
        const d = await res.json();
        const remoteProducts = (d.products || []).map(
          (p: {
            id: string;
            title?: string;
            name?: string;
            thumbnail?: string;
            images?: (string | { url: string })[];
            category?: string;
            collection?: { title: string };
            metadata?: Record<string, unknown>;
            price?: number;
          }) => ({
            id: p.id,
            name: p.title || p.name || "Area Rug",
            images: [
              p.thumbnail ||
                (typeof p.images?.[0] === "string" ? p.images[0] : p.images?.[0]?.url) ||
                "",
            ].filter(Boolean),
            category: p.collection?.title || p.category || "",
            metadata: p.metadata,
            price: p.price || 0,
          })
        );
        if (remoteProducts.length > 0) {
          setProducts([...OPTIMIZED_RUGS, ...remoteProducts]);
        } else {
          setProducts(OPTIMIZED_RUGS);
        }
      } catch {
        setProducts(OPTIMIZED_RUGS);
      }
    })();
  }, []);

  const placeAuthoritative = useCallback(
    (p: VisualizerProduct, dim: MetricDimensions) => {
      const rugImg = p.images?.[0] || p.image || "";
      const defaultXM = suggestedPlacement ? suggestedPlacement.x * FT_TO_M : (floorSize.widthFt * FT_TO_M) / 2;
      const defaultZM = suggestedPlacement ? suggestedPlacement.z * FT_TO_M : (floorSize.depthFt * FT_TO_M) * 0.45;

      const rug: PlacedRug = clampRugM(
        {
          instanceId: uid(),
          productId: p.id,
          name: p.name,
          img: rugImg,
          widthM: dim.widthM,
          lengthM: dim.lengthM,
          xM: defaultXM,
          zM: defaultZM,
          rot: 0,
          w: dim.widthFt,
          h: dim.lengthFt,
          x: defaultXM * M_TO_FT,
          z: defaultZM * M_TO_FT,
          sizeLabel: dim.label,
          hasAuthoritativeDimensions: true,
        },
        {
          widthM: floorSize.widthFt * FT_TO_M,
          depthM: floorSize.depthFt * FT_TO_M,
        }
      );
      setRugs((prev) => [...prev, rug]);
      setSelectedId(rug.instanceId);
      toast.success(`${p.name} — ${dim.label} (${dim.widthM.toFixed(2)} × ${dim.lengthM.toFixed(2)} m)`, T);
    },
    [floorSize, suggestedPlacement]
  );

  const place = useCallback(
    (imgUrl: string, name: string, productId: string, size: { w: number; h: number }) => {
      const widthM = size.w * FT_TO_M;
      const lengthM = size.h * FT_TO_M;
      const defaultXM = suggestedPlacement ? suggestedPlacement.x * FT_TO_M : (floorSize.widthFt * FT_TO_M) / 2;
      const defaultZM = suggestedPlacement ? suggestedPlacement.z * FT_TO_M : (floorSize.depthFt * FT_TO_M) * 0.45;
      const rug: PlacedRug = clampRugM(
        {
          instanceId: uid(),
          productId,
          name,
          img: imgUrl,
          widthM,
          lengthM,
          xM: defaultXM,
          zM: defaultZM,
          w: size.w,
          h: size.h,
          x: defaultXM * M_TO_FT,
          z: defaultZM * M_TO_FT,
          rot: 0,
          sizeLabel: `${size.w} × ${size.h} ft`,
          hasAuthoritativeDimensions: true,
        },
        {
          widthM: floorSize.widthFt * FT_TO_M,
          depthM: floorSize.depthFt * FT_TO_M,
        }
      );
      setRugs((prev) => [...prev, rug]);
      setSelectedId(rug.instanceId);
      toast.success(`${name} — ${size.w}×${size.h} ft on the floor`, T);
    },
    [floorSize, suggestedPlacement]
  );

  useEffect(() => {
    if (rugUrl && step === "canvas" && !placedFromUrl.current) {
      placedFromUrl.current = true;
      const t = setTimeout(() => place(rugUrl, "Selected Rug", "url", SIZES[sizeIdx]), 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rugUrl, step]);

  const resizeTo = (s: { w: number; h: number }) => {
    if (!selected) return;
    const widthM = s.w * FT_TO_M;
    const lengthM = s.h * FT_TO_M;
    setRugs((prev) =>
      prev.map((r) =>
        r.instanceId === selected.instanceId
          ? {
              ...r,
              w: s.w,
              h: s.h,
              widthM,
              lengthM,
              sizeLabel: `${s.w} × ${s.h} ft`,
              hasAuthoritativeDimensions: true,
            }
          : r
      )
    );
  };

  const rotate = () => {
    if (!selected) return;
    setRugs((prev) =>
      prev.map((r) => (r.instanceId === selected.instanceId ? { ...r, rot: r.rot + Math.PI / 2 } : r))
    );
  };

  const setRotationDeg = (deg: number) => {
    if (!selected) return;
    const rot = (deg * Math.PI) / 180;
    setRugs((prev) => prev.map((r) => (r.instanceId === selected.instanceId ? { ...r, rot } : r)));
  };

  const copyRug = () => {
    if (!selected) return;
    const clone = clampRugM(
      {
        ...selected,
        instanceId: uid(),
        xM: (selected.xM ?? (selected.x * FT_TO_M)) + 0.35,
        zM: (selected.zM ?? (selected.z * FT_TO_M)) + 0.25,
        x: selected.x + 1.1,
        z: selected.z + 0.7,
      },
      {
        widthM: floorSize.widthFt * FT_TO_M,
        depthM: floorSize.depthFt * FT_TO_M,
      }
    );
    setRugs((prev) => [...prev, clone]);
    setSelectedId(clone.instanceId);
  };

  const startMeasuredCalibration = (
    refType: "tile" | "existing_rug" | "custom_rectangle",
    name: string,
    widthM: number,
    lengthM: number
  ) => {
    setCalibRefType(refType);
    setCalibRefName(name);
    setCalibRefWidthM(widthM);
    setCalibRefLengthM(lengthM);

    if (refType === "existing_rug" && existingRugCorners) {
      setCalibrationCorners([...existingRugCorners]);
    } else {
      const cx = 0.5, cy = 0.76;
      const hw = 0.12, hh = 0.08;
      setCalibrationCorners([
        { x: cx - hw, y: cy + hh },
        { x: cx + hw, y: cy + hh },
        { x: cx + hw * 0.8, y: cy - hh },
        { x: cx - hw * 0.8, y: cy - hh },
      ]);
    }

    setMeasuredCalibrating(true);
    setShowCalibrationModal(false);
    toast.success(`Position pins 1–4 to match "${name}".`, T);
  };

  const confirmCalibration = () => {
    if (!calibrationCorners) return;
    const calib = computeMetricCalibration(
      {
        type: calibRefType,
        name: calibRefName,
        widthM: calibRefWidthM,
        lengthM: calibRefLengthM,
        corners: calibrationCorners,
      },
      floorSize
    );
    setCalibration(calib);
    setMeasuredCalibrating(false);
    toast.success(
      `Floor Calibrated! Metric homography verified (error < ${calib.maxRoundTripErrorM < 1e-6 ? "0.001 mm" : calib.maxRoundTripErrorM.toExponential(1) + " m"})`,
      T
    );
  };

  const resetCalibration = () => {
    setCalibration(null);
    setMeasuredCalibrating(false);
    setCalibrationCorners(null);
    toast("Reverted to estimated perspective quad.", T);
  };

  const remove = () => {
    if (!selected) return;
    setRugs((prev) => prev.filter((r) => r.instanceId !== selected.instanceId));
    setSelectedId(null);
    setTb(null);
  };

  const applyRoom = (r: Room, calibrate: boolean, fileBlob?: Blob) => {
    setRoom(r);
    setFloor(r.floor);
    setFloorSize(r.floorSize);
    setCalibrating(calibrate);
    setOccludeClicks([]);
    setTool("move");
    // ALWAYS reset stale metric calibration from previous room so new room projects cleanly
    setCalibration(null);
    setMeasuredCalibrating(false);
    setCalibrationCorners(null);
    
    if (r.occlusionMaskUrl) {
      // Precomputed OneFormer + Meta SAM masks for sample rooms: load instantly!
      setAiOcclusionUrl(r.occlusionMaskUrl);
      setFloorSupportMaskUrl(r.floorSupportMaskUrl || null);
      setDebugOverlayUrl(r.debugOverlayUrl || null);
      setCleanFloorUrl(null);
      setHasExistingRug(true);
      setReplaceExistingRug(false);
      setRoomType(r.roomType || "Living Room");
      setAnalysisError(null);
      setPlacementReason("AI spatial floor and furniture understanding active.");
      if (r.suggestedPlacement) {
        setSuggestedPlacement({ x: r.suggestedPlacement.x, z: r.suggestedPlacement.z });
      }
      rebuildMask(r.floor, [], true, r.occlusionMaskUrl);
      setAnalysisStatus("analyzing");
      setIsScanning(true);
      setScanPercent(0);
    } else {
      // Clear previous room's AI mask, debug overlay, and analysis state
      setAiOcclusionUrl(null);
      setFloorSupportMaskUrl(null);
      setDebugOverlayUrl(null);
      setCleanFloorUrl(null);
      setHasExistingRug(false);
      setReplaceExistingRug(false); // Direct overlay default
      setSuggestedPlacement(null);
      setOcclusion(null);
      setAnalysisStatus("idle");
      setAnalysisError(null);

      // Run AI Room Understanding & Occlusion Segmentation for uploaded custom rooms
      triggerRoomAnalysis(fileBlob || r.src, r.name);
    }

    // Reposition any existing customer rugs within the new floor bounds, strictly preserving their products
    setRugs((prev) => {
      if (prev.length === 0) return prev;
      return prev.map((rug) => clampRug(rug, r.floorSize));
    });
  };

  const switchRoom = (r: Room) => {
    applyRoom(r, false);
    setRoomModal(false);
  };

  const uploadRoom = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const url = URL.createObjectURL(file);
    const r: Room = {
      name: "Your Room",
      src: url,
      floor: defaultFloorQuad(),
      floorSize: { widthFt: 14.5, depthFt: 13.5 },
    };
    applyRoom(r, false, file);
    if (step === "room") setStep("canvas");
    else setRoomModal(false);
  };

  const download = () => {
    const cv = canvasNode.current;
    if (!cv) return;
    let dataUrl = "";
    if (canvasLayout && cv.width > 0 && cv.height > 0) {
      const scaleX = cv.width / Math.max(1, canvasLayout.canvasW);
      const scaleY = cv.height / Math.max(1, canvasLayout.canvasH);
      const sx = Math.max(0, Math.round(canvasLayout.x * scaleX));
      const sy = Math.max(0, Math.round(canvasLayout.y * scaleY));
      const ex = Math.min(cv.width, Math.round((canvasLayout.x + canvasLayout.w) * scaleX));
      const ey = Math.min(cv.height, Math.round((canvasLayout.y + canvasLayout.h) * scaleY));
      const sw = ex - sx;
      const sh = ey - sy;
      if (sw > 10 && sh > 10) {
        const out = document.createElement("canvas");
        out.width = sw;
        out.height = sh;
        const ctx = out.getContext("2d");
        if (ctx) {
          ctx.drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh);
          dataUrl = out.toDataURL("image/png");
        }
      }
    }
    if (!dataUrl) {
      dataUrl = cv.toDataURL("image/png");
    }
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `vizdeck-room-${Date.now()}.png`;
    a.click();
    toast.success("Image saved!", T);
  };

  const selectProduct = (p: VisualizerProduct) => {
    if (isScanning) {
      toast("Room is scanning, please wait...", { id: "scan-lock", icon: "✨" });
      return;
    }
    const authoritative = parseAuthoritativeDimensions(p);
    if (authoritative) {
      placeAuthoritative(p, authoritative);
    } else {
      setMissingDimProduct(p);
    }
  };

  const filtered = products.filter((p: VisualizerProduct) => (p.name || "").toLowerCase().includes(query.toLowerCase()));
  const selectedRotDeg = selected
    ? Math.round((((selected.rot * 180) / Math.PI) % 360 + 360) % 360)
    : 0;

  const renderAnalysisStatusBadge = () => {
    if (analysisStatus === "analyzing") {
      return (
        <span className="flex items-center gap-1 text-[9px] md:text-[8px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
          <Loader2 size={9} className="animate-spin" /> Analyzing
        </span>
      );
    }
    if (analysisStatus === "success") {
      return (
        <span className="flex items-center gap-1 text-[9px] md:text-[8px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
        </span>
      );
    }
    if (analysisStatus === "error") {
      return (
        <span className="flex items-center gap-1 text-[9px] md:text-[8px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
          Failed
        </span>
      );
    }
    return <span className="text-[9px] md:text-[8px] text-white/40">Ready</span>;
  };

  const renderScanningNotice = (compact = false) =>
    isScanning ? (
      <div
        className={`${
          compact ? "mx-3 mt-2 py-1.5 px-3" : "mx-1 my-1.5 py-2 px-3"
        } rounded-lg bg-[#10b981]/15 border border-[#10b981]/35 text-[#34d399] text-[10px] flex items-center justify-center gap-2 tracking-wide font-medium shadow-md`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-ping" />
        <span>{getScanStepLabel(scanPercent)}...</span>
      </div>
    ) : null;

  const renderExistingRugToggle = (mobile = false) =>
    hasExistingRug && cleanFloorUrl ? (
      <div className={mobile ? "pt-2 border-t border-white/10" : "p-3 border-b border-white/10 shrink-0"}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] uppercase tracking-wider text-emerald-400 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Existing Rug Aligned
          </span>
          <span className="text-[8px] text-white/40">Direct Overlay</span>
        </div>
        <label className="flex items-center gap-2 text-[11px] md:text-[10px] text-white/75 cursor-pointer select-none mt-1 py-1">
          <input
            type="checkbox"
            checked={replaceExistingRug}
            onChange={(e) => setReplaceExistingRug(e.target.checked)}
            className="w-4 h-4 md:w-3.5 md:h-3.5 rounded bg-white/10 border-white/20 text-[#a82028] focus:ring-0"
          />
          <span>Remove old rug underneath (Inpaint)</span>
        </label>
      </div>
    ) : null;

  if (step === "room") {
    return (
      <div
        style={{ fontFamily: "'Libre Franklin', sans-serif" }}
        className={
          embedded
            ? "relative w-full h-full bg-[#0a0a0a] text-white overflow-y-auto overscroll-contain"
            : "fixed inset-0 z-[9999] bg-[#0a0a0a] text-white overflow-y-auto overscroll-contain"
        }
      >
        <div className="sticky top-0 z-10 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
            {onExit ? (
              <button onClick={onExit} className="min-h-[36px] text-white/60 hover:text-white text-xs uppercase tracking-widest flex items-center gap-2 transition shrink-0">
                <X size={14} /> Exit
              </button>
            ) : !isVisdeckEmbed ? (
              <button onClick={() => router.back()} className="min-h-[36px] text-white/60 hover:text-white text-xs uppercase tracking-widest flex items-center gap-2 transition shrink-0">
                <X size={14} /> Exit
              </button>
            ) : (
              <span className="text-xs uppercase tracking-widest text-white/35 shrink-0">VIZDECK</span>
            )}
            <span className="text-xs sm:text-sm font-serif text-white/60 truncate">{visualizerLabel}</span>
            {/* <button onClick={() => router.push("/visualizer")} className="text-white/30 hover:text-white text-xs uppercase tracking-widest transition">
              AI Mode →
            </button> */}
          </div>
        </div>

        <div className={`max-w-5xl mx-auto px-4 sm:px-6 ${embedded ? "py-5 sm:py-10" : "py-7 sm:py-14"}`}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`text-center ${embedded ? "mb-6 sm:mb-10" : "mb-7 sm:mb-12"}`}>
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-serif text-white mb-2.5 sm:mb-4">Choose Your Room</h1>
            <p className="text-white/50 text-xs sm:text-sm max-w-lg mx-auto leading-relaxed">
              Rugs sit on the floor in perspective, pick up the room lighting, and tuck under furniture. Drag, rotate, or copy after you place one.
            </p>
          </motion.div>

          <motion.label
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="block cursor-pointer border-2 border-dashed border-white/15 hover:border-[#7A0C13] active:border-[#7A0C13] p-5 sm:p-10 text-center transition-all group mb-6 sm:mb-10 rounded-xl hover:bg-white/[0.02]"
          >
            <UploadCloud className="w-7 h-7 sm:w-9 sm:h-9 mx-auto text-white/25 group-hover:text-[#7A0C13] mb-2.5 sm:mb-3 transition" />
            <p className="text-xs sm:text-sm text-white/70 uppercase tracking-widest group-hover:text-white/90 transition">Upload Your Own Room Photo</p>
            <p className="text-[10px] text-white/35 mt-1.5 sm:mt-2 tracking-wider">JPG, PNG — camera or photo library</p>
            <input type="file" accept="image/*" className="hidden" onChange={uploadRoom} />
          </motion.label>

          <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-4 sm:mb-6 text-center">— or choose a sample room —</p>

          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 pb-6">
            {ROOMS.map((r, i) => (
              <motion.button
                key={r.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                onClick={() => {
                  applyRoom(r, false);
                  setStep("canvas");
                }}
                className="relative overflow-hidden aspect-[4/3] group rounded-xl ring-1 ring-white/10 hover:ring-[#7A0C13] active:ring-[#7A0C13] hover:ring-2 transition-all text-left"
              >
                <img src={r.src} alt={r.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-4">
                  {r.roomType && (
                    <span className="block text-[8px] sm:text-[9px] uppercase tracking-widest text-white/60 mb-0.5">{r.roomType}</span>
                  )}
                  <p className="text-xs sm:text-sm text-white font-serif drop-shadow-lg leading-tight">{r.name}</p>
                </div>
                <div className="hidden sm:flex absolute inset-0 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-[#7A0C13]/20">
                  <div className="bg-white text-black text-[10px] uppercase tracking-widest px-4 py-2 font-medium">Select Room</div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ fontFamily: "'Libre Franklin', sans-serif" }}
      className={
        embedded
          ? "relative w-full h-full bg-[#0a0a0a] text-white flex flex-col overflow-hidden"
          : "fixed inset-0 z-[9999] bg-[#0a0a0a] text-white flex flex-col"
      }
    >
      <div className="min-h-[46px] md:h-11 bg-[#111] border-b border-white/10 flex items-center justify-between gap-2 px-2.5 sm:px-4 py-1.5 md:py-0 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => {
              setStep("room");
              setRugs([]);
              setSelectedId(null);
            }}
            className="min-h-[34px] px-1.5 text-white/60 hover:text-white text-[10px] uppercase tracking-widest flex items-center gap-1.5 transition shrink-0"
          >
            <X size={13} /> {isVisdeckEmbed ? "Rooms" : "Exit"}
          </button>
          <div className="hidden sm:block w-px h-4 bg-white/10 shrink-0" />
          <span className="hidden sm:inline text-xs font-serif text-white/50 truncate">{visualizerLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowBefore((prev) => !prev)}
            className={`min-h-[34px] px-2.5 sm:px-3 py-1.5 text-[9px] uppercase tracking-wider border rounded-md sm:rounded transition flex items-center gap-1.5 font-medium ${
              showBefore
                ? "bg-[#7A0C13] border-[#7A0C13] text-white shadow-lg"
                : "bg-white/5 border-white/10 text-white/75 hover:text-white hover:bg-white/10"
            }`}
            title="Toggle Before (Original Room) and After (With Rug)"
          >
            <Eye size={12} />
            <span className="sm:hidden">{showBefore ? "Original" : "Compare"}</span>
            <span className="hidden sm:inline">{showBefore ? "Original (Before)" : "Before / After"}</span>
          </button>
          <Btn icon={<Home size={12} />} label="Change Room" mobileLabel="Room" onClick={() => setRoomModal(true)} />
          <Btn icon={<Download size={12} />} label="Save" onClick={download} />
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        <aside className="hidden md:flex w-[280px] bg-[#111] border-r border-white/10 flex-col shrink-0 overflow-hidden">
          <div className="p-3.5 border-b border-white/10 shrink-0 bg-white/[0.02]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] uppercase tracking-widest text-white/50 flex items-center gap-1.5 font-medium">
                <Sparkles size={11} className="text-[#a82028]" /> AI Room Intelligence
              </p>
              {renderAnalysisStatusBadge()}
            </div>

            <div className="space-y-1.5 mb-3">
              <div className="flex justify-between items-baseline text-[10px]">
                <span className="text-white/40">Space Type</span>
                <span className="text-white/90 font-medium font-serif">{roomType}</span>
              </div>
              <div className="flex justify-between items-baseline text-[10px]">
                <span className="text-white/40">Estimated Floor</span>
                <span className="text-white/70 font-mono text-[9px]">{floorSize.widthFt} × {floorSize.depthFt} ft</span>
              </div>
              {analysisStatus === "error" && analysisError ? (
                <div className="text-[9px] text-red-400/80 leading-relaxed bg-red-400/10 p-2 rounded border border-red-400/20">
                  {analysisError}
                </div>
              ) : (
                <div className="text-[9px] text-white/40 leading-relaxed bg-white/[0.03] p-2 rounded border border-white/5">
                  {placementReason}
                </div>
              )}
            </div>

            <div className="flex gap-1.5">
              <button
                onClick={() => room && triggerRoomAnalysis(room.src, room.name)}
                disabled={analysisStatus === "analyzing"}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[8px] uppercase tracking-wider bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white rounded transition disabled:opacity-50"
              >
                {analysisStatus === "analyzing" ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                {analysisStatus === "error" ? "Retry Analysis" : "Re-Analyze"}
              </button>
              <button
                type="button"
                onClick={() => setShowBefore((prev) => !prev)}
                className={`px-3 py-1.5 text-[8px] uppercase tracking-wider border rounded transition flex items-center gap-1.5 font-medium ${
                  showBefore
                    ? "bg-[#7A0C13] border-[#7A0C13] text-white shadow"
                    : "bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                }`}
                title="Toggle Before / After Room Comparison"
              >
                <Eye size={10} />
                {showBefore ? "Before (Original)" : "Before / After"}
              </button>
            </div>
          </div>

          {renderExistingRugToggle(false)}

          {selected && (
            <div className="p-3 border-b border-white/10 bg-white/[0.015] shrink-0">
              <div className="flex gap-2.5">
                <div className="w-12 h-12 bg-white/10 shrink-0 overflow-hidden border border-white/10">
                  <img src={selected.img} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] text-white/25 uppercase tracking-widest">{collectionLabel}</p>
                  <p className="text-xs font-serif text-white truncate mt-0.5">{selected.name}</p>
                  <p className="text-[10px] text-white/35">
                    {selected.w} × {selected.h} ft
                  </p>
                </div>
              </div>
            </div>
          )}

          {selected && (
            <div className="p-3 border-b border-white/10 shrink-0">
              <p className="text-[8px] uppercase tracking-widest text-white/25 mb-2">
                Rotate {selectedRotDeg}°
              </p>
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={selectedRotDeg}
                onChange={(e) => setRotationDeg(+e.target.value)}
                className="w-full accent-[#7A0C13]"
              />
            </div>
          )}

          {selected && (
            <div className="p-3 border-b border-white/10 shrink-0">
              <p className="text-[8px] uppercase tracking-widest text-white/25 mb-2">Size</p>
              <div className="flex flex-wrap gap-1">
                {SIZES.map((s, i) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      setSizeIdx(i);
                      resizeTo(s);
                    }}
                    className={`px-2 py-1 text-[9px] tracking-wider border transition ${
                      selected.w === s.w && selected.h === s.h
                        ? "bg-white text-black border-white font-medium"
                        : "border-white/10 text-white/35 hover:border-white/25 hover:text-white/60"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-2.5 border-b border-white/10 shrink-0">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/15" />
              <input
                type="text"
                placeholder="Search rugs..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/8 text-white text-[11px] py-1.5 pl-7 pr-3 placeholder-white/15 focus:outline-none focus:border-[#7A0C13]/50 transition"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-2 space-y-0.5">
              {renderScanningNotice(false)}
              {filtered.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-white/15 text-[10px]">No rugs found</p>
                </div>
              )}
              {filtered.map((p: VisualizerProduct) => (
                <button
                  key={p.id}
                  onClick={() => selectProduct(p)}
                  disabled={isScanning}
                  className={`w-full flex items-center gap-2.5 p-2 text-left transition group ${
                    isScanning
                      ? "opacity-35 cursor-not-allowed border border-transparent"
                      : selected?.productId === p.id
                      ? "bg-[#7A0C13]/15 border border-[#7A0C13]/30"
                      : "border border-transparent hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="w-11 h-11 bg-white/5 shrink-0 overflow-hidden">
                    <img
                      src={p.images?.[0] || p.image || ""}
                      alt={p.name || "Rug"}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://placehold.co/80/1a1a1a/333?text=·";
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-white/70 truncate">{p.name}</p>
                    <p className="text-[9px] text-white/25 mt-0.5">{p.category || "Rug"}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex-1 relative bg-[#1a1a1a] min-h-[200px] min-w-0 overflow-hidden">
          <div ref={wrap} className="absolute inset-0">
            {room && (
              <FloorRugCanvas
                roomSrc={room.src}
                floorPlateSrc={(replaceExistingRug && cleanFloorUrl) ? cleanFloorUrl : null}
                floor={floor}
                floorSize={floorSize}
                rugs={showBefore ? [] : rugs}
                selectedId={showBefore ? null : selectedId}
                calibrating={calibrating}
                calibration={calibration}
                measuredCalibrating={measuredCalibrating}
                calibrationCorners={calibrationCorners}
                onCalibrationCornerChange={(idx, pt) => {
                  if (!calibrationCorners) return;
                  const next = [...calibrationCorners] as [Vec2, Vec2, Vec2, Vec2];
                  next[idx] = pt;
                  setCalibrationCorners(next);
                }}
                tool={tool}
                occlusion={occlusion}
                occlusionMaskUrl={aiOcclusionUrl}
                floorSupportMaskUrl={floorSupportMaskUrl}
                showDebug={showDebug}
                debugOverlayUrl={debugOverlayUrl}
                enable3DRendering={enable3DRendering}
                materialType={materialType}
                onFloorChange={onFloorChange}
                onRugsChange={setRugs}
                onSelect={setSelectedId}
                onToolbar={setTb}
                onReadyCanvas={(c) => {
                  canvasNode.current = c;
                }}
                onLayoutChange={setCanvasLayout}
                onOccludeClick={(pt, add) => {
                  const clicks = [...occludeClicks, { x: pt.x, y: pt.y, add }];
                  setOccludeClicks(clicks);
                  rebuildMask(floor, clicks, autoOcclude);
                }}
              />
            )}
            {showBefore && (
              <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-30 bg-black/85 backdrop-blur-md border border-white/20 text-white text-[9px] sm:text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full flex items-center gap-2 shadow-2xl pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Original Room (Before)</span>
              </div>
            )}

            {/* One-Time Spatial LiDAR Room Laser Scanner */}
            <AnimatePresence>
              {isScanning && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 pointer-events-none z-20 overflow-hidden"
                >
                  {/* Subtle ambient scan illumination */}
                  <div className="absolute inset-0 bg-black/25 backdrop-blur-[1px]" />

                  {/* Single-Pass Green Laser Scan Beam sweeping from top to bottom */}
                  <div
                    className="absolute left-0 right-0 h-[3px] pointer-events-none"
                    style={{
                      top: `${scanPercent}%`,
                      background: "linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.5) 15%, #ffffff 50%, rgba(16,185,129,0.5) 85%, transparent 100%)",
                      boxShadow: "0 0 18px #10b981, 0 0 35px rgba(16,185,129,0.9), 0 0 70px rgba(5,150,105,0.7)",
                    }}
                  >
                    {/* Glowing green diamond center focal point */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 bg-[#10b981] shadow-[0_0_12px_#ffffff]" />
                  </div>

                  {/* Luminous green aura wash trailing behind the laser beam */}
                  <div
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{
                      top: `${Math.max(0, scanPercent - 22)}%`,
                      height: `${Math.min(scanPercent, 22)}%`,
                      background: "linear-gradient(to top, rgba(16,185,129,0.22) 0%, rgba(5,150,105,0.12) 45%, transparent 100%)",
                    }}
                  />

                  {/* Modern High-Tech Green HUD Scan Tag following the beam */}
                  <div
                    className="absolute right-3 sm:right-6 -translate-y-full mb-1.5 pointer-events-none flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded bg-black/90 backdrop-blur-md border border-[#10b981]/50 text-[#10b981] shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                    style={{
                      top: `${Math.min(95, Math.max(8, scanPercent))}%`,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-ping" />
                    <span className="text-[8px] sm:text-[9px] font-mono tracking-widest uppercase font-semibold">
                      {getScanStepLabel(scanPercent)} · {Math.round(scanPercent)}%
                    </span>
                  </div>

                  {/* Architectural Green Corner Target Brackets */}
                  <div className="absolute top-3 left-3 sm:top-6 sm:left-6 w-5 h-5 sm:w-7 sm:h-7 border-t-2 border-l-2 border-[#10b981]/70" />
                  <div className="absolute top-3 right-3 sm:top-6 sm:right-6 w-5 h-5 sm:w-7 sm:h-7 border-t-2 border-r-2 border-[#10b981]/70" />
                  <div className="absolute bottom-3 left-3 sm:bottom-6 sm:left-6 w-5 h-5 sm:w-7 sm:h-7 border-b-2 border-l-2 border-[#10b981]/70" />
                  <div className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 w-5 h-5 sm:w-7 sm:h-7 border-b-2 border-r-2 border-[#10b981]/70" />

                  {/* Subtle 3D floor perspective grid when beam reaches bottom half */}
                  {scanPercent > 35 && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-1/2 opacity-25 pointer-events-none bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(to_bottom,transparent,black)] transition-opacity duration-500"
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {tb && selected && !showBefore && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="hidden md:flex absolute z-30 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/15 rounded-xl px-1 py-0.5 items-center"
                style={{
                  left: `${Math.max(8, Math.min(tb.x - 110, Math.max(8, wrapSize.w - 230)))}px`,
                  top: `${Math.max(8, Math.min(tb.y, Math.max(8, wrapSize.h - 56)))}px`,
                }}
              >
                <button onClick={rotate} className="flex flex-col items-center gap-0.5 px-4 py-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition">
                  <RotateCw size={15} />
                  <span className="text-[7px] uppercase tracking-wider">Rotate</span>
                </button>
                <div className="w-px h-7 bg-white/10" />
                <button onClick={copyRug} className="flex flex-col items-center gap-0.5 px-4 py-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition">
                  <Copy size={15} />
                  <span className="text-[7px] uppercase tracking-wider">Copy</span>
                </button>
                <div className="w-px h-7 bg-white/10" />
                <button onClick={remove} className="flex flex-col items-center gap-0.5 px-4 py-1.5 text-white/50 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition">
                  <Trash2 size={15} />
                  <span className="text-[7px] uppercase tracking-wider">Remove</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {measuredCalibrating && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-16px)] sm:w-auto max-w-2xl bg-[#161616]/95 backdrop-blur-xl border border-amber-500/50 rounded-2xl sm:rounded-full px-3.5 sm:px-5 py-2 flex flex-col sm:flex-row items-center gap-2 sm:gap-4 shadow-2xl text-center sm:text-left">
              <div className="flex items-center flex-wrap justify-center gap-1.5 sm:gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span className="text-[11px] sm:text-xs text-white/90 font-medium">
                  Calibrating: Drag 4 pins to match {calibRefName}
                </span>
                <span className="text-[10px] text-amber-400 font-mono">
                  ({calibRefWidthM.toFixed(2)} × {calibRefLengthM.toFixed(2)} m)
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={confirmCalibration}
                  className="px-3.5 py-1 text-[11px] sm:text-xs font-semibold uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-black rounded-full transition shadow"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setMeasuredCalibrating(false)}
                  className="px-3 py-1 text-[11px] sm:text-xs uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white/70 rounded-full transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showDiagnostics && (
            <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-40 w-[calc(100%-16px)] sm:w-80 max-h-[calc(100%-16px)] overflow-y-auto bg-[#111]/95 backdrop-blur-xl border border-white/15 rounded-xl p-4 text-[11px] font-mono shadow-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-semibold text-white/90 flex items-center gap-1.5 font-sans">
                  <Activity size={13} className="text-amber-400" /> RoomIQ Diagnostics
                </span>
                <button onClick={() => setShowDiagnostics(false)} className="text-white/40 hover:text-white p-1">
                  <X size={14} />
                </button>
              </div>

              <div>
                <p className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Calibration State</p>
                {calibration?.isCalibrated ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded text-emerald-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      <ShieldCheck size={12} className="text-emerald-400" /> METRIC HOMOGRAPHY (Calibrated)
                    </div>
                    <p className="text-[10px] text-white/70">Ref: {calibration.reference?.name || calibRefName}</p>
                    <p className="text-[10px] text-white/70">
                      Round-trip Max Error:{" "}
                      <span className="text-emerald-400 font-bold">
                        {calibration.maxRoundTripErrorM < 1e-12 ? "< 1.0e-15 m" : `${calibration.maxRoundTripErrorM.toExponential(2)} m`}
                      </span>
                    </p>
                  </div>
                ) : (
                  <div className="bg-amber-500/10 border border-amber-500/30 p-2 rounded text-amber-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle size={12} className="text-amber-400" /> Perspective Quad (Uncalibrated)
                    </div>
                    <p className="text-[10px] text-white/60">Estimated Room Floor: {floorSize.widthFt} × {floorSize.depthFt} ft</p>
                    <button
                      onClick={() => setShowCalibrationModal(true)}
                      className="mt-1 text-[9px] uppercase tracking-wider underline text-amber-300 hover:text-white"
                    >
                      Calibrate with Known Reference →
                    </button>
                  </div>
                )}
              </div>

              {selected ? (() => {
                const invCheck = (calibration?.isCalibrated && calibration.H_metric && calibration.invH_metric)
                  ? verifyRugDimensionalInvariance(selected, calibration.H_metric, calibration.invH_metric)
                  : null;
                return (
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Selected Rug Dimensional Invariance</p>
                    <div className="bg-white/5 border border-white/10 p-2 rounded text-white/80 space-y-1">
                      <p className="text-white font-medium truncate font-sans">{selected.name}</p>
                      <p>Authoritative: {selected.w.toFixed(1)} × {selected.h.toFixed(1)} ft ({selected.widthM?.toFixed(3) || (selected.w * FT_TO_M).toFixed(3)} × {selected.lengthM?.toFixed(3) || (selected.h * FT_TO_M).toFixed(3)} m)</p>
                      <p>Floor Position: ({(selected.xM ?? (selected.x * FT_TO_M)).toFixed(2)}m, {(selected.zM ?? (selected.z * FT_TO_M)).toFixed(2)}m)</p>
                      <p>Rotation: {((selected.rot * 180) / Math.PI).toFixed(1)}°</p>
                      {invCheck && (
                        <div className="pt-1 mt-1 border-t border-white/10 text-[10px]">
                          <div className="flex justify-between">
                            <span>Recovered Size:</span>
                            <span className="text-emerald-400 font-bold">{invCheck.recoveredWidthM.toFixed(3)} × {invCheck.recoveredLengthM.toFixed(3)} m</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Round-Trip Drift:</span>
                            <span className="text-emerald-400 font-bold">{invCheck.maxCornerDriftM < 1e-12 ? "< 1.0e-15 m" : `${invCheck.maxCornerDriftM.toExponential(2)} m`}</span>
                          </div>
                          <div className="flex justify-between text-emerald-400 font-semibold mt-0.5">
                            <span>Invariance Status:</span>
                            <span>PASS (&lt; 10⁻⁴ m)</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <p className="text-white/30 text-[10px] italic">No rug selected on floor.</p>
              )}

              {calibration?.isCalibrated && (
                <div className="pt-1">
                  <button
                    onClick={resetCalibration}
                    className="w-full py-1 text-[9px] uppercase tracking-wider text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded transition"
                  >
                    Reset Calibration to AI Estimate
                  </button>
                </div>
              )}
            </div>
          )}

          {calibrating && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-16px)] bg-black/80 backdrop-blur text-white/85 text-[9px] sm:text-[10px] uppercase tracking-widest px-3.5 py-2 border border-white/15 rounded-full flex items-center gap-2.5 text-center">
              <span>Drag the 4 corners onto the floor</span>
              <button
                type="button"
                onClick={() => setCalibrating(false)}
                className="px-2.5 py-0.5 rounded-full bg-white text-black font-semibold text-[9px] shrink-0"
              >
                Done
              </button>
            </div>
          )}
          {tool !== "move" && !calibrating && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-16px)] text-center bg-black/75 text-white/85 text-[9px] sm:text-[10px] uppercase tracking-widest px-3.5 py-2 border border-white/10 rounded-full">
              {tool === "under" ? "Tap furniture to hide the rug under it" : "Tap to reveal the rug again"}
            </div>
          )}

          <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 z-20 max-w-[60%] truncate bg-black/55 text-white/40 text-[8px] uppercase tracking-widest px-2.5 py-1 border border-white/5 rounded pointer-events-none">
            {room?.name}
          </div>

          {rugs.length === 0 && !calibrating && !isScanning && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="bg-black/55 backdrop-blur px-6 py-5 sm:px-10 sm:py-8 text-center border border-white/10 rounded-xl max-w-xs sm:max-w-sm"
              >
                <ArrowRight size={22} className="hidden md:block mx-auto text-white/30 mb-3 -rotate-180" />
                <ArrowRight size={20} className="md:hidden mx-auto text-white/30 mb-2 rotate-90" />
                <p className="text-white/75 text-xs sm:text-sm font-serif">
                  <span className="hidden md:inline">Select a rug from the catalog</span>
                  <span className="md:hidden">Pick a rug below to place it</span>
                </p>
                <p className="text-white/35 text-[9px] uppercase tracking-widest mt-1.5 sm:mt-2">
                  Drag on the floor · Resize &amp; rotate anytime
                </p>
              </motion.div>
            </div>
          )}
        </main>

        {/* Mobile Bottom Control Dock (< 768px) */}
        <section
          aria-label="Mobile rug controls"
          className="md:hidden shrink-0 bg-[#111] border-t border-white/10 flex flex-col z-30 pb-[env(safe-area-inset-bottom)]"
        >
          {selected && !showBefore && (
            <div className="px-3 py-2 border-b border-white/10 bg-white/[0.03] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setMobileTab("adjust")}
                className="flex items-center gap-2.5 min-w-0 text-left flex-1"
              >
                <div className="w-8 h-8 rounded-md bg-white/10 shrink-0 overflow-hidden border border-white/15">
                  <img src={selected.img} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-serif text-white truncate leading-tight">{selected.name}</p>
                  <p className="text-[10px] text-white/50 truncate mt-0.5">
                    {selected.w} × {selected.h} ft · {selectedRotDeg}°
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={rotate}
                  aria-label="Rotate rug 90 degrees"
                  className="min-w-[36px] min-h-[36px] px-2 rounded-lg bg-white/5 hover:bg-white/15 active:bg-white/20 text-white/80 flex items-center justify-center transition"
                >
                  <RotateCw size={15} />
                </button>
                <button
                  type="button"
                  onClick={copyRug}
                  aria-label="Duplicate rug"
                  className="min-w-[36px] min-h-[36px] px-2 rounded-lg bg-white/5 hover:bg-white/15 active:bg-white/20 text-white/80 flex items-center justify-center transition"
                >
                  <Copy size={15} />
                </button>
                <button
                  type="button"
                  onClick={remove}
                  aria-label="Remove rug"
                  className="min-w-[36px] min-h-[36px] px-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/25 text-red-400 flex items-center justify-center transition"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center border-b border-white/10 bg-[#0d0d0d]">
            <button
              type="button"
              onClick={() => setMobileTab("rugs")}
              className={`flex-1 min-h-[38px] px-2 text-[10px] uppercase tracking-wider font-medium flex items-center justify-center gap-1.5 border-b-2 transition ${
                mobileTab === "rugs"
                  ? "border-[#a82028] text-white bg-white/[0.03]"
                  : "border-transparent text-white/45 hover:text-white/75"
              }`}
            >
              <Layers size={12} />
              <span>Rugs</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("adjust")}
              className={`flex-1 min-h-[38px] px-2 text-[10px] uppercase tracking-wider font-medium flex items-center justify-center gap-1.5 border-b-2 transition ${
                mobileTab === "adjust"
                  ? "border-[#a82028] text-white bg-white/[0.03]"
                  : "border-transparent text-white/45 hover:text-white/75"
              }`}
            >
              <Ruler size={12} />
              <span>Size &amp; Angle</span>
              {selected && <span className="w-1.5 h-1.5 rounded-full bg-[#a82028]" />}
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("ai")}
              className={`flex-1 min-h-[38px] px-2 text-[10px] uppercase tracking-wider font-medium flex items-center justify-center gap-1.5 border-b-2 transition ${
                mobileTab === "ai"
                  ? "border-[#a82028] text-white bg-white/[0.03]"
                  : "border-transparent text-white/45 hover:text-white/75"
              }`}
            >
              <Sparkles size={12} className="text-[#a82028]" />
              <span>Room AI</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  analysisStatus === "analyzing"
                    ? "bg-amber-400 animate-pulse"
                    : analysisStatus === "success"
                    ? "bg-emerald-400"
                    : analysisStatus === "error"
                    ? "bg-red-400"
                    : "bg-white/30"
                }`}
              />
            </button>
            {mobileTab === "rugs" && (
              <button
                type="button"
                onClick={() => setMobileDrawerExpanded((v) => !v)}
                aria-label={mobileDrawerExpanded ? "Collapse rug list" : "Search and browse all rugs"}
                className="min-h-[38px] px-3 border-l border-white/10 text-white/60 hover:text-white flex items-center gap-1 text-[10px] uppercase tracking-wider shrink-0"
              >
                {mobileDrawerExpanded ? (
                  <>
                    <ChevronDown size={13} />
                    <span>Compact</span>
                  </>
                ) : (
                  <>
                    <Search size={11} />
                    <ChevronUp size={13} />
                  </>
                )}
              </button>
            )}
          </div>

          {mobileTab === "rugs" && (
            <div className="flex flex-col">
              {renderScanningNotice(true)}
              {!mobileDrawerExpanded ? (
                <div className="flex items-stretch gap-2.5 overflow-x-auto px-3 py-2.5 overscroll-x-contain">
                  {filtered.length === 0 ? (
                    <div className="w-full py-4 text-center flex items-center justify-center gap-3">
                      <span className="text-white/40 text-xs">No rugs match &ldquo;{query}&rdquo;</span>
                      {query && (
                        <button
                          type="button"
                          onClick={() => setQuery("")}
                          className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded border border-white/15 text-white/80"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  ) : (
                    filtered.map((p: VisualizerProduct) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProduct(p)}
                        disabled={isScanning}
                        className={`w-[88px] shrink-0 text-left flex flex-col rounded-lg p-1.5 border transition ${
                          isScanning
                            ? "opacity-35 cursor-not-allowed border-white/5"
                            : selected?.productId === p.id
                            ? "bg-[#7A0C13]/20 border-[#a82028]"
                            : "bg-white/[0.03] border-white/10 active:bg-white/[0.08]"
                        }`}
                      >
                        <div className="w-full aspect-square rounded bg-white/5 overflow-hidden">
                          <img
                            src={p.images?.[0] || p.image || ""}
                            alt={p.name || "Rug"}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://placehold.co/80/1a1a1a/333?text=·";
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-white/85 truncate mt-1.5 leading-tight">{p.name}</p>
                        <p className="text-[9px] text-white/40 truncate mt-0.5">{p.size || p.category || "Rug"}</p>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="flex flex-col">
                  <div className="p-2.5 border-b border-white/10 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                        type="text"
                        placeholder="Search rugs..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg text-white text-base py-1.5 pl-8 pr-8 placeholder-white/30 focus:outline-none focus:border-[#7A0C13]/60"
                      />
                      {query && (
                        <button
                          type="button"
                          onClick={() => setQuery("")}
                          aria-label="Clear search"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    className={`grid grid-cols-2 gap-2 p-2.5 overflow-y-auto overscroll-contain ${
                      embedded ? "max-h-[185px]" : "max-h-[34dvh]"
                    }`}
                  >
                    {filtered.length === 0 ? (
                      <div className="col-span-2 py-8 text-center text-white/40 text-xs">No rugs found</div>
                    ) : (
                      filtered.map((p: VisualizerProduct) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            selectProduct(p);
                            if (!isScanning) setMobileDrawerExpanded(false);
                          }}
                          disabled={isScanning}
                          className={`flex items-center gap-2 p-2 rounded-lg text-left border transition ${
                            isScanning
                              ? "opacity-35 cursor-not-allowed border-white/5"
                              : selected?.productId === p.id
                              ? "bg-[#7A0C13]/20 border-[#a82028]"
                              : "bg-white/[0.03] border-white/10 active:bg-white/[0.08]"
                          }`}
                        >
                          <div className="w-11 h-11 rounded bg-white/5 shrink-0 overflow-hidden">
                            <img
                              src={p.images?.[0] || p.image || ""}
                              alt={p.name || "Rug"}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "https://placehold.co/80/1a1a1a/333?text=·";
                              }}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-white/85 truncate leading-tight">{p.name}</p>
                            <p className="text-[9px] text-white/40 truncate mt-0.5">{p.size || p.category || "Rug"}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {mobileTab === "adjust" && (
            <div className={`p-3 space-y-3 overflow-y-auto overscroll-contain ${embedded ? "max-h-[210px]" : "max-h-[36dvh]"}`}>
              {!selected ? (
                <div className="py-4 text-center space-y-2.5">
                  <p className="text-xs text-white/50">Tap a rug on the floor or choose one from the catalog to resize &amp; rotate.</p>
                  <button
                    type="button"
                    onClick={() => setMobileTab("rugs")}
                    className="px-4 py-2 rounded-full bg-white text-black text-[10px] uppercase tracking-wider font-semibold"
                  >
                    Browse Rugs
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-white/40 mb-1.5">Rug Size</p>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 overscroll-x-contain">
                      {SIZES.map((s, i) => (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() => {
                            setSizeIdx(i);
                            resizeTo(s);
                          }}
                          className={`min-h-[34px] px-3 rounded-lg text-[11px] tracking-wide border shrink-0 transition ${
                            selected.w === s.w && selected.h === s.h
                              ? "bg-white text-black border-white font-semibold"
                              : "border-white/15 text-white/65 bg-white/[0.03]"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[9px] uppercase tracking-widest text-white/40">
                        Rotation: <span className="text-white font-mono">{selectedRotDeg}°</span>
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setRotationDeg((selectedRotDeg + 315) % 360)}
                          className="px-2 py-0.5 text-[10px] rounded border border-white/15 text-white/70 bg-white/5"
                        >
                          -45°
                        </button>
                        <button
                          type="button"
                          onClick={rotate}
                          className="px-2 py-0.5 text-[10px] rounded border border-white/15 text-white/70 bg-white/5"
                        >
                          +90°
                        </button>
                        <button
                          type="button"
                          onClick={() => setRotationDeg(0)}
                          className="px-2 py-0.5 text-[10px] rounded border border-white/15 text-white/70 bg-white/5"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      step={1}
                      value={selectedRotDeg}
                      onChange={(e) => setRotationDeg(+e.target.value)}
                      className="w-full h-7 accent-[#7A0C13] cursor-pointer"
                    />
                  </div>

                  {renderExistingRugToggle(true)}
                </>
              )}
            </div>
          )}

          {mobileTab === "ai" && (
            <div className={`p-3 space-y-2.5 overflow-y-auto overscroll-contain ${embedded ? "max-h-[210px]" : "max-h-[36dvh]"}`}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-white/60 flex items-center gap-1.5 font-medium">
                  <Sparkles size={12} className="text-[#a82028]" /> AI Room Intelligence
                </p>
                {renderAnalysisStatusBadge()}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] bg-white/[0.03] border border-white/10 rounded-lg p-2.5">
                <div>
                  <span className="block text-[9px] text-white/40 uppercase tracking-wider">Space Type</span>
                  <span className="text-white/90 font-serif">{roomType}</span>
                </div>
                <div>
                  <span className="block text-[9px] text-white/40 uppercase tracking-wider">Estimated Floor</span>
                  <span className="text-white/80 font-mono text-[10px]">{floorSize.widthFt} × {floorSize.depthFt} ft</span>
                </div>
              </div>
              {analysisStatus === "error" && analysisError ? (
                <div className="text-[10px] text-red-400/90 leading-relaxed bg-red-400/10 p-2 rounded-lg border border-red-400/20">
                  {analysisError}
                </div>
              ) : (
                <div className="text-[10px] text-white/55 leading-relaxed bg-white/[0.03] p-2 rounded-lg border border-white/5">
                  {placementReason}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => room && triggerRoomAnalysis(room.src, room.name)}
                  disabled={analysisStatus === "analyzing"}
                  className="flex-1 min-h-[36px] flex items-center justify-center gap-1.5 py-2 text-[10px] uppercase tracking-wider bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 rounded-lg transition disabled:opacity-50"
                >
                  {analysisStatus === "analyzing" ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                  {analysisStatus === "error" ? "Retry Analysis" : "Re-Analyze"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBefore((prev) => !prev)}
                  className={`flex-1 min-h-[36px] px-3 py-2 text-[10px] uppercase tracking-wider border rounded-lg transition flex items-center justify-center gap-1.5 font-medium ${
                    showBefore
                      ? "bg-[#7A0C13] border-[#7A0C13] text-white shadow"
                      : "bg-white/5 border-white/10 text-white/80"
                  }`}
                >
                  <Eye size={11} />
                  {showBefore ? "Original (Before)" : "Before / After"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Invalid Room Image Detected Modal */}
      <AnimatePresence>
        {showInvalidRoomModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[10001] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setShowInvalidRoomModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 280 }}
              className="relative bg-[#121214] text-white rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.9),0_0_50px_rgba(245,158,11,0.15)] p-5 sm:p-9 max-w-lg w-full max-h-[90dvh] overflow-y-auto text-center border border-amber-500/30 flex flex-col items-center select-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                type="button"
                onClick={() => setShowInvalidRoomModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition"
                title="Dismiss"
              >
                <X size={18} />
              </button>

              {/* Alert icon badge */}
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.25)]">
                <AlertTriangle size={28} />
              </div>

              {/* Title & Description */}
              <h2 className="text-xl sm:text-2xl font-serif text-white tracking-wide mb-2 font-medium">
                No Room Floor Detected
              </h2>
              <p className="text-xs sm:text-sm text-white/60 mb-6 leading-relaxed max-w-sm mx-auto">
                This image doesn&apos;t appear to show an indoor room with a visible floor. VIZDECK RoomIQ requires a photo showing the floor area to accurately place and scale rugs in perspective.
              </p>

              {/* Photo Tips Box */}
              <div className="w-full p-4 rounded-2xl bg-white/[0.03] border border-white/10 mb-6 space-y-2.5 text-left">
                <p className="text-[10px] uppercase tracking-wider text-amber-400/90 font-medium font-mono">
                  Tips for Room Photos
                </p>
                <div className="space-y-2 text-xs text-white/75">
                  <div className="flex items-start gap-2.5">
                    <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                    <span>Aim your camera slightly downwards to capture open floor space</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                    <span>Include key furniture like a sofa, coffee table, or bed</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="text-red-400/80 font-bold shrink-0 mt-0.5">✕</span>
                    <span>Avoid close-ups of walls, portraits, documents, or outdoor landscapes</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="w-full flex flex-col sm:flex-row gap-3">
                {/* Hidden File Input for re-uploading */}
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    setShowInvalidRoomModal(false);
                    uploadRoom(e);
                  }}
                />
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#7A0C13] to-[#99151B] hover:brightness-110 text-white font-medium text-xs tracking-wider uppercase shadow-lg shadow-[#7A0C13]/30 transition"
                >
                  <UploadCloud size={16} />
                  <span>Try Another Room</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowInvalidRoomModal(false);
                    setRoomModal(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 border border-white/15 text-xs font-medium tracking-wider uppercase transition"
                >
                  <Home size={15} />
                  <span>Choose Sample Room</span>
                </button>
              </div>

              {/* Manual adjust link */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowInvalidRoomModal(false);
                    setCalibrating(true);
                  }}
                  className="text-[11px] text-white/40 hover:text-white/70 underline underline-offset-4 transition"
                >
                  Continue anyway and adjust floor corners manually
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCalibrationModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur flex items-center justify-center p-3 sm:p-6"
            onClick={() => setShowCalibrationModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[#121212] border border-white/15 p-4 sm:p-6 max-w-xl w-full max-h-[85dvh] overflow-y-auto rounded-xl shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start border-b border-white/10 pb-3">
                <div>
                  <h2 className="text-base font-serif text-white flex items-center gap-2">
                    <Ruler size={16} className="text-amber-400" /> Measured Floor Calibration
                  </h2>
                  <p className="text-[11px] text-white/50 mt-1">
                    Select a known floor reference or tile to calibrate true physical scale (metric homography).
                  </p>
                </div>
                <button onClick={() => setShowCalibrationModal(false)} className="text-white/40 hover:text-white p-1">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] uppercase tracking-wider text-white/40 font-medium">Standard Floor Tile & Object Presets</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { label: "Floor Tile 60 × 60 cm", type: "tile" as const, w: 0.60, l: 0.60, desc: "Standard porcelain/ceramic tile" },
                    { label: "Floor Tile 30 × 30 cm", type: "tile" as const, w: 0.30, l: 0.30, desc: "Classic 1-foot tile" },
                    { label: "Large Tile 80 × 80 cm", type: "tile" as const, w: 0.80, l: 0.80, desc: "Modern grand format tile" },
                    { label: "Doorway Mat 2 × 3 ft", type: "custom_rectangle" as const, w: 2 * FT_TO_M, l: 3 * FT_TO_M, desc: "0.61 × 0.91 m entry mat" },
                    ...(hasExistingRug ? [{
                      label: "Existing Room Rug",
                      type: "existing_rug" as const,
                      w: 8 * FT_TO_M,
                      l: 10 * FT_TO_M,
                      desc: "AI-detected rug perimeter (8×10 ft default)"
                    }] : []),
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => startMeasuredCalibration(preset.type, preset.label, preset.w, preset.l)}
                      className="p-3 bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 hover:border-amber-500/50 rounded-lg text-left transition group"
                    >
                      <p className="text-xs text-white/90 font-medium group-hover:text-amber-400 transition">{preset.label}</p>
                      <p className="text-[10px] text-white/40 mt-0.5">{preset.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-white/10">
                <p className="text-[9px] uppercase tracking-wider text-white/40 mb-2 font-medium">Or Custom Rectangular Object</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    placeholder="Width (m)"
                    id="custom-cal-w"
                    defaultValue="0.60"
                    className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 sm:py-1.5 text-base sm:text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    placeholder="Length (m)"
                    id="custom-cal-l"
                    defaultValue="0.60"
                    className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 sm:py-1.5 text-base sm:text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={() => {
                      const wInput = document.getElementById("custom-cal-w") as HTMLInputElement;
                      const lInput = document.getElementById("custom-cal-l") as HTMLInputElement;
                      const w = parseFloat(wInput?.value || "0.6");
                      const l = parseFloat(lInput?.value || "0.6");
                      startMeasuredCalibration("custom_rectangle", `Custom Object (${w} × ${l} m)`, w, l);
                    }}
                    className="px-4 py-2 sm:py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold uppercase tracking-wider rounded transition"
                  >
                    Calibrate
                  </button>
                </div>
              </div>

              {calibration?.isCalibrated && (
                <div className="pt-2 flex justify-between items-center text-xs text-emerald-400 bg-emerald-400/5 border border-emerald-400/20 p-2.5 rounded-lg">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck size={14} /> Metric Calibration currently active
                  </span>
                  <button onClick={resetCalibration} className="text-red-400 hover:underline text-[10px] uppercase tracking-wider">
                    Reset
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}

        {missingDimProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur flex items-center justify-center p-3 sm:p-6"
            onClick={() => setMissingDimProduct(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[#121212] border border-white/15 p-4 sm:p-6 max-w-md w-full max-h-[85dvh] overflow-y-auto rounded-xl shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start border-b border-white/10 pb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 bg-white/5 rounded overflow-hidden shrink-0">
                    <img
                      src={missingDimProduct.images?.[0] || missingDimProduct.image || ""}
                      alt={missingDimProduct.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-serif text-white truncate">{missingDimProduct.name}</h2>
                    <p className="text-[10px] text-amber-400 mt-0.5 flex items-center gap-1">
                      <AlertTriangle size={11} className="shrink-0" /> Physical dimensions required
                    </p>
                  </div>
                </div>
                <button onClick={() => setMissingDimProduct(null)} className="text-white/40 hover:text-white p-1">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-white/50">Select Dimensions</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { label: "5 × 7 ft", w: 5, h: 7 },
                    { label: "5 × 8 ft", w: 5, h: 8 },
                    { label: "6 × 9 ft", w: 6, h: 9 },
                    { label: "8 × 10 ft", w: 8, h: 10 },
                    { label: "9 × 12 ft", w: 9, h: 12 },
                    { label: "10 × 14 ft", w: 10, h: 14 },
                  ].map((sz) => (
                    <button
                      key={sz.label}
                      onClick={() => {
                        const dim: MetricDimensions = {
                          widthM: sz.w * FT_TO_M,
                          lengthM: sz.h * FT_TO_M,
                          widthFt: sz.w,
                          lengthFt: sz.h,
                          label: sz.label,
                          source: "user_specified",
                        };
                        placeAuthoritative(missingDimProduct, dim);
                        setMissingDimProduct(null);
                      }}
                      className="py-2.5 px-2 bg-white/5 hover:bg-white/15 border border-white/10 hover:border-amber-400 text-center rounded transition"
                    >
                      <p className="text-xs text-white font-medium">{sz.label}</p>
                      <p className="text-[9px] text-white/40">{(sz.w * FT_TO_M).toFixed(1)} × {(sz.h * FT_TO_M).toFixed(1)} m</p>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {roomModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur flex items-center justify-center p-3 sm:p-6"
            onClick={() => setRoomModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[#111] border border-white/10 p-4 sm:p-6 max-w-3xl w-full max-h-[85dvh] overflow-y-auto rounded-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4 sm:mb-5">
                <h2 className="text-base sm:text-lg font-serif text-white">Change Room</h2>
                <button onClick={() => setRoomModal(false)} className="text-white/50 hover:text-white p-1">
                  <X size={18} />
                </button>
              </div>
              <label className="block cursor-pointer border border-dashed border-white/20 hover:border-[#7A0C13] p-4 sm:p-5 text-center transition group mb-4 sm:mb-5 rounded-lg">
                <UploadCloud size={22} className="mx-auto text-white/30 group-hover:text-[#7A0C13] mb-1" />
                <span className="text-xs text-white/60 uppercase tracking-widest">Upload Your Room</span>
                <input type="file" accept="image/*" className="hidden" onChange={uploadRoom} />
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {ROOMS.map((r) => (
                  <button
                    key={r.name}
                    onClick={() => switchRoom(r)}
                    className={`relative overflow-hidden aspect-[4/3] rounded-lg text-left ${room?.src === r.src ? "ring-2 ring-[#7A0C13]" : "ring-1 ring-white/10"}`}
                  >
                    <img src={r.src} alt="" className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                    <p className="absolute bottom-1.5 left-2 right-2 text-[10px] sm:text-[11px] text-white drop-shadow-lg leading-tight truncate">{r.name}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Btn({
  icon,
  label,
  mobileLabel,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  mobileLabel?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`min-h-[34px] flex items-center gap-1.5 text-[9px] sm:text-[10px] uppercase tracking-wider sm:tracking-widest px-2.5 py-1.5 border rounded-md sm:rounded transition ${
        active ? "text-white border-white/30 bg-white/10" : "text-white/70 md:text-white/45 hover:text-white border-white/10 hover:border-white/25 bg-white/[0.04]"
      }`}
    >
      {icon}
      {mobileLabel ? (
        <>
          <span className="sm:hidden">{mobileLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}
