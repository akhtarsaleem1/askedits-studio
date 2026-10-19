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

        # On Windows, we need to explicitly add DLL directories for CUDA packages
        if sys.platform == "win32":
             # Look for nvidia packages in the candidate dir
             for pkg in ["nvidia_cublas_cu12", "nvidia_cudnn_cu12", "nvidia_cuda_nvrtc_cu12"]:
                 dll_dir = os.path.join(candidate, pkg, "bin")
                 if os.path.isdir(dll_dir):
                     try:
                         os.add_dll_directory(dll_dir)
                     except Exception:
                         pass


def resolve_runtime_settings(args) -> tuple[str, str]:
    device = args.device
    compute_type = args.compute_type

    if device != "auto" and compute_type != "auto":
        return device, compute_type

    try:
        import ctranslate2

        has_cuda = ctranslate2.get_cuda_device_count() > 0
    except Exception:
        has_cuda = False

    if device == "auto":
        device = "cuda" if has_cuda else "cpu"

    if compute_type == "auto":
        compute_type = "float16" if device == "cuda" else "int8"

    return device, compute_type


def build_payload(result_info, segments, args, device, compute_type):
    payload_segments = []

    for segment in segments:
        words = []

        for word in getattr(segment, "words", []) or []:
            words.append(
                {
                    "word": word.word,
                    "start": word.start,
                    "end": word.end,
                    "probability": word.probability,
                }
            )

        payload_segments.append(
            {
                "id": segment.id,
                "seek": getattr(segment, "seek", None),
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
                "avg_logprob": getattr(segment, "avg_logprob", None),
                "compression_ratio": getattr(segment, "compression_ratio", None),
                "no_speech_prob": getattr(segment, "no_speech_prob", None),
                "words": words,
            }
        )

    return {
        "provider": "faster-whisper",
        "model": args.model,
        "device": device,
        "computeType": compute_type,
        "task": args.task,
        "language": getattr(result_info, "language", None),
        "languageProbability": getattr(result_info, "language_probability", None),
        "duration": getattr(result_info, "duration", None),
        "segments": payload_segments,
    }


def should_retry_on_cpu(error: Exception) -> bool:
    message = str(error).lower()
    return "cublas" in message or "cuda" in message or "cudnn" in message


def run_transcription(model, args):
    language = None if args.language in ("", "auto") else args.language
    return model.transcribe(
        args.input,
        task=args.task,
        language=language,
        beam_size=args.beam_size,
        vad_filter=args.vad_filter,
        word_timestamps=args.word_timestamps,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe audio with Faster-Whisper.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--raw-output", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--task", default="transcribe")
    parser.add_argument("--language", default="auto")
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--compute-type", default="auto")
    parser.add_argument("--vad-filter", action="store_true")
    parser.add_argument("--word-timestamps", action="store_true")
    args = parser.parse_args()

    add_extra_python_paths()

    try:
        from faster_whisper import WhisperModel
    except ImportError as error:
        print(
            "faster-whisper is not installed for the selected Python runtime. "
            "Install it with `<python> -m pip install faster-whisper` or provide a PYTHON_BIN/PYTHONPATH that can import it.",
            file=sys.stderr,
        )
        print(str(error), file=sys.stderr)
        return 1

    device, compute_type = resolve_runtime_settings(args)

    try:
        print(f"Loading Whisper model '{args.model}' on {device} ({compute_type})...", file=sys.stderr)
        model = WhisperModel(args.model, device=device, compute_type=compute_type)
        print("Model loaded successfully.", file=sys.stderr)
    except Exception as error:
        if device == "cuda" and should_retry_on_cpu(error):
            print(
                "CUDA runtime was detected but could not be loaded cleanly. Falling back to CPU transcription.",
                file=sys.stderr,
            )
            device = "cpu"
            compute_type = "int8"
            print(f"Loading Whisper model '{args.model}' on {device} ({compute_type})...", file=sys.stderr)
            model = WhisperModel(args.model, device=device, compute_type=compute_type)
            print("Model loaded successfully.", file=sys.stderr)
        else:
            raise

    try:
        print(f"Starting transcription for {args.input}...", file=sys.stderr)
        segments_gen, result_info = run_transcription(model, args)
        print(f"Transcription engine initialized. Processing segments...", file=sys.stderr)
        
        segments = []
        duration = result_info.duration
        for segment in segments_gen:
            segments.append(segment)
            if duration > 0:
                pct = min(99, int((segment.end / duration) * 100))
                print(f"PROGRESS:{pct}", file=sys.stderr, flush=True)
                
    except Exception as error:
        if device == "cuda" and should_retry_on_cpu(error):
            print(
                "CUDA inference failed during transcription. Falling back to CPU transcription.",
                file=sys.stderr,
            )
            device = "cpu"
            compute_type = "int8"
            model = WhisperModel(args.model, device=device, compute_type=compute_type)
            segments_gen, result_info = run_transcription(model, args)
            
            segments = []
            duration = result_info.duration
            for segment in segments_gen:
                segments.append(segment)
                if duration > 0:
                    pct = min(99, int((segment.end / duration) * 100))
                    print(f"PROGRESS:{pct}", file=sys.stderr, flush=True)
        else:
            raise

    payload = build_payload(result_info, segments, args, device, compute_type)

    with open(args.raw_output, "w", encoding="utf-8") as raw_handle:
      json.dump(payload, raw_handle, ensure_ascii=False, indent=2)

    with open(args.output, "w", encoding="utf-8") as placeholder_handle:
      placeholder_handle.write("{}")

    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
