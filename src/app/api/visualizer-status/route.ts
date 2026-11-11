import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const apiUrl = process.env.VISUALIZER_API_URL?.replace(/\/$/, "");
  let aiBackendHealthy = false;

  if (apiUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const response = await fetch(`${apiUrl}/health`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      aiBackendHealthy = response.ok;
    } catch {
      aiBackendHealthy = false;
    }
  }

  const localAiCli = fs.existsSync(path.resolve(process.cwd(), "ai-service/cli_analyze.py"));

  return NextResponse.json(
    {
      available: true,
      mode: "native-webgl",
      engine: "VIZDECK Spatial Engine",
      aiAnalysis: aiBackendHealthy ? "service" : localAiCli ? "local-cli" : "perspective-fallback",
    },
    { status: 200 }
  );
}
