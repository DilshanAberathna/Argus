# Saves ArcFace face embedding vectors to Firebase Firestore via REST API under person_embeddings/{caseId}/samples.

import datetime, httpx
from typing import List

PROJECT_ID = "argus-17702"
API_KEY    = "AIzaSyAhRtC8YU4pJ5g9KZ07cKXDqr4lLOCnNOs"
FIRESTORE_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"


def _val(v):
    if v is None:          return {"nullValue": None}
    if isinstance(v, bool):  return {"booleanValue": v}
    if isinstance(v, int):   return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str):   return {"stringValue": v}
    if isinstance(v, list):  return {"arrayValue": {"values": [_val(i) for i in v]}}
    if isinstance(v, dict):  return {"mapValue": {"fields": {k: _val(vv) for k, vv in v.items()}}}
    return {"stringValue": str(v)}


def _doc(data: dict) -> dict:
    return {"fields": {k: _val(v) for k, v in data.items()}}


def save_embedding(case_id: str, name: str, vector: List[float], source: str, embedding_id: int, total_samples: int) -> bool:
    now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    summary_url = f"{FIRESTORE_BASE}/person_embeddings/{case_id}?key={API_KEY}"
    sample_url  = f"{FIRESTORE_BASE}/person_embeddings/{case_id}/samples?documentId={embedding_id}&key={API_KEY}"

    try:
        with httpx.Client(timeout=15.0) as client:
            client.patch(summary_url, json=_doc({
                "caseId": case_id, "name": name, "model": "ArcFace-512D",
                "total_samples": total_samples, "updatedAt": now,
            })).raise_for_status()

            client.post(sample_url, json=_doc({
                "caseId": case_id, "source": source, "vector": vector,
                "embeddingId": embedding_id, "registeredAt": now,
            })).raise_for_status()

        print(f"[Firebase] Saved embedding {embedding_id} for case {case_id}")
        return True

    except httpx.HTTPStatusError as e:
        print(f"[Firebase] HTTP {e.response.status_code} error: {e.response.text[:200]}")
        return False
    except Exception as e:
        print(f"[Firebase] Error: {e}")
        return False


def save_embeddings_batch(case_id: str, name: str, samples: list) -> dict:
    saved, failed = 0, 0
    for s in samples:
        ok = save_embedding(case_id=case_id, name=name, vector=s["vector"],
                            source=s["source"], embedding_id=s["embedding_id"],
                            total_samples=s["total_samples"])
        if ok: saved += 1
        else:  failed += 1
    return {"saved": saved, "failed": failed, "total": saved + failed}
