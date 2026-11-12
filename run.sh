#!/usr/bin/env bash
# Simple steps to run VIZDECK AI on your Mac and connect it to Vercel

# --- Terminal 1: Start AI Backend ---
cd /Users/rizwan/Desktop/VIZDECK/ai-service
source venv/bin/activate
python -c "import scipy" 2>/dev/null || python -m pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 &
AI_PID=$!

trap 'kill $AI_PID 2>/dev/null || true' INT TERM EXIT

# --- Terminal 2 (runs in foreground): Start Cloudflare Tunnel ---
# Copy the https://...trycloudflare.com URL printed below, then:
#   Vercel -> Project Settings -> Environment Variables -> VISUALIZER_API_URL = <URL> -> Redeploy
cloudflared tunnel --url http://localhost:8000
