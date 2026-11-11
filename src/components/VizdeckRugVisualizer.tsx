"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useState } from "react";
import { ArrowUpRight, LoaderCircle, Play, Sparkles, X } from "lucide-react";
import { Toaster } from "react-hot-toast";

const RoomVisualizer = dynamic(
  () => import("@/components/visualizer/RoomVisualizer"),
  {
    ssr: false,
    loading: () => (
      <div className="v-visualizer-shell__loading" aria-live="polite">
        <LoaderCircle size={20} />
        <span>Loading VIZDECK interactive room canvas…</span>
      </div>
    ),
  }
);

export function VizdeckRugVisualizer({ className = "" }: { className?: string }) {
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <section
      className={`v-visualizer-shell ${className}`.trim()}
      aria-label="VIZDECK interactive rug visualizer"
    >
      <div className="v-visualizer-shell__bar">
        <div>
          <span className="v-visualizer-shell__eyebrow">
            {editorOpen ? "Live room editor" : "Interactive room preview"}
          </span>
          <strong>VIZDECK Rug Visualizer</strong>
        </div>
        <div className="v-visualizer-shell__actions">
          <span className="v-visualizer-shell__status is-ready">
            {editorOpen ? "Live editor active" : "Ready in preview"}
          </span>
          <button
            type="button"
            onClick={() => setEditorOpen((prev) => !prev)}
            className={`v-visualizer-shell__open ${
              editorOpen ? "" : "v-visualizer-shell__open--accent"
            }`.trim()}
          >
            {editorOpen ? (
              <>
                <X size={12} /> Exit editor
              </>
            ) : (
              <>
                <Play size={11} /> Launch Live Editor
              </>
            )}
          </button>
          <Link href="/visualizer/room" className="v-visualizer-shell__open">
            Open full screen <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>

      <div className="v-visualizer-shell__frame-wrap">
        {!editorOpen ? (
          <div className="v-visualizer-shell__preview">
            <div className="v-visualizer-shell__preview-top">
              <span>YOUR ROOM</span>
              <span>RUG PREVIEW</span>
            </div>
            <div className="v-visualizer-shell__preview-card">
              <span className="v-visualizer-shell__preview-icon">
                <Sparkles size={15} />
              </span>
              <div>
                <strong>AI floor plane & furniture occlusion</strong>
                <p>
                  Upload your room photograph or choose one of 7 curated rooms inside
                  the studio editor.
                </p>
              </div>
            </div>
            <div className="v-visualizer-shell__preview-product">
              <span>SELECTED RUG</span>
              <strong>Navy Medallion</strong>
              <small>8 × 10 ft · Scale ready</small>
            </div>
            <div className="v-visualizer-shell__preview-caption">
              <span>Preview mode</span>
              <p>
                Open the live interactive WebGL studio to test rugs on real rooms with
                perspective sizing and export.
              </p>
              <button type="button" onClick={() => setEditorOpen(true)}>
                <Play size={12} /> Launch Live Editor
              </button>
            </div>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="v-visualizer-shell__loading" aria-live="polite">
                <LoaderCircle size={20} />
                <span>Preparing the live room editor…</span>
              </div>
            }
          >
            <RoomVisualizer
              embedded={true}
              onExit={() => setEditorOpen(false)}
            />
          </Suspense>
        )}
      </div>

      <div className="v-visualizer-shell__footer">
        <p>
          Open the live editor to upload your own room or pick from 7 sample spaces, place
          any rug in perspective, adjust rotation or real dimensions, compare before/after,
          and save a preview image.
        </p>
        <span>Native WebGL engine</span>
      </div>
      <Toaster position="bottom-right" />
    </section>
  );
}
