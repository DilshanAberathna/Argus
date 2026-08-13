# Renders an optional OpenCV preview window with bounding boxes and a clickable STOP button for live face recognition sessions.

import sys

import cv2

MATCH_COLOR = (0, 200, 0)
UNKNOWN_COLOR = (0, 0, 220)
WINDOW_NAME = "ARGUS -- live preview (press q or ESC, or click STOP, to quit)"

STOP_BUTTON_COLOR = (60, 60, 220)
STOP_BUTTON_SIZE = (100, 40)
STOP_BUTTON_MARGIN = 14


class StopButton:
    def __init__(self):
        self.clicked = False
        self._rect = None

    def draw(self, frame):
        h, w = frame.shape[:2]
        bw, bh = STOP_BUTTON_SIZE
        x2 = w - STOP_BUTTON_MARGIN
        x1 = x2 - bw
        y1 = STOP_BUTTON_MARGIN
        y2 = y1 + bh
        self._rect = (x1, y1, x2, y2)

        cv2.rectangle(frame, (x1, y1), (x2, y2), STOP_BUTTON_COLOR, -1)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 255, 255), 1)
        text = "STOP"
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.putText(
            frame,
            text,
            (x1 + (bw - tw) // 2, y1 + (bh + th) // 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            2,
        )
        return frame

    def _on_mouse(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN and self._rect is not None:
            x1, y1, x2, y2 = self._rect
            if x1 <= x <= x2 and y1 <= y <= y2:
                self.clicked = True

    def attach(self, window_name: str = WINDOW_NAME) -> None:
        cv2.setMouseCallback(window_name, self._on_mouse)

NO_DISPLAY_MESSAGE = (
    "No display detected -- --preview needs a real screen to draw a window on. "
    "Confirmed empirically while building this: on some OpenCV builds (Qt-backed), "
    "calling imshow() with no display doesn't raise a normal, catchable error -- it "
    "hard-crashes the whole process. This check exists specifically to avoid that. "
    "If you're on SSH, reconnect with X11 forwarding (ssh -X); on a headless server "
    "or container, drop --preview and use the JSON output instead."
)


def display_available() -> bool:
    if sys.platform.startswith("linux"):
        import os

        return bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
    return True


def draw_annotations(frame, results):
    annotated = frame.copy()
    for r in results:
        bbox = r.get("bbox")
        if not bbox:
            continue
        x1, y1, x2, y2 = (int(v) for v in bbox)
        matched = r.get("status") == "matched"
        color = MATCH_COLOR if matched else UNKNOWN_COLOR
        confidence = r.get("confidence", 0.0)
        label = f"{r['name']} {confidence:.2f}" if matched else f"unknown {confidence:.2f}"

        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        label_top = max(0, y1 - th - baseline - 6)
        cv2.rectangle(annotated, (x1, label_top), (x1 + tw + 8, y1), color, -1)
        cv2.putText(annotated, label, (x1 + 4, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    return annotated


def show_frame(frame, wait_ms: int = 1) -> bool:
    try:
        cv2.imshow(WINDOW_NAME, frame)
        key = cv2.waitKey(wait_ms) & 0xFF
    except cv2.error as e:
        raise RuntimeError(
            "Could not open a preview window -- this needs a real display. If "
            "you're on SSH, make sure X11 forwarding is enabled (ssh -X); "
            "otherwise drop --preview to run headless (JSON only, no window)."
        ) from e
    return key not in (ord("q"), 27)


def close() -> None:
    cv2.destroyAllWindows()
