# Wraps InsightFace's SCRFD model to detect faces and produce aligned 112x112 crops ready for ArcFace embedding.

import contextlib
import glob
import io
import os.path as osp

import numpy as np
from insightface.model_zoo import model_zoo
from insightface.utils import face_align

import config


class SCRFDDetector:
    def __init__(
        self,
        pack_name: str = None,
        det_thresh: float = None,
        det_size: tuple = None,
        ctx_id: int = None,
        providers: list = None,
    ):
        self.det_thresh = det_thresh if det_thresh is not None else config.DET_THRESH
        self.det_size = det_size or config.DET_SIZE
        self.ctx_id = ctx_id if ctx_id is not None else config.CTX_ID
        self.providers = providers or config.ORT_PROVIDERS

        pack_dir = config.get_pack_dir(pack_name)
        self.model = self._load_detection_model(pack_dir)
        self.model.prepare(
            ctx_id=self.ctx_id,
            det_thresh=self.det_thresh,
            nms_thresh=config.DET_NMS_THRESH,
            input_size=self.det_size,
        )

    def _load_detection_model(self, pack_dir: str):
        onnx_files = sorted(glob.glob(osp.join(pack_dir, "**", "*.onnx"), recursive=True))
        for onnx_path in onnx_files:
            with contextlib.redirect_stdout(io.StringIO()):
                model = model_zoo.get_model(onnx_path, providers=self.providers)
            if model is not None and getattr(model, "taskname", None) == "detection":
                return model
        raise RuntimeError(
            f"No detection model (taskname == 'detection') found in model pack at "
            f"'{pack_dir}'. Contents: {[osp.basename(f) for f in onnx_files]}"
        )

    def detect_faces(self, image: np.ndarray, max_num: int = None) -> list:
        if image is None:
            raise ValueError("detect_faces() received image=None -- did the image fail to load?")

        max_num = config.DET_MAX_FACES if max_num is None else max_num
        bboxes, kpss = self.model.detect(image, max_num=max_num)

        faces = []
        for i in range(bboxes.shape[0]):
            faces.append(
                {
                    "bbox": bboxes[i, :4],
                    "det_score": float(bboxes[i, 4]),
                    "kps": kpss[i] if kpss is not None else None,
                }
            )
        return faces

    def align_face(self, image: np.ndarray, kps: np.ndarray, image_size: int = None) -> np.ndarray:
        if kps is None:
            raise ValueError(
                "align_face() requires 5-point landmarks (kps) but got None. The "
                "configured detection model should always return them for buffalo_l/antelopev2."
            )
        image_size = image_size or config.ALIGNED_FACE_SIZE
        return face_align.norm_crop(image, landmark=kps, image_size=image_size)

    def detect_and_align(self, image: np.ndarray, max_num: int = None) -> list:
        faces = self.detect_faces(image, max_num=max_num)
        for face in faces:
            face["aligned"] = self.align_face(image, face["kps"])
        return faces
