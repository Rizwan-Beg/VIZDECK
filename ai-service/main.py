import os
from fastapi import FastAPI, File, Form, UploadFile, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="VIZDECK Spatial Room Analyzer API",
    description="Panoptic room segmentation, floor plane geometry, and furniture occlusion API for VIZDECK Rug Visualizer",
    version="1.0",
)

allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3005",
    "http://127.0.0.1:3005",
]

frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    allowed_origins.extend([u.strip() for u in frontend_url.split(",") if u.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generated_images")
os.makedirs(OUTPUT_DIR, exist_ok=True)

app.mount("/images", StaticFiles(directory=OUTPUT_DIR), name="images")


@app.get("/")
def root():
    return {
        "message": "VIZDECK Spatial Room Analyzer API is running. Use POST /api/analyze-room or GET /health."
    }


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "vizdeck-room-analyzer"}


@app.post("/api/analyze-room")
async def analyze_room_endpoint(
    request: Request,
    room_image: UploadFile = File(...),
    inpaint_existing_rug: bool = Form(False),
):
    """
    Performs semantic floor segmentation, vanishing-ray perspective calibration,
    furniture occlusion mask generation, and anchor placement.
    """
    try:
        from room_analyzer import analyze_room_image

        content = await room_image.read()
        analysis = analyze_room_image(
            content, str(request.base_url), inpaint_existing_rug=inpaint_existing_rug
        )
        return JSONResponse(analysis)
    except Exception as e:
        import traceback

        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)
