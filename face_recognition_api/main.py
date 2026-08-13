# FastAPI bridge that receives case images and videos, registers face embeddings via the ArcFace engine, and saves vectors to Firebase Firestore.

import os, sys, shutil, tempfile
import cv2, numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List

MODEL_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Face recognition Model"))
if MODEL_FOLDER not in sys.path:
    sys.path.insert(0, MODEL_FOLDER)

from engine import FaceRecognitionEngine
from firebase_service import save_embedding

engine = FaceRecognitionEngine()

app = FastAPI(title="ARGUS Face Recognition Bridge", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _decode_image(image_bytes: bytes) -> np.ndarray:
    nparr = np.frombuffer(image_bytes, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)


def run_model_on_image(image_bytes: bytes, filename: str, case_id: str, name: str) -> dict:
    img = _decode_image(image_bytes)
    if img is None:
        return {"filename": filename, "status": "error", "result": "Could not decode image."}

    result = engine.register_face(img, case_id, name=name, source_image=filename)

    if result.get("status") == "registered":
        vector = engine.get_embedding(img)
        if vector is not None:
            result["firebase_saved"] = save_embedding(
                case_id=case_id, name=name, vector=vector.tolist(),
                source=filename, embedding_id=result.get("embedding_id", 0),
                total_samples=result.get("total_samples", 1),
            )
        else:
            result["firebase_saved"] = False

    return {"filename": filename, "status": result.get("status", "unknown"), "result": result}


def run_model_on_video(video_path: str, filename: str, case_id: str, name: str) -> dict:
    FRAME_SAMPLE_INTERVAL = 10
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"filename": filename, "status": "error", "result": f"Could not open video: {video_path}"}

    frame_results = []
    frame_index = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_index % FRAME_SAMPLE_INTERVAL == 0:
                source_tag = f"{filename}::frame{frame_index}"
                result = engine.register_face(frame, case_id, name=name, source_image=source_tag)

                if result.get("status") == "registered":
                    firebase_ok = False
                    vector = engine.get_embedding(frame)
                    if vector is not None:
                        firebase_ok = save_embedding(
                            case_id=case_id, name=name, vector=vector.tolist(),
                            source=source_tag, embedding_id=result.get("embedding_id", 0),
                            total_samples=result.get("total_samples", 1),
                        )
                    frame_results.append({
                        "frame": frame_index,
                        "status": result["status"],
                        "embedding_id": result.get("embedding_id"),
                        "firebase_saved": firebase_ok,
                    })

            frame_index += 1
    finally:
        cap.release()

    return {
        "filename": filename, "status": "ok",
        "total_frames_scanned": frame_index,
        "frames_registered": len(frame_results),
        "result": frame_results,
    }


@app.get("/health")
async def health_check():
    persons = engine.list_persons()
    return {"status": "ok", "enrolled_persons": len(persons)}


@app.post("/process-images")
async def process_images(
    files: List[UploadFile] = File(...),
    case_id: str = Form(...),
    name: str = Form(...)
):
    results = []
    for upload_file in files:
        if not (upload_file.content_type or "").startswith("image/"):
            results.append({"filename": upload_file.filename, "status": "error", "result": "Not an image file."})
            continue
        try:
            image_bytes = await upload_file.read()
            results.append(run_model_on_image(image_bytes, upload_file.filename, case_id=case_id, name=name))
        except Exception as e:
            results.append({"filename": upload_file.filename, "status": "error", "result": str(e)})

    registered = sum(1 for r in results if r.get("status") == "registered")
    return {"case_id": case_id, "results": results, "total_files": len(results), "registered": registered}


@app.post("/process-video")
async def process_video(
    file: UploadFile = File(...),
    case_id: str = Form(...),
    name: str = Form(...)
):
    if not (file.content_type or "").startswith("video/"):
        raise HTTPException(status_code=400, detail="Not a video file.")

    tmp_dir = tempfile.mkdtemp()
    tmp_path = os.path.join(tmp_dir, file.filename)

    try:
        with open(tmp_path, "wb") as f:
            f.write(await file.read())
        return run_model_on_video(tmp_path, file.filename, case_id=case_id, name=name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/persons")
async def list_persons():
    try:
        persons = engine.list_persons()
        return {"persons": persons, "total": len(persons)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
