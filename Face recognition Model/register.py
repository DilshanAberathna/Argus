#!/usr/bin/env python3
# Terminal entry point for enrolling a person's face into ARGUS from image files or live camera captures.

import argparse
import json
import sys
import time

import cv2

import camera_source
import config
from engine import FaceRecognitionEngine


def capture_from_webcam(source, num_samples: int, delay: float = 1.5) -> list:
    cap = camera_source.open_capture(source, config.WEBCAM_FRAME_WIDTH, config.WEBCAM_FRAME_HEIGHT)
    if not cap.isOpened():
        print(json.dumps({"status": "error", "message": f"Could not open camera source: {source}"}))
        sys.exit(1)

    for _ in range(5):
        cap.read()

    frames = []
    try:
        for i in range(num_samples):
            print(f"[register] capturing sample {i + 1}/{num_samples} in {delay:.1f}s ...", file=sys.stderr)
            time.sleep(delay)
            ok, frame = cap.read()
            if ok:
                frames.append(frame)
            else:
                print(f"[register] warning: failed to grab frame {i + 1}", file=sys.stderr)
    finally:
        cap.release()
    return frames


def main(argv=None):
    parser = argparse.ArgumentParser(description="Register a person's face(s) into ARGUS.")
    parser.add_argument("--id", dest="person_id", required=True, help="Unique person ID, e.g. P001")
    parser.add_argument("--name", required=True, help="Person's display name")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--images", nargs="+", metavar="PATH", help="One or more image file paths")
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
        "--num-samples",
        type=int,
        default=5,
        help="Number of frames to capture (ignored with --images)",
    )
    args = parser.parse_args(argv)

    engine = FaceRecognitionEngine()

    pairs = []
    if args.images:
        for path in args.images:
            img = cv2.imread(path)
            if img is None:
                print(json.dumps({"status": "error", "message": f"Could not read image: {path}"}))
                continue
            pairs.append((img, path))
    else:
        if args.droidcam:
            video_source = camera_source.droidcam_url(args.droidcam)
        else:
            video_source = camera_source.resolve_source(args.camera)
        for frame in capture_from_webcam(video_source, args.num_samples):
            pairs.append((frame, None))

    results = []
    for img, path in pairs:
        result = engine.register_face(img, args.person_id, name=args.name, source_image=path)
        results.append(result)

    print(json.dumps(results if len(results) != 1 else results[0], indent=2))


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        import os

        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(1)
