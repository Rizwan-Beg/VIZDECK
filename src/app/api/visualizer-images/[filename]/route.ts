import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    if (!filename || !/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/.test(filename)) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const contentType = filename.endsWith(".png") ? "image/png" : "image/jpeg";

    const candidateUrls = [
      process.env.VISUALIZER_API_URL ? `${process.env.VISUALIZER_API_URL.replace(/\/$/, "")}/images/${filename}` : null,
      `http://127.0.0.1:8000/images/${filename}`,
      `http://localhost:8000/images/${filename}`,
    ].filter(Boolean) as string[];

    for (const upstreamUrl of candidateUrls) {
      try {
        const res = await fetch(upstreamUrl, {
          signal: AbortSignal.timeout(3000),
          cache: "no-store",
        });

        if (res.ok) {
          const upstreamContentType = res.headers.get("content-type") || contentType;
          const arrayBuffer = await res.arrayBuffer();
          return new NextResponse(arrayBuffer, {
            status: 200,
            headers: {
              "Content-Type": upstreamContentType,
              "Cache-Control": "public, max-age=3600, immutable",
            },
          });
        }
      } catch {
        // Continue to next source
      }
    }

    const candidatePaths = [
      path.resolve(process.cwd(), "ai-service/generated_images", filename),
      path.resolve(process.cwd(), "public/visualizer-masks", filename),
      path.resolve(process.cwd(), "public/images", filename),
    ];

    for (const localPath of candidatePaths) {
      if (fs.existsSync(localPath)) {
        const fileBuffer = await fs.promises.readFile(localPath);
        return new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600, immutable",
          },
        });
      }
    }

    return NextResponse.json({ error: "Visualizer image not found" }, { status: 404 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to serve visualizer image";
    console.error("VIZDECK visualizer image proxy error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

