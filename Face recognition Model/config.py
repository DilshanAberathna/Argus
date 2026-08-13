import os
import warnings

import onnxruntime as ort

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODELS_ROOT = os.path.join(BASE_DIR, "models", "insightface_models")

DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

SQLITE_DB_PATH = os.path.join(DATA_DIR, "metadata.db")
FAISS_INDEX_PATH = os.path.join(DATA_DIR, "faiss.index")


MODEL_PACK_NAME = os.environ.get("ARGUS_MODEL_PACK", "buffalo_l")

EMBEDDING_DIM = 512
ALIGNED_FACE_SIZE = 112

# ---------------------------------------------------------------------------
# Compute provider (auto-detect GPU)
# ---------------------------------------------------------------------------
_AVAILABLE_PROVIDERS = ort.get_available_providers()
USE_GPU = "CUDAExecutionProvider" in _AVAILABLE_PROVIDERS
CTX_ID = 0 if USE_GPU else -1  # InsightFace convention: ctx_id < 0 means CPU
ORT_PROVIDERS = (
    ["CUDAExecutionProvider", "CPUExecutionProvider"] if USE_GPU else ["CPUExecutionProvider"]
)

# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------
DET_THRESH = 0.5       # SCRFD confidence threshold for a candidate box
DET_NMS_THRESH = 0.4   # non-max suppression IoU threshold
DET_SIZE = (640, 640)  # inference resolution; lower (e.g. 320x320) = faster, worse on small/far faces
DET_MAX_FACES = 0      # 0 = no cap, return every face found
RECOGNITION_THRESHOLD = float(os.environ.get("ARGUS_REC_THRESHOLD", 0.40))


SEARCH_TOP_K = 5

# ---------------------------------------------------------------------------
# Webcam / network camera source (see camera_source.py)
# ---------------------------------------------------------------------------
DEFAULT_CAMERA_INDEX = 0
WEBCAM_FRAME_WIDTH = 1280
WEBCAM_FRAME_HEIGHT = 720
DROIDCAM_DEFAULT_PORT = 4747


NETWORK_CAMERA_OPEN_TIMEOUT_MS = 5000
NETWORK_CAMERA_READ_TIMEOUT_MS = 5000


warnings.filterwarnings("ignore", message=".*SimilarityTransform.*", category=FutureWarning)


def get_pack_dir(pack_name: str = None, root: str = None) -> str:
    from insightface.utils import ensure_available

    pack_name = pack_name or MODEL_PACK_NAME
    root = root or MODELS_ROOT
    return ensure_available("models", pack_name, root=root)
