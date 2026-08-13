#!/usr/bin/env python3
# Terminal entry point for running face recognition on a static image, local camera, DroidCam, or RTSP stream.

import argparse
import json
import sys
import time

import cv2

import camera_source
import config
import preview
from engine import FaceRecognitionEngine


def run_on_image(engine: FaceRecognitionEngine, path: str, threshold: float, show_preview: bool = False) -> None:
    img = cv2.imread(path)
    if img is None:
        print(json.dumps({"status": "error", "message": f"Could not read image: {path}"}))
        return
    t0 = time.time()
    results = engine.recognize_face(img, threshold=threshold)
    elapsed_ms = (time.time() - t0) * 1000
    output = {"source": path, "processing_time_ms": round(elapsed_ms, 1), "faces": results}
    print(json.dumps(output, indent=2))

    if show_preview:
        if not preview.display_available():
            print(f"[recognize] {preview.NO_DISPLAY_MESSAGE}", file=sys.stderr)
        else:
            annotated = preview.draw_annotations(img, results)
            print("[recognize] showing preview -- press any key (window focused) to close it.", file=sys.stderr)
            try:
                preview.show_frame(annotated, wait_ms=0)
            except RuntimeError as e:
                print(f"[recognize] {e}", file=sys.stderr)
            finally:
                preview.close()


def run_on_camera(
    engine: FaceRecognitionEngine,
    source,
    threshold: float,
    show_preview: bool = False,
    stop_on_match: bool = False,
) -> dict:
    cap = camera_source.open_capture(source, config.WEBCAM_FRAME_WIDTH, config.WEBCAM_FRAME_HEIGHT)
    if not cap.isOpened():
        print(json.dumps({"status": "error", "message": f"Could not open camera source: {source}"}))
        return {"reason": "camera_unavailable"}

    if show_preview and not preview.display_available():
        print(f"[recognize] {preview.NO_DISPLAY_MESSAGE}", file=sys.stderr)
        show_preview = False

    stop_button = preview.StopButton() if show_preview else None
    window_ready = False

    stop_bits = []
    if show_preview:
        stop_bits.append("'q'/ESC or the STOP button in the preview window")
    stop_bits.append("Ctrl+C")
    if stop_on_match:
        stop_bits.append("automatically as soon as someone is identified")
    print(f"[recognize] streaming from {source}. Stops on: {', '.join(stop_bits)}.", file=sys.stderr)

    outcome = {"reason": "eof"}
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print(json.dumps({"status": "error", "message": "Frame grab failed"}))
                break
            t0 = time.time()
            results = engine.recognize_face(frame, threshold=threshold)
            elapsed = time.time() - t0
            fps = round(1.0 / elapsed, 2) if elapsed > 0 else None
            print(
                json.dumps(
                    {
                        "fps": fps,
                        "processing_time_ms": round(elapsed * 1000, 1),
                        "faces": results,
                    }
                )
            )

            if show_preview:
                annotated = preview.draw_annotations(frame, results)
                stop_button.draw(annotated)
                try:
                    keep_going = preview.show_frame(annotated, wait_ms=1)
                    if not window_ready:
                        stop_button.attach()
                        window_ready = True
                except RuntimeError as e:
                    print(f"[recognize] {e}", file=sys.stderr)
                    outcome = {"reason": "user_stop"}
                    break
                if stop_button.clicked:
                    print("[recognize] STOP button clicked.", file=sys.stderr)
                    outcome = {"reason": "user_stop"}
                    break
                if not keep_going:
                    print("[recognize] preview window closed by user.", file=sys.stderr)
                    outcome = {"reason": "user_stop"}
                    break

            if stop_on_match:
                matched = next((r for r in results if r.get("status") == "matched"), None)
                if matched:
                    print(
                        f"[recognize] identified {matched['name']} ({matched['person_id']}), "
                        f"confidence {matched['confidence']} -- stopping.",
                        file=sys.stderr,
                    )
                    outcome = {"reason": "matched", "match": matched}
                    break
    except KeyboardInterrupt:
        print("\n[recognize] stopped.", file=sys.stderr)
        outcome = {"reason": "user_stop"}
    finally:
        cap.release()
        if show_preview:
            preview.close()
    return outcome


def main(argv=None):
    parser = argparse.ArgumentParser(description="Recognize faces via ARGUS.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--image", metavar="PATH", help="Path to a single image file")
    source.add_argument(
        "--camera",
        nargs="?",
        const=str(config.DEFAULT_CAMERA_INDEX),
        type=str,
        metavar="INDEX_OR_URL",
        help="Local camera index (default 0), or a stream URL (DroidCam/RTSP/etc.) / local video file",
    )
    source.add_argument(
        "--droidcam",
        metavar="IP[:PORT]",
        help="Shorthand for a DroidCam WiFi feed -- phone's IP, port defaults to 4747",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=None,
        help=f"Override the cosine similarity match threshold (default {config.RECOGNITION_THRESHOLD})",
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Open a window showing the feed with bounding boxes and match labels (needs a real display)",
    )
    parser.add_argument(
        "--stop-on-match",
        action="store_true",
        help="End the session automatically as soon as any face is identified, instead of running until Ctrl+C",
    )
    args = parser.parse_args(argv)

    engine = FaceRecognitionEngine()

    if args.image:
        run_on_image(engine, args.image, args.threshold, show_preview=args.preview)
    else:
        source = camera_source.droidcam_url(args.droidcam) if args.droidcam else camera_source.resolve_source(args.camera)
        outcome = run_on_camera(engine, source, args.threshold, show_preview=args.preview, stop_on_match=args.stop_on_match)
        if outcome.get("reason") == "camera_unavailable":
            sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        import os

        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(1)
