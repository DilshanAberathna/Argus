# ARGUS Face Recognition Engine

A standalone, UI-free face recognition ML module: detection (SCRFD) →
alignment → embedding (ArcFace) → FAISS matching → identity result. Built to
be imported as a library by another backend, or driven directly from the
terminal for testing.

No dashboard, no web server, no GUI window is created anywhere in this
codebase — every entry point talks JSON on stdout or plain Python function
calls.

```
Face Image → Face Detection (SCRFD) → Alignment → ArcFace Model → 512-D Embedding
                                                                        ↓
                                                                  FAISS Search
                                                                        ↓
                                                                 Similarity Score
                                                                        ↓
                                                                 Threshold Check
                                                                        ↓
                                                                 Identity Result
```

## Status

Every module in this package has been executed end-to-end on real face
images (not just import-checked) as part of building it: model download,
multi-face detection, alignment, embedding, registration, matching,
unknown-rejection, every CLI (`argus.py` including the interactive `setup`
flow via piped stdin, `register.py`, `recognize.py`, `check_camera.py`),
the `--preview` window's overlay + STOP button logic, `--stop-on-match`
against a real synthetic video (not mocked), error paths (bad file, no
face, no camera, no display, bad input during prompts), cross-directory
import, and both model packs (`buffalo_l` and `antelopev2`). See **Verified
behaviour** near the end of this file for the actual measured numbers and
three real bugs this process caught — including one that would have
crashed the whole process rather than failing gracefully.

## 1. Install

```bash
cd face_recognition_engine
python3 -m venv venv && source venv/bin/activate   # optional but recommended
pip install -r requirements.txt
```

The first time you construct a `FaceRecognitionEngine` (or run `register.py`
/ `recognize.py`), InsightFace will auto-download the `buffalo_l` model pack
(~280MB) from its official GitHub release into `models/insightface_models/`.
This needs internet access once; after that it's cached locally and every
subsequent start is instant. Swap to `antelopev2` (higher accuracy, slower,
~350MB) via the `ARGUS_MODEL_PACK` environment variable or the `model_pack=`
constructor argument — see [Configuration](#5-configuration).

## 2. Terminal usage

### The short version: one command, `argus.py`

```bash
python argus.py                          # guided flow: prompts you, registers, then watches live -- see below
python argus.py --image photo.jpg        # skip the guided flow: recognize one image directly
python argus.py --camera 0               # skip the guided flow: recognize live, no registration step
python argus.py list                     # who's enrolled
python argus.py --help                   # every other command
```

**Run it with no arguments and you get the full guided flow**, which is the
"first take input images then extract embeddings, then open the camera feed
and start detection" sequence in one command, entirely through terminal
prompts — no flags to prepare up front:

1. It asks for a **person ID**, **name**, and one or more **image path(s)**
   (blank line when you're done adding images) — this is the terminal-based
   equivalent of "upload an image" since there's no GUI/file-picker here,
   just paths you type. Bad paths get rejected with a re-prompt, not a
   crash.
2. It **registers automatically** the moment you finish — detects the face,
   aligns it, extracts the embedding, saves it. No separate command needed.
3. It asks for a **DroidCam IP** (blank to use the local camera instead),
   then **automatically opens that feed with a live preview window** and
   starts identifying people in it — no further input needed, exactly as
   requested: "after get the input image, others... run automatically
   without entering any command."
4. **It stops itself the instant the person you just registered is
   identified** — no need to close it by hand. Before that happens, you can
   still end it early: click the **STOP button** drawn in the corner of the
   preview window, press `q`/`Esc` with the window focused, or Ctrl+C in the
   terminal — whichever's convenient.

If you'd rather skip straight to a one-off recognition (someone's already
registered, you just want to check), give `--image` / `--camera` /
`--droidcam` directly and it bypasses the guided flow entirely — see
"Camera sources" and "Live preview window" below for the full flag set
(`--preview`, `--stop-on-match`, etc.), all of which work at the top level
here too. Everything else this module can do (`register`, `recognize` with
non-default options, `check-camera`, `delete`, `test`, `demo` — the
flag-driven, no-prompts version of the same guided flow) is one subcommand
away — see `python argus.py --help` for the full list.

`argus.py` is a thin router, not a second implementation: `register --id ...`
calls the exact same `register.py` code you'd get running it directly, and
likewise for the others, down to the guided flow itself being built from
`engine.register_face()` and `recognize.run_on_camera()` — nothing here
reimplements either. Nothing is duplicated between the different ways of
calling this, so behavior can't silently drift apart between them.

### The individual scripts (still work exactly the same, if you prefer them)

The rest of this section documents `register.py` / `recognize.py` directly,
since `argus.py register ...` / `argus.py recognize ...` behave identically
— pick whichever's more convenient for a given moment; both are fully
supported, not one deprecated in favor of the other. Note that only
`argus.py` (bare, or `argus.py setup`) has the fully interactive
prompt-driven flow — `register.py`/`recognize.py` remain flag-driven, by
design, so they stay trivially scriptable.

### Register a person

```bash
# From image files (one or more; each is registered as a separate sample)
python register.py --id P001 --name "John Doe" --images photo1.jpg photo2.jpg

# From a local webcam -- built-in or a USB/portable one, just a different index
# (captures 5 frames, 1.5s apart, no preview window)
python register.py --id P001 --name "John Doe" --camera 0 --num-samples 5

# From a phone running DroidCam over WiFi (see "Camera sources" below)
python register.py --id P001 --name "John Doe" --droidcam 192.168.1.5
```

### Recognize a person

```bash
python recognize.py --image photo.jpg

# Continuous webcam stream, one JSON object per frame, Ctrl+C to stop
python recognize.py --camera 0

# Continuous stream from a phone over WiFi instead of a local camera
python recognize.py --droidcam 192.168.1.5

# Override the match threshold for this run only
python recognize.py --camera 0 --threshold 0.45
```

### Camera sources: local webcam, DroidCam, or other IP cameras

`--camera` and `--droidcam` are two ways to point at a live source; use
whichever's more convenient. Both are handled by `camera_source.py`, shared
by `register.py` and `recognize.py` so the two scripts behave identically:

| Flag | Example | What it does |
|---|---|---|
| `--camera <index>` | `--camera 0`, `--camera 1` | A local device by index -- built-in laptop cam or a plugged-in USB/portable webcam. OpenCV addresses both the same way; which index is which device depends on plug-in order, not anything this code controls (see `check_camera.py --scan` below). |
| `--droidcam <ip>` | `--droidcam 192.168.1.5` | Shorthand for a [DroidCam](https://droidcam.app) WiFi feed -- turns your phone into a camera over the local network. Builds `http://<ip>:4747/video` (DroidCam's own documented endpoint); add `:<port>` if you changed it in the app. |
| `--camera <url>` | `--camera http://192.168.1.5:4747/video`, `--camera rtsp://192.168.1.10:554/stream` | The DroidCam URL spelled out manually, or any other IP camera over RTSP/HTTP. `--droidcam` is just a convenience wrapper around this. |
| `--camera <path>` | `--camera sample.mp4` | A local video file -- not a live camera at all, but useful for testing the pipeline without one. |

DroidCam over WiFi fails in more ways than a wired webcam (phone asleep,
DroidCam app not open, wrong IP, different WiFi network, firewall on the
port) -- and a `cv2.VideoCapture` on an unreachable network address can hang
far longer than a terminal tool should. Two things address that:

1. Network sources get a 5-second open/read timeout (`config.py`:
   `NETWORK_CAMERA_OPEN_TIMEOUT_MS` / `..._READ_TIMEOUT_MS`) so a bad
   IP fails fast instead of hanging indefinitely.
2. `check_camera.py` checks connectivity in isolation, without loading any
   ML models, so it's near-instant and doesn't force you to debug a network
   issue in the middle of a registration/recognition run:

   ```bash
   python check_camera.py --scan                 # which local index is my webcam?
   python check_camera.py --droidcam 192.168.1.5  # is my phone reachable right now?
   ```

   A failed DroidCam check prints a short troubleshooting checklist (app
   open? same WiFi? current IP? — the IP shown in the DroidCam app changes
   if the phone reconnects). If it's still unclear, try the printed URL
   directly in a browser first — if that doesn't load a video feed either,
   the problem is DroidCam/network, not this code.

Both scripts print only JSON on **stdout**; progress/status messages go to
**stderr**. That split is deliberate so stdout can be piped straight into
another process (e.g. `python recognize.py --camera 0 | your_alert_daemon`)
without any log noise mixed in.

Example matched output (fields match the spec exactly, plus `bbox` /
`det_score` from the detector):

```json
{
  "person_id": "P001",
  "name": "John Doe",
  "confidence": 0.94,
  "status": "matched",
  "bbox": [captured pixel coordinates],
  "det_score": 0.99
}
```

Example unknown output:

```json
{
  "status": "unknown",
  "confidence": 0.32
}
```

### Live preview window (`--preview`, `--stop-on-match`)

Everything above is headless by design — no window, ever, unless you ask
for one. `--preview` asks for one: it opens a live window with a green box
+ name/confidence around matched faces, red for unknown, over the actual
feed, plus a clickable **STOP** button drawn in the corner. Works with
`--camera`, `--droidcam`, or `--image` (a still image just waits for a
keypress instead of looping):

```bash
python recognize.py --droidcam 192.168.1.5 --preview
python argus.py --droidcam 192.168.1.5 --preview                  # same thing, top-level shortcut
python argus.py --droidcam 192.168.1.5 --preview --stop-on-match  # + end the session the instant someone is identified
```

Three ways to end a `--preview` session by hand at any point: click the
**STOP** button in the window, press `q` or `Esc` with the window focused,
or Ctrl+C in the terminal — whichever's within reach. Add `--stop-on-match`
and it also ends **automatically**, the moment any face in a frame comes
back `"status": "matched"` — no button needed for that case, though it's
still there if you want to end things sooner. The JSON stream on stdout is
unaffected by any of this — you get it either way; redirect stdout to
`/dev/null` if you only want to watch the window.

**Needs a real display** — your own laptop screen, or an SSH session with
X11 forwarding (`ssh -X`). It will not work in this build sandbox, in a
headless server/container, or over plain SSH — `recognize.py` detects this
up front (checks for `$DISPLAY`) and prints a clear message instead of
attempting to open a window, rather than trying and failing badly. That
"failing badly" isn't hypothetical: while building this, calling
`cv2.imshow()` with no display turned out to **hard-crash the whole Python
process** (a Qt-level abort, not a normal exception `try`/`except` can
catch) rather than raising a catchable error — this is exactly what
`preview.display_available()` exists to avoid, and it's the reason the
check happens *before* any preview call rather than being wrapped in a
try/except after the fact.

### `python argus.py` / `argus.py setup`: the fully guided flow

This is what bare `python argus.py` runs (see section 2's opening) — also
callable by name:

```bash
python argus.py setup
```

Prompts for a person ID, name, and image path(s) via the terminal, registers
automatically, then switches into live `--preview --stop-on-match`
recognition on a camera or DroidCam feed (also asked for via prompt, blank
= local camera 0). Nothing to type after the last prompt — registration,
connecting to the feed, opening the preview window, and stopping on a match
all happen without any further command. If the camera/DroidCam step fails
(bad IP, phone off, etc.), the registration is **not** lost — you'll get a
one-line recovery command (`argus.py recognize --droidcam <ip> --preview
--stop-on-match`) to pick up where it left off once the connection's
sorted, rather than needing to redo the registration.

### `argus.py demo`: the same flow, but flag-driven instead of interactive

For scripting, or when you don't want prompts:

```bash
python argus.py demo --id P001 --name "John Doe" --images photo.jpg --droidcam 192.168.1.5
```

This registers `P001` from `photo.jpg` (prints the registration result as
JSON, same as `register`), then immediately switches into live
`--preview --stop-on-match` recognition on the given source (default:
camera 0 if you omit `--camera`/`--droidcam`) — same auto-stop-on-match
behavior as `setup`, just without the prompts. It's built entirely out of
`engine.register_face()` and `recognize.run_on_camera()` — see `cmd_demo`
in `argus.py` — so it isn't a second implementation of either step, just a
convenience chain through the same code the rest of this README already
covers.

## 3. Python API (for integrating into ARGUS)

This is the actual point of the module — everything above is a thin CLI
wrapper around this class.

```python
import sys
sys.path.insert(0, "/path/to/face_recognition_engine")
from engine import FaceRecognitionEngine

fr = FaceRecognitionEngine()

# Register (image is a BGR numpy array, e.g. from cv2.imread / cv2.VideoCapture)
fr.register_face(image, person_id="P001", name="John Doe")

# Recognize -- returns a list, one dict per face found in the frame
results = fr.recognize_face(frame)
for r in results:
    if r["status"] == "matched":
        print(r["person_id"], r["name"], r["confidence"])

# Raw embedding only, no DB involved
embedding = fr.get_embedding(image)               # 512-D unit vector, or None

# Pure 1:1 comparison, independent of the database
similarity = fr.compare_faces(embedding_a, embedding_b)

# Admin (also reachable from the terminal without writing Python --
# `python argus.py list` / `python argus.py delete --id P001`)
fr.list_persons()
fr.delete_person("P001")
fr.rebuild_index()          # force-resync FAISS from SQLite if ever needed

# Alert-system attachment point (see section 7)
fr.on_recognition(lambda result: maybe_raise_alert(result))
```

Why `sys.path.insert(...)` instead of a normal package import: the CLI
scripts (`register.py`, `recognize.py`) are meant to run directly as
`python recognize.py --camera 0`, exactly as specified, from inside this
folder. To keep that working *and* keep the module cleanly importable from
elsewhere, every internal import here is a plain top-level import (`import
config`, `from detector.scrfd_detector import ...`) rather than a
dotted-package relative import. That means the one thing the importer must
do is put this folder itself on `sys.path` — shown above. If you'd rather
have `from face_recognition_engine.engine import FaceRecognitionEngine`
(dotted-package style) for a `pip install -e .`-style integration instead,
that's a small mechanical change (convert the internal imports to relative
`.config` / `.detector.scrfd_detector`); ask if you want that variant.

### Function reference (spec section 9)

| Spec name | Actual signature | Notes |
|---|---|---|
| `register_face(image, person_id)` | `FaceRecognitionEngine.register_face(image, person_id, name=None, source_image=None)` | `name` required the first time a `person_id` is seen; omit on later calls to add another sample |
| `recognize_face(image)` | `FaceRecognitionEngine.recognize_face(image, top_k=None, threshold=None)` | Returns a **list** (one dict per detected face), not a single dict — see note below |
| `get_embedding(face)` | `FaceRecognitionEngine.get_embedding(image)` | Runs detect→align→embed on the largest face in a raw image and returns the 512-D vector |
| `compare_faces(embedding)` | `FaceRecognitionEngine.compare_faces(embedding1, embedding2)` (`@staticmethod`) | Pure cosine similarity between two embeddings, no database lookup |

**Why `recognize_face` returns a list:** the spec's own example output is a
single flat dict, which is exactly `results[0]` for a single-face image. It
returns a list instead of a bare dict so that a multi-face frame — a group
photo, or a webcam pointed at more than one person, both explicit
requirements elsewhere in the spec — doesn't need a second function. Unwrap
`results[0]` at the call site if you know you're always dealing with
single-face images.

## 4. Project structure

```
face_recognition_engine/
├── models/insightface_models/   # auto-downloaded ONNX weights (gitignored, not shipped)
├── detector/scrfd_detector.py   # SCRFD detection + landmark alignment
├── recognizer/arcface_model.py  # ArcFace embedding extraction
├── database/embedding_store.py  # SQLite metadata + embedding storage
├── matching/faiss_search.py     # FAISS cosine-similarity search
├── data/                        # generated at runtime: metadata.db, faiss.index
├── tests/test_engine.py         # functional tests + accuracy/FPS benchmark
├── engine.py                    # FaceRecognitionEngine -- the public API
├── argus.py                     # single entry point / router -- see section 2
├── register.py                  # terminal entry point: enrollment
├── recognize.py                 # terminal entry point: recognition
├── preview.py                   # optional live GUI window + STOP button for --preview (see section 2)
├── camera_source.py             # resolves --camera / --droidcam into a cv2.VideoCapture source
├── check_camera.py              # standalone connectivity check, no ML models loaded
├── config.py                    # all tunable parameters
├── requirements.txt
└── README.md
```

`data/`, `argus.py`, `preview.py`, and `camera_source.py`/`check_camera.py`
are additions beyond the folders/files originally specified. `data/` gives
the two runtime-generated files (SQLite DB, FAISS index) a place to live
separately from source code, so the code tree stays clean and `.gitignore`
can exclude your enrolled biometric data by default without also having to
special-case source files sitting in the same directory. `camera_source.py`
/ `check_camera.py` exist because camera I/O (local webcam vs. DroidCam vs.
other IP cameras) isn't part of the ML pipeline and is shared by both CLI
scripts, so it earns its own small module rather than being duplicated in
`register.py` and `recognize.py` or bolted onto an unrelated one. `argus.py`
exists purely for convenience (one command instead of remembering which of
several scripts to run) — every other script's `main()` was refactored to
accept an optional `argv` list precisely so `argus.py` could call the exact
same code instead of reimplementing any of it. `preview.py` is the one
intentional exception to this project's original "no UI" design — added on
request, opt-in only via `--preview`, isolated in its own module so the rest
of the codebase stays exactly as headless as before.

Every subpackage (`detector`, `recognizer`, `database`, `matching`) is
independently usable — e.g. you can `from detector import SCRFDDetector` and
run detection alone with no database or matching code involved.

## 5. Configuration

Everything tunable lives in `config.py`. The two you're most likely to touch:

| Setting | Default | What it does |
|---|---|---|
| `RECOGNITION_THRESHOLD` | `0.40` | Cosine similarity cutoff for "matched" vs "unknown". **Calibrate this on your own enrolled population** — see below. Override per-call with `recognize_face(img, threshold=0.5)`, per-run with `--threshold`, or globally with the `ARGUS_REC_THRESHOLD` env var. |
| `MODEL_PACK_NAME` | `"buffalo_l"` | Set to `"antelopev2"` (or the `ARGUS_MODEL_PACK` env var) for the higher-accuracy, slower, larger alternative. Both were verified working in this build. |

Other knobs: `DET_THRESH` / `DET_SIZE` (detector sensitivity / input
resolution), `SEARCH_TOP_K` (how many FAISS neighbours are pulled before
picking the best per-person match), `CTX_ID` / `ORT_PROVIDERS` (CPU/GPU,
auto-detected from what ONNX Runtime reports as available).

### Calibrating the threshold

`RECOGNITION_THRESHOLD` is the single most consequential number in this
system — too low and unenrolled people get matched to real identities
(false accept), too high and enrolled people get reported as strangers
(false reject). The right value depends on your camera, lighting, and how
many people are enrolled, so don't ship the default without checking it on
your own data:

```bash
python tests/test_engine.py --dataset-dir /path/to/your/labeled/photos
```

This enrolls one photo per person and tests recognition against the rest,
reporting genuine-pair accuracy and the confidence distribution. Use that
distribution to pick a threshold that separates your genuine and impostor
scores with the margin your application needs (a security-flavoured system
should bias toward a higher threshold / fewer false accepts; a friendly
"welcome back" feature can afford a lower one).

## 6. Design decisions worth knowing about

- **No filenames are hardcoded per model pack.** `detector/scrfd_detector.py`
  and `recognizer/arcface_model.py` scan every `.onnx` file in the pack
  directory and ask InsightFace's own model router what each one is
  (`taskname == 'detection'` / `'recognition'`), rather than assuming e.g.
  `det_10g.onnx` is always the detector. This is why switching
  `MODEL_PACK_NAME` to `antelopev2` (different filenames entirely) needed no
  other code changes.
- **Embeddings are explicitly L2-normalized** in `ArcFaceRecognizer.get_embedding()`.
  The raw ONNX output is not unit-length (measured norm ≈ 26 on a real face,
  not 1.0) — this was checked empirically, not assumed, because a missed
  normalization here would have silently broken cosine similarity throughout
  the whole matching pipeline.
- **SQLite is the source of truth; FAISS is a derived, rebuildable cache.**
  Every embedding is written to SQLite as a float32 blob. The FAISS index is
  built from that data and persisted separately purely for search speed — if
  it's ever lost, corrupted, or out of sync, `engine.rebuild_index()`
  regenerates it from SQLite with zero data loss. `FaceRecognitionEngine`
  also does this automatically on startup if it finds an empty index next to
  a non-empty database (verified: delete `data/faiss.index`, keep
  `data/metadata.db`, all enrolled identities come back on the next run).
- **IndexFlatIP (exact search), not an approximate index.** At FYP /
  small-deployment scale (dozens to low thousands of identities) exact
  search is simple, has zero recall loss, and is fast enough. If ARGUS ever
  needs tens of thousands of enrolled identities, swap the index type inside
  `FaissMatcher.__init__` for `IndexIVFFlat` or `IndexHNSWFlat` — the public
  API (`add` / `search` / `save` / `load` / `rebuild_from_store`) would not
  need to change anywhere else.
- **`register_face` on a multi-face image uses the largest face** and
  reports how many faces it saw in a `warning` field, rather than erroring
  or guessing. Enrollment photos are expected to be of one person; if
  several faces are detected, crop to the person you want first (or pass a
  tighter photo).
- **Multiple samples per identity, not one canonical photo.** Every
  registered image adds a new embedding row rather than overwriting one
  "canonical" embedding, and matching takes the best-scoring sample per
  person (`SEARCH_TOP_K`, default 5 neighbours). A richer gallery per person
  is more robust to lighting/pose/expression than a single reference photo.

## 7. Future integration hooks

- **Alert system:** `engine.on_recognition(callback)` registers a function
  called with every per-face result dict `recognize_face()` produces
  (matched or unknown) — attach watch-list logic or notifications here
  without touching `engine.py`.
- **Firebase / external persistence:** `EmbeddingStore` and `FaissMatcher`
  are the only two classes that touch disk. Both are small, single-purpose,
  and constructed with an explicit path — the natural extension point is a
  sibling class with the same method signatures (`add_person`,
  `add_embedding`, `get_all_embeddings`, ...) backed by Firestore instead of
  SQLite, swapped in via `FaceRecognitionEngine`'s constructor.
- **Gait recognition module:** `recognize_face()`'s per-face result dicts
  are plain JSON-serializable dicts keyed by the same `person_id` scheme
  used here, so a separate gait-recognition result stream can be correlated
  by `person_id` and fused (e.g. weighted-average confidence, or "either
  modality matches") one layer up in the ARGUS backend without either module
  needing to know about the other.

## 8. Testing & benchmarking

```bash
python tests/test_engine.py                              # smoke tests + benchmark
python tests/test_engine.py --dataset-dir /path/to/data   # + real accuracy evaluation
python tests/test_engine.py --iterations 50               # more benchmark samples
```

Runs entirely offline using a group-photo test image bundled inside the
`insightface` pip package itself, so it works on a fresh checkout with no
external downloads beyond the model weights and no camera. It always uses a
throwaway database in a temp directory — your real `data/metadata.db` is
never touched by running the tests. Covers: multi-face detection,
registering several identities, recognizing known faces, rejecting
unregistered ("unknown") faces, a mixed multi-face frame in a single call,
and a detection/embedding/FPS benchmark.

## 9. Verified behaviour (measured during this build, not projected)

- **Multi-face detection**: 6/6 real faces correctly detected in a test
  group photo.
- **Known-face recognition**: 4/4 registered identities correctly matched
  (confidence 1.00 against their own enrollment crop; 0.96–0.99 when
  re-detected from within the full multi-person frame instead).
- **Unknown rejection**: 2/2 unregistered faces from the same photo
  correctly reported `"status": "unknown"`, with confidences (0.09–0.23)
  comfortably below the 0.40 threshold — i.e. real impostor scores in this
  test cluster well under the decision boundary, though you should still
  calibrate on your own data per section 5.
- **Both model packs work**: `buffalo_l` and `antelopev2` were each
  downloaded and run through the full register → recognize pipeline
  successfully.
- **`argus.py`**: every subcommand (`register`, `recognize`, `check-camera`,
  `list`, `delete`, `test`, `demo`, `setup`) was run and produced output
  consistent with calling the underlying script/function directly, including
  a full pass of the test suite dispatched *through* `argus.py test`. Bare
  `python argus.py` (fully empty argv) was confirmed to launch the
  interactive `setup` flow rather than the old auto-camera shortcut;
  `--image` / `--camera N` / `--droidcam <ip>` / `--preview` /
  `--stop-on-match` given explicitly at the top level were each confirmed to
  bypass the wizard and resolve straight into `recognize.py`, as designed. A
  full register → `argus.py --image <same file>` round trip correctly
  returned a match.
- **The interactive `setup` flow**: driven via piped stdin (the standard way
  to test a terminal prompt loop non-interactively) rather than just read
  through. Confirmed: a full successful run (ID → name → image → DroidCam IP
  → registration → camera attempt); re-prompting on a nonexistent image path
  instead of crashing; falling back to local camera 0 on a blank DroidCam
  IP; and clean cancellation (no traceback) on empty/EOF input simulating an
  interrupted session. The one cosmetic artifact of piped-stdin testing —
  prompts appearing to run together on one line in the captured output — is
  a testing-harness quirk (no real terminal echoing keystrokes/Enter), not
  how it behaves in an actual interactive session.
- **`--stop-on-match`**: tested against a **real synthetic video** (built
  with `cv2.VideoWriter`, not mocked) containing two frames of an
  unregistered face followed by a frame of a registered one, followed by two
  more frames that should never be reached. `run_on_camera` correctly
  reported `"unknown"` for the first two frames, then stopped **exactly** on
  the third frame with `{"reason": "matched", "match": {...}}` — confirmed
  the remaining two frames were never processed. This is the literal
  "if identified, stop the identification and stop" requirement, verified
  against real detection/recognition output, not just read through as code.
- **The STOP button**: hit-testing logic (`StopButton._on_mouse`) was
  exercised directly with synthetic click/move events at in-bounds and
  out-of-bounds coordinates — confirmed a left-button-down inside the
  button's rect sets `.clicked`, and neither a click outside it nor a
  mouse-move (no click) inside it does. The button's on-frame rendering
  (position, contrast, no overlap with detection labels in a real 6-face
  frame) was checked visually via a saved annotated image. What's *not*
  verified, because this sandbox has no display: an actual mouse click
  landing on it in a real running window — the coordinate math and the
  callback logic are confirmed correct, not the physical click-to-pixel
  path, which depends on your OS/window manager rather than this code.
- **Camera source handling (`camera_source.py`, `--droidcam`)**: this
  sandbox has no real webcam or phone to connect to, so what's verified is
  everything short of an actual live feed: `--camera <index>`,
  `--camera <url>`, and `--droidcam <ip>` all resolve to the correct value
  (confirmed the exact URLs built); an unreachable network address fails in
  under a second with a clear JSON error via both `register.py`/
  `recognize.py` and `check_camera.py`, instead of hanging; and the existing
  `--camera <index>` behavior is unchanged (regression-tested against the
  same "no camera present" case that worked before this change). The DroidCam
  URL format itself (`http://<ip>:4747/video`) is from DroidCam's own
  documentation, not guessed. **Tested against your actual phone's IP**
  (`10.17.156.96`, a private/LAN address): it resolved to the correct URL
  and timed out cleanly after 5 seconds — a plain TCP timeout, not a crash
  or hang. That's the expected result, not a bug: this build sandbox is a
  cloud container with no network route to your home/office WiFi, so it
  cannot reach a private LAN address no matter how correct the code is. Run
  `python check_camera.py --droidcam 10.17.156.96` on your own machine
  (same WiFi as the phone, DroidCam app open) — that's the real test, and
  it takes a couple of seconds either way.
- **Three real bugs were caught and fixed** by actually running this code
  end-to-end instead of only reasoning about it, all worth knowing about if
  you extend this codebase:
  1. `antelopev2.zip` extracts with an extra nested subfolder that
     `buffalo_l.zip` does not have; a non-recursive file glob silently found
     zero model files for `antelopev2` alone. Fixed with a recursive glob in
     both loaders.
  2. Loading a model without explicitly passing `providers=` makes
     InsightFace silently substitute its own hardcoded default provider list
     (which includes CUDA) instead of the CPU/GPU auto-detection in
     `config.py`, producing a spurious "CUDA not available" warning on
     CPU-only machines. Fixed by passing `providers=` explicitly everywhere
     a model is loaded.
  3. `cv2.imshow()` with `--preview` and no display available doesn't raise
     a normal Python exception on this OpenCV build (Qt-backed) — it
     hard-crashes the whole process (`SIGABRT`), bypassing a `try`/`except`
     entirely. Fixed by checking `$DISPLAY` *before* ever calling `imshow()`
     (`preview.display_available()`) and falling back to headless mode with
     a clear message, rather than relying on catching an error that, in
     this failure mode, was never going to arrive. The original
     try/except is kept as a second line of defense for OpenCV builds that
     fail more gracefully than this one did.
- **Performance**, measured on this build machine (a CPU-only, single-core
  sandbox — treat as a lower bound, not a target): detection ≈ 270ms/frame,
  embedding ≈ 290ms/face, end-to-end ≈ 0.5 FPS on a 6-face, 1280×886 frame.
  A multi-core machine, a GPU (`CUDAExecutionProvider`, auto-used if
  available), a smaller `DET_SIZE`, or a lighter detector variant will all
  meaningfully improve this for real-time webcam use — budget real hardware
  time for this before committing to a live-video framerate target.

## 10. A practical note on enrolled biometric data

This module stores face embeddings tied to a name and ID — that's biometric
personal data under most data protection frameworks (e.g. Sri Lanka's
Personal Data Protection Act, GDPR-style regimes elsewhere). Two things
worth building in before this goes beyond your own testing: get informed
consent from anyone you enroll, and give yourself a deletion path — which
`engine.delete_person()` already provides. Worth a line in your project
report either way.

## 11. Requirements

Python, OpenCV, InsightFace (SCRFD + ArcFace), ONNX Runtime, NumPy, FAISS,
SQLite — see `requirements.txt` for exact, verified-working versions. No
training happens anywhere in this codebase; both models are used strictly
as pretrained inference engines, per spec.
