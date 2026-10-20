"""Local person mask; no footage is sent over the network."""
import argparse
import os
import subprocess
import sys

packages = os.environ.get("PERSON_SEGMENTATION_PACKAGES")
if packages:
    sys.path.insert(0, packages)
import cv2
import mediapipe as mp
import numpy as np


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--ffmpeg", required=True)
    parser.add_argument("--duration", type=float, required=True)
    args = parser.parse_args()
    # A bounded, low-resolution mask follows the full source timeline.
    width, height, fps = 288, 512, 15
    decode = subprocess.Popen([args.ffmpeg, "-v", "error", "-i", args.input,
        "-t", str(args.duration), "-vf", f"fps={fps},scale={width}:{height}",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], stdout=subprocess.PIPE)
    encode = subprocess.Popen([args.ffmpeg, "-v", "error", "-y", "-f", "rawvideo",
        "-pix_fmt", "gray", "-s", f"{width}x{height}", "-r", str(fps), "-i", "pipe:0",
        "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12",
        "-pix_fmt", "yuv420p", args.output], stdin=subprocess.PIPE)
    options = mp.tasks.vision.ImageSegmenterOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=args.model),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        output_confidence_masks=True, output_category_mask=False)
    count = 0
    try:
        with mp.tasks.vision.ImageSegmenter.create_from_options(options) as segmenter:
            while True:
                raw = decode.stdout.read(width * height * 3)
                if not raw:
                    break
                if len(raw) != width * height * 3:
                    raise RuntimeError("Incomplete video frame")
                rgb = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3)
                result = segmenter.segment_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), round(count * 1000 / fps))
                confidence = result.confidence_masks[0].numpy_view()
                # The binary selfie model's sole confidence output is foreground.
                alpha = np.clip((confidence - 0.15) / 0.7, 0, 1)
                alpha = cv2.GaussianBlur(alpha, (3, 3), 0.6)
                encode.stdin.write((alpha * 255).astype(np.uint8).tobytes())
                count += 1
                if count % 30 == 0:
                    print(f"mask_seconds={count/fps:.2f}", flush=True)
        encode.stdin.close()
        if decode.wait() != 0 or encode.wait() != 0 or count == 0:
            raise RuntimeError("Person mask encoding failed")
    finally:
        for child in (decode, encode):
            if child.poll() is None:
                child.kill()
                child.wait()
    print(f"mask_frames={count}", flush=True)


if __name__ == "__main__":
    main()
