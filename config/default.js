export default {
  appName: "ASKEdits",
  serverPort: Number(process.env.PORT ?? 8787),
  serverHost: process.env.HOST ?? "127.0.0.1",
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  upload: {
    storageRoot: process.env.STORAGE_ROOT ?? "storage/assets",
    maxFileSizeBytes: 2 * 1024 * 1024 * 1024,
    chunkSizeBytes: 5 * 1024 * 1024
  },
  media: {
    ffmpegBin: process.env.FFMPEG_BIN ?? "ffmpeg",
    ffprobeBin: process.env.FFPROBE_BIN ?? "ffprobe",
    optimized: {
      crf: 27,
      preset: "fast"
    },
    proxy: {
      width: 854,
      maxHeight: 480,
      crf: 32,
      preset: "veryfast",
      tiers: {
        low: { width: 640, maxHeight: 360, crf: 35, preset: "ultrafast" },
        medium: { width: 854, maxHeight: 480, crf: 32, preset: "veryfast" },
        high: { width: 1280, maxHeight: 720, crf: 28, preset: "fast" }
      }
    },
    gpu: {
      enabled: process.env.GPU_ACCELERATION !== "false",
      preferredEncoder: process.env.GPU_ENCODER ?? "auto",
      nvencPreset: process.env.NVENC_PRESET ?? "p4",
      nvencCq: Number(process.env.NVENC_CQ ?? 28)
    },
    thumbnail: {
      width: 640
    },
    audio: {
      sampleRate: 16000,
      channels: 1,
      codec: "pcm_s16le",
      format: "wav"
    },
    transcription: {
      model: process.env.FASTER_WHISPER_MODEL ?? "tiny",
      task: process.env.FASTER_WHISPER_TASK ?? "transcribe",
      language: process.env.FASTER_WHISPER_LANGUAGE ?? "auto",
      beamSize: Number(process.env.FASTER_WHISPER_BEAM_SIZE ?? 5),
      vadFilter: process.env.FASTER_WHISPER_VAD_FILTER !== "false",
      wordTimestamps: process.env.FASTER_WHISPER_WORD_TIMESTAMPS !== "false",
      device: process.env.FASTER_WHISPER_DEVICE ?? "auto",
      computeType: process.env.FASTER_WHISPER_COMPUTE_TYPE ?? "auto",
      silenceThresholdSec: Number(process.env.TRANSCRIPT_SILENCE_THRESHOLD_SEC ?? 0.7),
      speakerSectionGapSec: Number(process.env.TRANSCRIPT_SPEAKER_SECTION_GAP_SEC ?? 2.4),
      // Groq Whisper API — primary transcription path (faster-whisper GPU is the fallback)
      groqWhisperModel: process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3"
    }
  },
  ai: {
    provider: process.env.AI_PROVIDER ?? "groq",
    // --- OpenRouter (used EXCLUSIVELY for Co-Editor chat) ---
    openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
    openrouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    openrouterPrimaryModel: process.env.OPENROUTER_PRIMARY_MODEL ?? "qwen/qwen3-next-80b-a3b-instruct:free",
    openrouterFastModel: process.env.OPENROUTER_FAST_MODEL ?? "qwen/qwen3-next-80b-a3b-instruct:free",
    openrouterSiteUrl: process.env.OPENROUTER_SITE_URL ?? "http://localhost:5173",
    openrouterSiteName: process.env.OPENROUTER_SITE_NAME ?? "ASKEdits",
    // --- Groq (used for ALL edit planning, analysis, style, viral moments) ---
    groqApiKey: process.env.GROQ_API_KEY ?? "",
    groqBaseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
    groqPrimaryModel: process.env.GROQ_PRIMARY_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct",
    groqFastModel: process.env.GROQ_FAST_MODEL ?? "llama-3.1-8b-instant",
    // Resolved models (used as defaults by services that import config.ai.primaryModel / fastModel)
    primaryModel: process.env.AI_PRIMARY_MODEL ?? process.env.GROQ_PRIMARY_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct",
    fastModel: process.env.AI_FAST_MODEL ?? process.env.GROQ_FAST_MODEL ?? "llama-3.1-8b-instant",
    temperature: 0.3,
    maxRetries: 2,
    retryDelayMs: 1500
  },
  broll: {
    pexelsApiKey: process.env.PEXELS_API_KEY ?? "",
    pixabayApiKey: process.env.PIXABAY_API_KEY ?? "",
    preferredResolution: "hd"
  },
  aiBroll: {
    enabled: process.env.AI_BROLL_ENABLED === "true",
    replicateApiToken: process.env.REPLICATE_API_TOKEN ?? "",
    defaultModel: process.env.AI_BROLL_MODEL ?? "stability-ai/stable-video-diffusion",
    maxDurationSec: 4,
    fallbackToStock: true
  },
  audio: {
    voiceCleanup: true,
    sfx: { enabled: true, style: "minimal" }
  },
  export: {
    defaultFormat: "original",
    defaultQuality: "standard"
  },
  renderQueue: {
    maxConcurrency: Number(process.env.RENDER_QUEUE_CONCURRENCY ?? 2),
    maxQueueSize: 50
  },
  coEditor: {
    maxHistoryMessages: 20,
    temperature: 0.6
  }
}
