"""
Face detection for ASKEdits using MediaPipe.
Lightweight per-scene face summary (fast mode).
Outputs structured JSON with face regions per scene.
"""

import argparse
import json
import os
import sys


def add_extra_python_paths() -> None:
    extra_paths = os.environ.get("ASKEDITS_PYTHONPATH", "")
    if not extra_paths:
        return

    for entry in extra_paths.split(os.pathsep):
        candidate = entry.strip()
        if candidate and candidate not in sys.path:
            sys.path.insert(0, candidate)


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect faces in a video using MediaPipe.")
    parser.add_argument("--input", required=True, help="Path to the video file")
    parser.add_argument("--output", required=True, help="Path to write the JSON output")
    parser.add_argument("--sample-fps", type=float, default=1.0, help="Frames per second to sample (default: 1.0)")
    parser.add_argument("--min-confidence", type=float, default=0.5, help="Minimum detection confidence (default: 0.5)")
    parser.add_argument("--scene-data", default=None, help="Optional path to scene detection JSON for per-scene grouping")
    args = parser.parse_args()

    add_extra_python_paths()

    try:
        import cv2
    except ImportError as error:
        print("opencv-python is not installed. Install it with `pip install opencv-python`.", file=sys.stderr)
        print(str(error), file=sys.stderr)
        return 1

    print(f"Opening video: {args.input}", file=sys.stderr)
    cap = cv2.VideoCapture(args.input)

    if not cap.isOpened():
        print(f"Failed to open video: {args.input}", file=sys.stderr)
        return 1

    video_fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_sec = total_frames / video_fps if video_fps > 0 else 0

    # Calculate frame sampling interval
    sample_interval = max(1, int(video_fps / args.sample_fps))
    print(f"Video: {width}x{height} @ {video_fps:.1f}fps, {total_frames} frames, sampling every {sample_interval} frames", file=sys.stderr)

    # Load scene data if provided
    scenes = None
    if args.scene_data and os.path.exists(args.scene_data):
        try:
            with open(args.scene_data, "r", encoding="utf-8") as f:
                scene_json = json.load(f)
                scenes = scene_json.get("scenes", [])
        except Exception:
            scenes = None

    # Initialize OpenCV Haar Cascade face detection
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)

    all_detections = []
    frame_idx = 0
    last_pct = -1

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % sample_interval == 0:
            # Progress
            if total_frames > 0:
                pct = min(99, int((frame_idx / total_frames) * 100))
                if pct != last_pct:
                    print(f"PROGRESS:{pct}", file=sys.stderr, flush=True)
                    last_pct = pct

            time_sec = round(frame_idx / video_fps, 3) if video_fps > 0 else 0
            gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # Detect faces
            detections = face_cascade.detectMultiScale(
                gray_frame,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(30, 30)
            )

            faces = []
            for (x, y, w, h) in detections:
                faces.append({
                    "x": round(x / width, 4),
                    "y": round(y / height, 4),
                    "width": round(w / width, 4),
                    "height": round(h / height, 4),
                    "confidence": 1.0,
                })

            all_detections.append({
                "timeSec": time_sec,
                "frameIndex": frame_idx,
                "faceCount": len(faces),
                "faces": faces,
            })

        frame_idx += 1

    cap.release()

    # Build per-scene summaries if scene data is available
    scene_summaries = []
    if scenes:
        for scene in scenes:
            scene_start = scene["startSec"]
            scene_end = scene["endSec"]
            scene_dets = [d for d in all_detections if scene_start <= d["timeSec"] < scene_end]

            face_counts = [d["faceCount"] for d in scene_dets]
            max_faces = max(face_counts) if face_counts else 0
            avg_faces = round(sum(face_counts) / max(1, len(face_counts)), 2)

            # Determine dominant face position (average of all face centers)
            all_faces_in_scene = [f for d in scene_dets for f in d["faces"]]
            dominant_position = None
            if all_faces_in_scene:
                avg_x = sum(f["x"] + f["width"] / 2 for f in all_faces_in_scene) / len(all_faces_in_scene)
                avg_y = sum(f["y"] + f["height"] / 2 for f in all_faces_in_scene) / len(all_faces_in_scene)
                # Classify position
                if avg_x < 0.33:
                    h_pos = "left"
                elif avg_x > 0.66:
                    h_pos = "right"
                else:
                    h_pos = "center"
                dominant_position = {
                    "horizontal": h_pos,
                    "normalizedX": round(avg_x, 3),
                    "normalizedY": round(avg_y, 3),
                }

            scene_summaries.append({
                "sceneId": scene["id"],
                "startSec": scene_start,
                "endSec": scene_end,
                "maxFaces": max_faces,
                "avgFaces": avg_faces,
                "hasFace": max_faces > 0,
                "dominantPosition": dominant_position,
                "sampleCount": len(scene_dets),
            })

    # Overall summary
    total_with_faces = sum(1 for d in all_detections if d["faceCount"] > 0)
    total_samples = len(all_detections)
    max_simultaneous = max((d["faceCount"] for d in all_detections), default=0)

    result = {
        "provider": "opencv-haar",
        "generatedAt": __import__("datetime").datetime.now().isoformat(),
        "settings": {
            "sampleFps": args.sample_fps,
            "minConfidence": args.min_confidence,
        },
        "video": {
            "width": width,
            "height": height,
            "durationSec": round(duration_sec, 3),
            "frameRate": round(video_fps, 3),
            "totalFrames": total_frames,
        },
        "summary": {
            "totalSamples": total_samples,
            "samplesWithFaces": total_with_faces,
            "facePresenceRatio": round(total_with_faces / max(1, total_samples), 3),
            "maxSimultaneousFaces": max_simultaneous,
        },
        "sceneSummaries": scene_summaries,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
