# Wraps InsightFace's ArcFace model to extract and L2-normalize a 512-D embedding from an aligned face crop.

import contextlib
import glob
import io
import os.path as osp

import numpy as np
from insightface.model_zoo import model_zoo

import config


class ArcFaceRecognizer:
    def __init__(self, pack_name: str = None, ctx_id: int = None, providers: list = None):
        self.ctx_id = ctx_id if ctx_id is not None else config.CTX_ID
        self.providers = providers or config.ORT_PROVIDERS

        pack_dir = config.get_pack_dir(pack_name)
        self.model = self._load_recognition_model(pack_dir)
        self.model.prepare(ctx_id=self.ctx_id)
        self._expected_hw = (config.ALIGNED_FACE_SIZE, config.ALIGNED_FACE_SIZE)

    def _load_recognition_model(self, pack_dir: str):
        onnx_files = sorted(glob.glob(osp.join(pack_dir, "**", "*.onnx"), recursive=True))
        for onnx_path in onnx_files:
            with contextlib.redirect_stdout(io.StringIO()):
                model = model_zoo.get_model(onnx_path, providers=self.providers)
            if model is not None and getattr(model, "taskname", None) == "recognition":
                return model
        raise RuntimeError(
            f"No recognition model (taskname == 'recognition') found in model pack at "
            f"'{pack_dir}'. Contents: {[osp.basename(f) for f in onnx_files]}"
        )

    def get_embedding(self, aligned_face: np.ndarray) -> np.ndarray:
        if aligned_face is None:
            raise ValueError("get_embedding() received aligned_face=None.")
        if aligned_face.shape[:2] != self._expected_hw:
            raise ValueError(
                f"Expected an aligned face of size {self._expected_hw}, got "
                f"{aligned_face.shape[:2]}. Did you call detector.align_face() first?"
            )
        raw = self.model.get_feat(aligned_face).flatten().astype(np.float32)
        norm = np.linalg.norm(raw)
        if norm == 0:
            raise ValueError("Degenerate all-zero embedding produced -- check input image quality.")
        return raw / norm

    def get_embeddings_batch(self, aligned_faces: list) -> np.ndarray:
        raw = self.model.get_feat(aligned_faces).astype(np.float32)
        norms = np.linalg.norm(raw, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return raw / norms
