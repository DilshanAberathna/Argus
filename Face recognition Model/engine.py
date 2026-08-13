import numpy as np

import config
from detector.scrfd_detector import SCRFDDetector
from recognizer.arcface_model import ArcFaceRecognizer
from database.embedding_store import EmbeddingStore
from matching.faiss_search import FaissMatcher


def _bbox_area(bbox) -> float:
    x1, y1, x2, y2 = bbox
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)


class FaceRecognitionEngine:
    def __init__(
        self,
        db_path: str = None,
        index_path: str = None,
        model_pack: str = None,
        recognition_threshold: float = None,
        auto_sync_index: bool = True,
    ):
        self.threshold = (
            recognition_threshold if recognition_threshold is not None else config.RECOGNITION_THRESHOLD
        )

        self.detector = SCRFDDetector(pack_name=model_pack)
        self.recognizer = ArcFaceRecognizer(pack_name=model_pack)
        self.store = EmbeddingStore(db_path)
        self.matcher = FaissMatcher(dim=config.EMBEDDING_DIM, index_path=index_path)

        self._event_hooks = []  # see on_recognition() -- alert-system attachment point

        if auto_sync_index and self.matcher.size == 0 and self.store.count_embeddings() > 0:
            # FAISS index file missing/empty but SQLite already has data (e.g.
            # a fresh checkout paired with an existing metadata.db) -> rebuild.
            self.matcher.rebuild_from_store(self.store)

    # -- Core reusable functions (per project spec section 9) ---------------

    def register_face(
        self, image: np.ndarray, person_id: str, name: str = None, source_image: str = None
    ) -> dict
        faces = self.detector.detect_faces(image)
        if not faces:
            return {"status": "error", "message": "No face detected in image."}

        face = max(faces, key=lambda f: _bbox_area(f["bbox"]))
        multi_face_warning = len(faces) > 1

        aligned = self.detector.align_face(image, face["kps"])
        embedding = self.recognizer.get_embedding(aligned)

        if not self.store.person_exists(person_id):
            if not name:
                return {
                    "status": "error",
                    "message": f"person_id '{person_id}' is new and requires a name.",
                }
            self.store.add_person(person_id, name)

        embedding_id = self.store.add_embedding(person_id, embedding, source_image=source_image)
        self.matcher.add(embedding_id, embedding)
        self.matcher.save()

        person = self.store.get_person(person_id)
        result = {
            "status": "registered",
            "person_id": person_id,
            "name": person["name"],
            "embedding_id": embedding_id,
            "total_samples": person["num_samples"],
            "faces_detected_in_image": len(faces),
        }
        if multi_face_warning:
            result["warning"] = (
                f"{len(faces)} faces were detected in the image; the largest one was used for enrollment."
            )
        return result

    def recognize_face(self, image: np.ndarray, top_k: int = None, threshold: float = None) -> list:
        """
        Detect every face in `image` and try to identify each one.

        Returns a list with one result dict per detected face (empty list if
        no face was found), each shaped like:
            matched: {"person_id", "name", "confidence", "status": "matched", "bbox", "det_score"}
            unknown: {"status": "unknown", "confidence", "bbox", "det_score"}

        Design note vs. the spec's output example: the brief's example shows
        a single flat dict. That is exactly what you get back for a
        single-face image -- it's results[0]. recognize_face() returns a
        list rather than a bare dict so multi-face frames (webcam, group
        photos) are handled without a second function; register.py /
        recognize.py print this list as-is. Unwrap results[0] yourself if
        you know you're only ever dealing with single-face images.
        """
        threshold = self.threshold if threshold is None else threshold
        top_k = top_k or config.SEARCH_TOP_K

        faces = self.detector.detect_faces(image)
        results = []
        for face in faces:
            aligned = self.detector.align_face(image, face["kps"])
            embedding = self.recognizer.get_embedding(aligned)
            result = self._identify(embedding, top_k, threshold)
            result["bbox"] = [float(v) for v in face["bbox"]]
            result["det_score"] = round(face["det_score"], 4)
            results.append(result)
            for hook in self._event_hooks:
                hook(result)
        return results

    def get_embedding(self, image: np.ndarray) -> np.ndarray:
        """
        Full pipeline shortcut: detect -> align -> embed, for the single
        largest face in `image`. Returns a unit-length 512-D vector, or None
        if no face was found. Useful when you just need a raw embedding
        (e.g. for offline analysis or to feed compare_faces()) without
        touching the database at all.
        """
        faces = self.detector.detect_faces(image)
        if not faces:
            return None
        face = max(faces, key=lambda f: _bbox_area(f["bbox"]))
        aligned = self.detector.align_face(image, face["kps"])
        return self.recognizer.get_embedding(aligned)

    @staticmethod
    def compare_faces(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """
        Pure verification utility: cosine similarity between two embeddings,
        independent of anything stored in the database. Use this for 1:1
        "are these the same person?" checks (e.g. ID document vs. selfie).
        Use recognize_face() for 1:N "who is this?" identification against
        the enrolled gallery.
        """
        e1 = np.asarray(embedding1, dtype=np.float32)
        e2 = np.asarray(embedding2, dtype=np.float32)
        denom = np.linalg.norm(e1) * np.linalg.norm(e2)
        if denom == 0:
            return 0.0
        return float(np.dot(e1, e2) / denom)

    # -- Internal -------------------------------------------------------

    def _identify(self, embedding: np.ndarray, top_k: int, threshold: float) -> dict:
        matches = self.matcher.search(embedding, top_k)
        best_person_id, best_score = None, -1.0
        for embedding_id, score in matches:
            person_id = self.store.get_person_by_embedding_id(embedding_id)
            if person_id is not None and score > best_score:
                best_person_id, best_score = person_id, score

        if best_person_id is not None and best_score >= threshold:
            person = self.store.get_person(best_person_id)
            return {
                "person_id": best_person_id,
                "name": person["name"],
                "confidence": round(best_score, 4),
                "status": "matched",
            }
        return {"status": "unknown", "confidence": round(max(best_score, 0.0), 4)}

    # -- Admin / management -----------------------------------------------

    def list_persons(self) -> list:
        return self.store.list_persons()

    def delete_person(self, person_id: str) -> None:
        self.store.delete_person(person_id)
        self.matcher.rebuild_from_store(self.store)

    def rebuild_index(self) -> int:
        """Force a full FAISS rebuild from SQLite. Safe to call any time."""
        return self.matcher.rebuild_from_store(self.store)

    # -- Future integration: alert-system hook -----------------------------

    def on_recognition(self, callback) -> None:
        """
        Register a callback(result_dict) invoked after every face processed
        by recognize_face() (matched or unknown). This is the intended
        attachment point for an alert system (e.g. flag on 'unknown', or on
        a specific watch-listed person_id) without modifying this class.
        """
        self._event_hooks.append(callback)
