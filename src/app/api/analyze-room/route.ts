import { NextRequest, NextResponse } from "next/server";
import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

export const maxDuration = 180;

// Keep every stage inside the request deadline. Previously the route could wait
// 90 seconds for an offline service and then launch a local analysis allowed to
// run another 180 seconds, guaranteeing that the browser timed out first.
const ANALYSIS_BUDGET_MS = 172_000;
const MIN_USEFUL_CLI_BUDGET_MS = 20_000;

const execFileAsync = promisify(execFile);
let cachedPythonBin: string | null = null;
let cachedHasFullDeps = false;

function resolveAnalysisPython(scriptPath: string): string {
  if (
    cachedPythonBin &&
    cachedHasFullDeps &&
    (cachedPythonBin === "python3" || fs.existsSync(cachedPythonBin))
  ) {
    return cachedPythonBin;
  }

  const aiServiceDir = path.dirname(scriptPath);
  const candidates = Array.from(
    new Set([
      path.resolve(aiServiceDir, "venv/bin/python3"),
      "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3",
      "/opt/homebrew/bin/python3",
      "/usr/local/bin/python3",
      "python3",
    ])
  );

  for (const candidate of candidates) {
    if (candidate !== "python3" && !fs.existsSync(candidate)) continue;
    try {
      execFileSync(
        candidate,
        [
          "-c",
          "import importlib.util, sys; sys.exit(0 if all(importlib.util.find_spec(m) for m in ('torch', 'transformers', 'cv2')) else 1)",
        ],
        {
          stdio: "ignore",
          timeout: 12000,
        }
      );
      cachedPythonBin = candidate;
      cachedHasFullDeps = true;
      console.log(`[VIZDECK AI] Using Python interpreter: ${candidate}`);
      return candidate;
    } catch {
      // Try the next interpreter.
    }
  }

  const chosen = fs.existsSync(candidates[0]) ? candidates[0] : "python3";
  console.warn(`[VIZDECK AI] No Python interpreter with room-analysis dependencies found; falling back to: ${chosen}`);
  return chosen;
}

async function runLocalCliAnalysis(buffer: Buffer, originalName: string, timeoutMs: number) {
  if (process.env.DISABLE_LOCAL_AI_CLI === "true" || process.env.VERCEL === "1") {
    return null;
  }

  const candidateScripts = [
    path.resolve(process.cwd(), "ai-service/cli_analyze.py"),
    path.resolve(process.cwd(), "../ai-service/cli_analyze.py"),
  ];

  let scriptPath: string | null = null;
  for (const p of candidateScripts) {
    if (fs.existsSync(p)) {
      scriptPath = p;
      break;
    }
  }

  if (!scriptPath) {
    throw new Error("Local VIZDECK AI analysis script not found");
  }

  const tmpId = crypto.randomUUID();
  const ext = path.extname(originalName) || ".jpg";
  const preferredUploadDir = path.resolve(path.dirname(scriptPath), "generated_images");
  let uploadDir = path.join(os.tmpdir(), "vizdeck-ai");
  try {
    if (!fs.existsSync(preferredUploadDir)) {
      fs.mkdirSync(preferredUploadDir, { recursive: true });
    }
    fs.accessSync(preferredUploadDir, fs.constants.W_OK);
    uploadDir = preferredUploadDir;
  } catch {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  }
  const tmpFilePath = path.join(uploadDir, `room_upload_${tmpId}${ext}`);

  await fs.promises.writeFile(tmpFilePath, buffer);

  const pythonBin = resolveAnalysisPython(scriptPath);

  try {
    const { stdout } = await execFileAsync(pythonBin, [scriptPath, tmpFilePath], {
      maxBuffer: 25 * 1024 * 1024,
      timeout: timeoutMs,
    });

    const lines = stdout.trim().split("\n");
    let jsonLine = "";
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("{") && line.endsWith("}")) {
        jsonLine = line;
        break;
      }
    }
    if (!jsonLine) {
      jsonLine = lines[lines.length - 1];
    }
    return JSON.parse(jsonLine);
  } finally {
    try {
      await fs.promises.unlink(tmpFilePath);
    } catch {
      // ignore tmp cleanup error
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const analysisStartedAt = Date.now();
    const formData = await req.formData();

    if (formData.has("room_path")) {
      return NextResponse.json(
        { error: "Direct room_path is disabled for security. Please upload a room_image." },
        { status: 400 }
      );
    }

    const file = formData.get("room_image") as File | null;
    if (!file || !(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: "No room image provided" }, { status: 400 });
    }

    const filename = file.name || "room.jpg";
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    if (fileBuffer.length === 0) {
      return NextResponse.json({ error: "Room image buffer is empty" }, { status: 400 });
    }

    const inpaintExisting = formData.get("inpaint_existing_rug") === "true" ? "true" : "false";
    const candidateEndpoints = process.env.VISUALIZER_API_URL
      ? [`${process.env.VISUALIZER_API_URL.replace(/\/$/, "")}/api/analyze-room`]
      : [];

    let analysis: Record<string, unknown> | null = null;
    let lastUpstreamError: string | null = null;

    // 1. Try forwarding to standalone VIZDECK AI service
    for (const endpoint of candidateEndpoints) {
      try {
        const upstreamForm = new FormData();
        const blob = new Blob([fileBuffer], { type: file.type || "image/jpeg" });
        upstreamForm.append("room_image", blob, filename);
        upstreamForm.append("inpaint_existing_rug", inpaintExisting);

        const upstreamRes = await fetch(endpoint, {
          method: "POST",
          body: upstreamForm,
          signal: AbortSignal.timeout(Math.max(1_000, Math.min(150_000, ANALYSIS_BUDGET_MS - (Date.now() - analysisStartedAt)))),
        });

        if (upstreamRes.ok) {
          analysis = await upstreamRes.json();
          break;
        }
        let upstreamMsg = `HTTP ${upstreamRes.status}`;
        try {
          const errJson = await upstreamRes.json();
          if (errJson?.error) upstreamMsg = `${upstreamMsg}: ${errJson.error}`;
        } catch {
          // ignore non-JSON body
        }
        lastUpstreamError = upstreamMsg;
        console.warn(`[VIZDECK AI] Upstream ${endpoint} returned ${upstreamMsg}`);
      } catch (upErr: unknown) {
        lastUpstreamError = upErr instanceof Error ? upErr.message : String(upErr);
        console.warn(`[VIZDECK AI] Upstream ${endpoint} failed:`, lastUpstreamError);
      }
    }

    // 2. Fallback to local bundled AI analysis CLI if upstream service is not running (non-Vercel)
    let lastCliError: string | null = null;
    if (!analysis && process.env.VERCEL !== "1" && process.env.DISABLE_LOCAL_AI_CLI !== "true") {
      try {
        const remainingBudgetMs = ANALYSIS_BUDGET_MS - (Date.now() - analysisStartedAt);
        if (remainingBudgetMs < MIN_USEFUL_CLI_BUDGET_MS) {
          throw new Error("Room analysis service did not respond with enough time remaining for local fallback");
        }
        analysis = await runLocalCliAnalysis(fileBuffer, filename, remainingBudgetMs);
      } catch (cliErr: unknown) {
        console.error("Local VIZDECK AI CLI runner failed:", cliErr);
        lastCliError = cliErr instanceof Error ? cliErr.message : String(cliErr);
      }
    }

    if (!analysis || typeof analysis !== "object") {
      const detail = lastUpstreamError || lastCliError;
      return NextResponse.json(
        {
          error: detail
            ? `AI room analysis failed: ${detail.slice(0, 180)}`
            : "AI room analysis service unavailable. Switching to perspective placement mode.",
        },
        { status: 503 }
      );
    }

    const rewriteAssetUrl = (key: string) => {
      const val = analysis?.[key];
      if (typeof val === "string") {
        const parts = val.split("/");
        const assetFile = parts[parts.length - 1];
        if (/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/.test(assetFile)) {
          analysis![key] = `/api/visualizer-images/${assetFile}`;
        }
      }
    };

    rewriteAssetUrl("occlusion_mask_url");
    rewriteAssetUrl("floor_support_mask_url");
    rewriteAssetUrl("debug_overlay_url");
    rewriteAssetUrl("clean_floor_url");

    return NextResponse.json(analysis);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Analysis request failed";
    console.error("VIZDECK room analysis route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
