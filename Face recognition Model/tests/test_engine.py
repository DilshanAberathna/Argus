#!/usr/bin/env python3
"""
tests/test_engine.py -- Functional tests + performance benchmark.

Runs entirely offline using face images bundled with the `insightface` pip
package itself (no internet access to random image sites needed), so this
script works out of the box on a fresh checkout:

    python tests/test_engine.py

For a real generalization-accuracy measurement (same person, different
photos -- not just re-recognizing the exact enrollment image), point it at a
labeled dataset instead:

    python tests/test_engine.py --dataset-dir /path/to/dataset

Expected --dataset-dir layout (like a small LFW-style set), one folder per
identity, at least 2 images each (1 to enroll, the rest as probes):

    dataset/
        alice/  img1.jpg img2.jpg ...
        bob/    img1.jpg img2.jpg ...

Everything here uses a throwaway SQLite DB + FAISS index under a temp
directory, so running this script never touches your real enrolled data in
data/metadata.db / data/faiss.index.
"""

import argparse
import glob
import os
import statistics
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cv2
import numpy as np

from engine import FaceRecognitionEngine


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def load_bundled_test_image():
    """t1.jpg ships inside the insightface package itself: a group photo
    with several distinct real faces. Used as a zero-setup smoke-test
    fixture so this suite runs with no external downloads or camera."""
    from insightface.data import get_image

    return get_image("t1")


def crop_with_margin(image: np.ndarray, bbox, margin: float = 0.3) -> np.ndarray:
    """Crop a single face out of a larger frame, padded by `margin` x the
    box size on each side, so re-running detection on the crop reliably
    finds that one face again."""
    x1, y1, x2, y2 = bbox
    w, h = x2 - x1, y2 - y1
    x1 = max(0, int(x1 - margin * w))
    y1 = max(0, int(y1 - margin * h))
    x2 = min(image.shape[1], int(x2 + margin * w))
    y2 = min(image.shape[0], int(y2 + margin * h))
    return image[y1:y2, x1:x2]


def fresh_engine(tmp_dir: str) -> FaceRecognitionEngine:
    return FaceRecognitionEngine(
        db_path=os.path.join(tmp_dir, "test_metadata.db"),
        index_path=os.path.join(tmp_dir, "test_faiss.index"),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_multi_face_detection(engine: FaceRecognitionEngine):
    print("\n=== Test: multi-face detection ===")
    img = load_bundled_test_image()
    faces = engine.detector.detect_faces(img)
    print(f"faces detected in bundled group photo: {len(faces)}")
    assert len(faces) >= 2, "expected multiple faces in the bundled test image"
    print("PASS")
    return img, faces


def test_register_known_identities(engine: FaceRecognitionEngine, crops: list, n_register: int):
    print(f"\n=== Test: register {n_register} identities from individual face crops ===")
    registered = []
    for i in range(n_register):
        pid, name = f"TEST{i:03d}", f"Person {i}"
        result = engine.register_face(crops[i], pid, name=name)
        status = result.get("status")
        print(f"  register {pid} ({name}): status={status}")
        assert status == "registered", f"registration failed: {result}"
        registered.append(pid)
    print("PASS")
    return registered


def test_recognize_known(engine: FaceRecognitionEngine, crops: list, registered_pids: list):
    print("\n=== Test: recognize the same crops used for enrollment ===")
    correct = 0
    confidences = []
    for pid, crop in zip(registered_pids, crops[: len(registered_pids)]):
        results = engine.recognize_face(crop)
        assert len(results) >= 1, f"expected a face to be found in the crop for {pid}"
        r = results[0]
        confidences.append(r["confidence"])
        ok = r["status"] == "matched" and r["person_id"] == pid
        correct += int(ok)
        print(f"  {pid}: status={r['status']} matched_id={r.get('person_id')} confidence={r['confidence']}")
    accuracy = correct / len(registered_pids)
    print(f"known-face recognition accuracy: {accuracy:.0%} ({correct}/{len(registered_pids)})")
    print(f"confidence on known faces: mean={statistics.mean(confidences):.4f} min={min(confidences):.4f}")
    print("NOTE: this re-recognizes the exact enrollment crop, so it mainly validates pipeline")
    print("      correctness (detect->align->embed->match->threshold), not cross-photo generalization.")
    print("      Use --dataset-dir with >=2 photos per person for a genuine accuracy measurement.")
    return accuracy, confidences


def test_unknown_rejection(engine: FaceRecognitionEngine, held_out_crops: list):
    print(f"\n=== Test: unknown-person rejection ({len(held_out_crops)} unregistered faces) ===")
    if not held_out_crops:
        print("SKIP: no held-out faces available.")
        return None
    correct = 0
    for i, crop in enumerate(held_out_crops):
        results = engine.recognize_face(crop)
        if not results:
            print(f"  held-out face {i}: no face detected in crop, skipping")
            continue
        r = results[0]
        ok = r["status"] == "unknown"
        correct += int(ok)
        print(f"  held-out face {i}: status={r['status']} confidence={r['confidence']}")
    rate = correct / len(held_out_crops)
    print(f"unknown-face rejection rate: {rate:.0%} ({correct}/{len(held_out_crops)})")
    return rate


def test_multi_face_frame(engine: FaceRecognitionEngine, img: np.ndarray):
    print("\n=== Test: recognize_face() on the full multi-face frame in one call ===")
    results = engine.recognize_face(img)
    print(f"faces returned: {len(results)}")
    for r in results:
        tag = r.get("person_id", "unknown")
        print(f"  - {tag}: status={r['status']} confidence={r['confidence']} bbox={r['bbox']}")
    return results


def benchmark(engine: FaceRecognitionEngine, img: np.ndarray, iterations: int = 15):
    print(f"\n=== Benchmark: {iterations} iterations on a {img.shape[1]}x{img.shape[0]} frame ===")
    engine.recognize_face(img)  # warm-up (first call pays one-time session overhead)

    det_times, embed_times, total_times = [], [], []
    n_faces = 0
    for _ in range(iterations):
        t0 = time.time()
        faces = engine.detector.detect_faces(img)
        t1 = time.time()
        for f in faces:
            aligned = engine.detector.align_face(img, f["kps"])
            engine.recognizer.get_embedding(aligned)
        t2 = time.time()
        det_times.append(t1 - t0)
        embed_times.append(t2 - t1)
        total_times.append(t2 - t0)
        n_faces = len(faces)

    def summarize(name, times):
        print(
            f"  {name}: mean {statistics.mean(times) * 1000:.1f}ms  "
            f"median {statistics.median(times) * 1000:.1f}ms  "
            f"min {min(times) * 1000:.1f}ms  max {max(times) * 1000:.1f}ms"
        )

    summarize("detection", det_times)
    summarize(f"embedding (x{n_faces} faces/frame)", embed_times)
    summarize("total (detect+align+embed)", total_times)
    fps = 1.0 / statistics.mean(total_times)
    print(f"  effective FPS on this frame ({n_faces} faces): {fps:.2f}")
    print(
        "  NOTE: measured on this machine's CPU. A GPU (CUDAExecutionProvider), a smaller"
    )
    print(
        "        DET_SIZE (e.g. 320x320), or a lighter detector variant will be substantially faster."
    )
    return {"det_times": det_times, "embed_times": embed_times, "total_times": total_times, "fps": fps}


def run_dataset_evaluation(engine: FaceRecognitionEngine, dataset_dir: str):
    print(f"\n=== Dataset evaluation: {dataset_dir} ===")
    person_dirs = sorted(d for d in glob.glob(os.path.join(dataset_dir, "*")) if os.path.isdir(d))
    if len(person_dirs) < 2:
        print("Need at least 2 person subfolders for a meaningful evaluation. Skipping.")
        return

    probe_set = []  # (image_path, true_person_id)
    for person_dir in person_dirs:
        pid = os.path.basename(person_dir)
        images = sorted(
            glob.glob(os.path.join(person_dir, "*.jpg"))
            + glob.glob(os.path.join(person_dir, "*.jpeg"))
            + glob.glob(os.path.join(person_dir, "*.png"))
        )
        if len(images) < 2:
            print(f"  skipping '{pid}': need >=2 images (1 to enroll, >=1 to test), found {len(images)}")
            continue
        enroll_img = cv2.imread(images[0])
        result = engine.register_face(enroll_img, pid, name=pid, source_image=images[0])
        if result.get("status") != "registered":
            print(f"  could not enroll '{pid}' from {images[0]}: {result}")
            continue
        for probe_path in images[1:]:
            probe_set.append((probe_path, pid))

    if not probe_set:
        print("No probe images available after enrollment. Skipping.")
        return

    correct, total, confidences = 0, 0, []
    for path, true_pid in probe_set:
        img = cv2.imread(path)
        if img is None:
            continue
        results = engine.recognize_face(img)
        if not results:
            print(f"  no face found in probe {path}")
            continue
        r = results[0]
        total += 1
        confidences.append(r["confidence"])
        ok = r["status"] == "matched" and r["person_id"] == true_pid
        correct += int(ok)
        if not ok:
            print(f"  MISS: {path} (true={true_pid}) -> {r}")

    if total:
        print(f"genuine-pair accuracy: {correct}/{total} = {correct / total:.1%}")
        print(
            f"confidence: mean={statistics.mean(confidences):.4f} "
            f"min={min(confidences):.4f} max={max(confidences):.4f}"
        )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main(argv=None):
    parser = argparse.ArgumentParser(description="ARGUS face engine test & benchmark suite.")
    parser.add_argument(
        "--dataset-dir", default=None, help="Optional labeled dataset (person-per-folder) for real accuracy evaluation"
    )
    parser.add_argument("--iterations", type=int, default=15, help="Benchmark iterations")
    args = parser.parse_args(argv)

    with tempfile.TemporaryDirectory(prefix="argus_test_") as tmp_dir:
        print(f"[using throwaway DB/index in {tmp_dir} -- your real data/ is untouched]")
        engine = fresh_engine(tmp_dir)

        img, faces = test_multi_face_detection(engine)
        crops = [crop_with_margin(img, f["bbox"]) for f in faces]

        n_register = max(1, len(faces) - 2)  # leave >=2 faces unregistered as "unknown" probes
        registered_pids = test_register_known_identities(engine, crops, n_register)
        test_recognize_known(engine, crops, registered_pids)
        test_unknown_rejection(engine, crops[n_register:])
        test_multi_face_frame(engine, img)
        benchmark(engine, img, iterations=args.iterations)

        if args.dataset_dir:
            run_dataset_evaluation(engine, args.dataset_dir)

    print("\nAll tests completed.")


if __name__ == "__main__":
    main()
