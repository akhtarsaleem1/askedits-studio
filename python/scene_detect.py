"""
Scene detection for ASKEdits using PySceneDetect.
Detects camera cuts, transitions, and major visual changes.
Outputs structured JSON with scene boundaries.
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
    parser = argparse.ArgumentParser(description="Detect scenes in a video using PySceneDetect.")
    parser.add_argument("--input", required=True, help="Path to the video file")
    parser.add_argument("--output", required=True, help="Path to write the JSON output")
    parser.add_argument("--threshold", type=float, default=27.0, help="ContentDetector threshold (default: 27.0)")
    parser.add_argument("--min-scene-len", type=float, default=0.5, help="Minimum scene length in seconds")
    args = parser.parse_args()

    add_extra_python_paths()

    try:
        from scenedetect import open_video, SceneManager
        from scenedetect.detectors import ContentDetector
    except ImportError as error:
        print(
            "scenedetect is not installed. "
            "Install it with `pip install scenedetect[opencv]`.",
            file=sys.stderr,
        )
        print(str(error), file=sys.stderr)
        return 1

    print(f"Opening video: {args.input}", file=sys.stderr)
    video = open_video(args.input)

    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=args.threshold, min_scene_len=int(args.min_scene_len * video.frame_rate)))

    total_frames = video.duration.get_frames()
    print(f"Total frames: {total_frames}, FPS: {video.frame_rate:.2f}", file=sys.stderr)

    # Process video with progress reporting
    frame_skip = max(1, total_frames // 100) if total_frames > 0 else 1
    last_pct = -1

    def progress_callback(_frame_img, frame_num):
        nonlocal last_pct
        if total_frames > 0:
            pct = min(99, int((frame_num / total_frames) * 100))
            if pct != last_pct:
                print(f"PROGRESS:{pct}", file=sys.stderr, flush=True)
                last_pct = pct

    scene_manager.detect_scenes(video=video, callback=progress_callback)
    scene_list = scene_manager.get_scene_list()

    print(f"Detected {len(scene_list)} scenes.", file=sys.stderr)

    # Build output
    scenes = []
    for idx, (start, end) in enumerate(scene_list):
        scenes.append({
            "id": f"scene-{idx + 1}",
            "index": idx,
            "startSec": round(start.get_seconds(), 3),
            "endSec": round(end.get_seconds(), 3),
            "durationSec": round((end - start).get_seconds(), 3),
            "startFrame": start.get_frames(),
            "endFrame": end.get_frames(),
        })

    duration_sec = video.duration.get_seconds() if hasattr(video.duration, 'get_seconds') else 0

    result = {
        "provider": "pyscenedetect",
        "generatedAt": __import__("datetime").datetime.now().isoformat(),
        "settings": {
            "threshold": args.threshold,
            "minSceneLenSec": args.min_scene_len,
        },
        "video": {
            "durationSec": round(duration_sec, 3),
            "frameRate": round(video.frame_rate, 3),
            "totalFrames": total_frames,
        },
        "summary": {
            "sceneCount": len(scenes),
            "avgSceneDurationSec": round(sum(s["durationSec"] for s in scenes) / max(1, len(scenes)), 3),
            "shortestSceneSec": round(min((s["durationSec"] for s in scenes), default=0), 3),
            "longestSceneSec": round(max((s["durationSec"] for s in scenes), default=0), 3),
        },
        "scenes": scenes,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
