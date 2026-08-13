# Single entry point for ARGUS face recognition module, routing subcommands for registration, recognition, and live camera sessions.

import argparse
import json
import os
import sys

import cv2

import camera_source
import config
import register
import recognize
import check_camera
from engine import FaceRecognitionEngine

SUBCOMMANDS = ("register", "recognize", "check-camera", "list", "delete", "test", "demo", "setup")
RECOGNIZE_SOURCE_FLAGS = ("--image", "--camera", "--droidcam")


def cmd_list(argv):
    if argv:
        print("usage: argus.py list  (takes no arguments)", file=sys.stderr)
        sys.exit(2)
    engine = FaceRecognitionEngine()
    print(json.dumps(engine.list_persons(), indent=2, default=str))


def cmd_delete(argv):
    if len(argv) != 2 or argv[0] != "--id":
        print("usage: argus.py delete --id <person_id>", file=sys.stderr)
        sys.exit(2)
    person_id = argv[1]
    engine = FaceRecognitionEngine()
    if not engine.store.person_exists(person_id):
        print(json.dumps({"status": "error", "message": f"No such person_id: {person_id}"}))
        return
    engine.delete_person(person_id)
    print(json.dumps({"status": "deleted", "person_id": person_id}))


def cmd_test(argv):
    from tests import test_engine

    test_engine.main(argv)


def cmd_demo(argv):
    parser = argparse.ArgumentParser(
        prog="argus.py demo", description="Register from images, then watch live recognition with a preview window."
    )
    parser.add_argument("--id", dest="person_id", required=True, help="Unique person ID, e.g. P001")
    parser.add_argument("--name", required=True, help="Person's display name")
    parser.add_argument("--images", nargs="+", required=True, metavar="PATH", help="One or more enrollment photos")
    source = parser.add_mutually_exclusive_group()
    source.add_argument(
        "--camera",
        nargs="?",
        const=str(config.DEFAULT_CAMERA_INDEX),
        type=str,
        metavar="INDEX_OR_URL",
        help="Local camera index (default 0), or a stream URL / local video file",
    )
    source.add_argument("--droidcam", metavar="IP[:PORT]", help="DroidCam WiFi feed -- phone's IP, port defaults to 4747")
    parser.add_argument("--threshold", type=float, default=None, help="Override the match threshold")
    args = parser.parse_args(argv)

    engine = FaceRecognitionEngine()

    print(f"[demo] registering '{args.name}' ({args.person_id}) from {len(args.images)} image(s) ...", file=sys.stderr)
    for path in args.images:
        img = cv2.imread(path)
        if img is None:
            print(json.dumps({"status": "error", "message": f"Could not read image: {path}"}))
            continue
        result = engine.register_face(img, args.person_id, name=args.name, source_image=path)
        print(json.dumps(result, indent=2))
        if result.get("status") != "registered":
            print(f"[demo] warning: '{path}' did not register cleanly (see above).", file=sys.stderr)

    video_source = camera_source.droidcam_url(args.droidcam) if args.droidcam else camera_source.resolve_source(args.camera)
    print(f"[demo] registration done -- switching to live preview on {video_source} ...", file=sys.stderr)
    outcome = recognize.run_on_camera(engine, video_source, args.threshold, show_preview=True, stop_on_match=True)
    if outcome.get("reason") == "matched":
        m = outcome["match"]
        print(f"[demo] identified {m['name']} ({m['person_id']}), confidence {m['confidence']}. Done.", file=sys.stderr)


def _prompt_nonempty(prompt_text: str) -> str:
    while True:
        value = input(prompt_text).strip()
        if value:
            return value
        print("  (required -- try again)", file=sys.stderr)


def _prompt_images() -> list:
    print("Image path(s) to register -- one per line, blank line when done:", file=sys.stderr)
    images = []
    while True:
        path = input(f"  image {len(images) + 1}: ").strip()
        if not path:
            if images:
                return images
            print("  need at least one image before an empty line", file=sys.stderr)
            continue
        if not os.path.isfile(path):
            print(f"  '{path}' not found -- check the path and try again", file=sys.stderr)
            continue
        images.append(path)


def cmd_setup(argv):
    parser = argparse.ArgumentParser(
        prog="argus.py setup", description="Interactive: prompt for enrollment, then watch live with auto-stop-on-match."
    )
    parser.add_argument("--threshold", type=float, default=None, help="Override the match threshold")
    args = parser.parse_args(argv)

    print("=== ARGUS: interactive setup ===", file=sys.stderr)
    print(
        "Registers a person from photo(s), then switches to live camera/DroidCam\n"
        "recognition -- stops automatically the moment they're identified.\n",
        file=sys.stderr,
    )

    try:
        person_id = _prompt_nonempty("Person ID (e.g. P001): ")
        name = _prompt_nonempty("Person name: ")
        images = _prompt_images()
    except (EOFError, KeyboardInterrupt):
        print("\n[setup] cancelled -- no input received.", file=sys.stderr)
        return

    engine = FaceRecognitionEngine()

    print(f"\n[setup] registering '{name}' ({person_id}) from {len(images)} image(s) ...", file=sys.stderr)
    for path in images:
        img = cv2.imread(path)
        if img is None:
            print(json.dumps({"status": "error", "message": f"Could not read image: {path}"}))
            continue
        result = engine.register_face(img, person_id, name=name, source_image=path)
        print(json.dumps(result, indent=2))
        if result.get("status") != "registered":
            print(f"[setup] warning: '{path}' did not register cleanly (see above).", file=sys.stderr)

    try:
        droidcam_ip = input("\nDroidCam IP (blank to use the local camera instead): ").strip()
    except (EOFError, KeyboardInterrupt):
        droidcam_ip = ""
        print(file=sys.stderr)

    video_source = camera_source.droidcam_url(droidcam_ip) if droidcam_ip else camera_source.resolve_source(None)
    print(f"\n[setup] switching to live recognition on {video_source} ...", file=sys.stderr)
    outcome = recognize.run_on_camera(engine, video_source, args.threshold, show_preview=True, stop_on_match=True)

    if outcome.get("reason") == "matched":
        m = outcome["match"]
        print(f"\n[setup] done -- identified {m['name']} ({m['person_id']}), confidence {m['confidence']}.", file=sys.stderr)
    elif outcome.get("reason") == "camera_unavailable":
        print(
            f"\n[setup] '{name}' is registered, but the camera/DroidCam source could not be opened. "
            f"Try `python check_camera.py --droidcam <ip>` to debug the connection, then "
            f"`python argus.py recognize --droidcam <ip> --preview --stop-on-match` to pick up "
            f"where this left off -- the registration already succeeded and won't be lost.",
            file=sys.stderr,
        )


DISPATCH = {
    "register": register.main,
    "recognize": recognize.main,
    "check-camera": check_camera.main,
    "list": cmd_list,
    "delete": cmd_delete,
    "test": cmd_test,
    "demo": cmd_demo,
    "setup": cmd_setup,
}


def main():
    argv = sys.argv[1:]

    if argv and argv[0] in ("-h", "--help"):
        print(__doc__)
        return

    if argv and argv[0] in DISPATCH:
        DISPATCH[argv[0]](argv[1:])
        return

    if argv and not argv[0].startswith("-"):
        print(f"[argus] unknown command '{argv[0]}'. Available: {', '.join(SUBCOMMANDS)}", file=sys.stderr)
        print("[argus] or run with no arguments for the interactive setup flow.", file=sys.stderr)
        sys.exit(2)

    if not argv:
        cmd_setup([])
        return

    if not any(flag in argv for flag in RECOGNIZE_SOURCE_FLAGS):
        print(
            "[argus] no --image/--camera/--droidcam given -- defaulting to camera index 0. "
            "Use --image <path> to recognize a file instead, or --help for other commands.",
            file=sys.stderr,
        )
        argv = argv + ["--camera"]
    recognize.main(argv)


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        import os

        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(1)
