import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const execFileAsync = promisify(execFile);

async function runLocalCliAnalysis(buffer: Buffer, originalName: string) {
  if (process.env.DISABLE_LOCAL_AI_CLI === "true") {
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
  const uploadDir = path.resolve(path.dirname(scriptPath), "generated_images");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const tmpFilePath = path.join(uploadDir, `room_upload_${tmpId}${ext}`);

  await fs.promises.writeFile(tmpFilePath, buffer);

  const venvPython = path.resolve(path.dirname(scriptPath), "venv/bin/python3");
  const pythonBin = fs.existsSync(venvPython) ? venvPython : "python3";

  try {
    const { stdout } = await execFileAsync(pythonBin, [scriptPath, tmpFilePath], {
      maxBuffer: 25 * 1024 * 1024,
      timeout: 120000,
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
    const candidateEndpoints = [
      process.env.VISUALIZER_API_URL ? `${process.env.VISUALIZER_API_URL.replace(/\/$/, "")}/api/analyze-room` : null,
      "http://127.0.0.1:8000/api/analyze-room",
    ].filter(Boolean) as string[];

    let analysis: Record<string, unknown> | null = null;

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
          signal: AbortSignal.timeout(90000),
        });

        if (upstreamRes.ok) {
          analysis = await upstreamRes.json();
          break;
        }
      } catch {
        // Upstream unavailable; fall through to local CLI analysis
      }
    }

    // 2. Fallback to local bundled AI analysis CLI if upstream service is not running
    if (!analysis) {
      try {
        analysis = await runLocalCliAnalysis(fileBuffer, filename);
      } catch (cliErr: unknown) {
        console.error("Local VIZDECK AI CLI runner failed:", cliErr);
      }
    }

    if (!analysis || typeof analysis !== "object") {
      return NextResponse.json(
        { error: "AI room analysis service unavailable. Switching to perspective placement mode." },
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

