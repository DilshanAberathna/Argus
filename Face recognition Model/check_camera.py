#!/usr/bin/env python3
# Standalone tool to verify connectivity and frame readability of any camera source before starting a recognition session.

import argparse
import time

import camera_source


def check_one(source, label: str = None) -> bool:
    label = label or str(source)
    t0 = time.time()
    cap = camera_source.open_capture(source)
    elapsed = time.time() - t0
    if not cap.isOpened():
        print(f"[{label}] NOT AVAILABLE ({elapsed:.1f}s)")
        cap.release()
        return False
    ok, frame = cap.read()
    cap.release()
    if not ok:
        print(f"[{label}] opened but could not read a frame ({elapsed:.1f}s)")
        return False
    h, w = frame.shape[:2]
    print(f"[{label}] OK -- {w}x{h} frame in {elapsed:.1f}s")
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check whether a camera source is reachable.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--scan", action="store_true", help="Probe local device indices 0-4")
    group.add_argument("--camera", metavar="INDEX_OR_URL")
    group.add_argument("--droidcam", metavar="IP[:PORT]")
    args = parser.parse_args(argv)

    if args.scan:
        print("Scanning local device indices 0-4 ...")
        found_any = False
        for i in range(5):
            if check_one(i, label=f"index {i}"):
                found_any = True
        if not found_any:
            print(
                "\nNo local camera devices responded. If you're using DroidCam over "
                "WiFi, use --droidcam <phone-ip> instead of --scan."
            )
    elif args.droidcam:
        url = camera_source.droidcam_url(args.droidcam)
        ok = check_one(url, label=f"droidcam {args.droidcam}")
        if not ok:
            print(
                f"\nChecklist: is the DroidCam app open on the phone? Same WiFi network as "
                f"this machine? Is {args.droidcam.split(':')[0]} the IP shown in the app right "
                f"now (it changes if the phone reconnects to WiFi)? Try the URL directly in a "
                f"browser first: {url}"
            )
    else:
        check_one(camera_source.resolve_source(args.camera))


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        import os
        import sys

        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(1)
