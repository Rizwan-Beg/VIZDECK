"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { Toaster } from "react-hot-toast";

const RoomVisualizer = dynamic(
  () => import("@/components/visualizer/RoomVisualizer"),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 bg-[#0a0a0a] text-white flex items-center justify-center gap-3 text-sm">
        <LoaderCircle size={20} className="animate-spin text-[#7A0C13]" />
        <span>Loading VIZDECK Rug Visualizer…</span>
      </div>
    ),
  }
);

export default function FullscreenRugVisualizerPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-[#0a0a0a] text-white flex items-center justify-center gap-3 text-sm">
          <LoaderCircle size={20} className="animate-spin text-[#7A0C13]" />
          <span>Initializing room workspace…</span>
        </div>
      }
    >
      <RoomVisualizer embedded={false} />
      <Toaster position="bottom-right" />
    </Suspense>
  );
}
