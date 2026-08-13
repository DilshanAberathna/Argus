# Resolves and opens video sources (local camera, DroidCam, RTSP, HTTP, or file) for use by the recognition and registration pipeline.

import cv2

import config


def droidcam_url(host_spec: str, path: str = "video") -> str:
    if ":" in host_spec:
        host, port = host_spec.split(":", 1)
    else:
        host, port = host_spec, config.DROIDCAM_DEFAULT_PORT
    return f"http://{host}:{port}/{path}"


def resolve_source(spec):
    if spec is None:
        return config.DEFAULT_CAMERA_INDEX
    try:
        return int(spec)
    except (TypeError, ValueError):
        return spec


def is_network_source(source) -> bool:
    return isinstance(source, str) and "://" in source


def open_capture(source, width: int = None, height: int = None) -> cv2.VideoCapture:
    cap = cv2.VideoCapture()
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if is_network_source(source):
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, config.NETWORK_CAMERA_OPEN_TIMEOUT_MS)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, config.NETWORK_CAMERA_READ_TIMEOUT_MS)
    cap.open(source)
    if cap.isOpened():
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if width:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        if height:
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    return cap
