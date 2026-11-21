# Installation

## Requirements

- **Docker & Docker Compose**
- **Google Gemini API Key** ([Free — get it here](https://aistudio.google.com/app/apikey)) — required for all AI features
- **fal.ai API Key** ([Pay-per-use](https://fal.ai)) — required for AI Shorts (actor generation, video, lip-sync)
- **ElevenLabs API Key** ([Free tier](https://elevenlabs.io)) — required for voiceover/dubbing
- **Upload-Post API Key** ([free tier](https://upload-post.com)) — required for direct social posting

---

## Getting Started

### 1. Clone
```bash
git clone https://github.com/KeyVux/openshorts.git
cd openshorts
```

### 2. Configure (optional)
```bash
cp .env.example .env
# Edit .env with your AWS keys for S3 backup
```

### 3. Launch
```bash
docker compose up --build
```

### 4. Open Dashboard
Navigate to **`http://localhost:5175`**

1. Go to **Settings** and enter your API keys (Gemini, fal.ai, ElevenLabs, Upload-Post)
2. **Clip Generator**: Upload a long-form video to generate viral shorts
3. **AI Shorts**: Describe your product or paste a URL to generate UGC marketing videos
4. **YouTube Studio**: Generate thumbnails, titles, and descriptions for YouTube
5. **UGC Gallery**: Browse all generated videos and avatars
6. **AI Agent**: Drop vertical videos in a folder and an agent skill picks, edits and queues clips for your approval

### 5. GPU acceleration (optional, NVIDIA)

The default image is CPU-only. With an NVIDIA card (any card with NVENC, e.g. RTX 4060) an 8-minute video clips in about a minute instead of 5 to 8. Nothing is passed through in the VM sense — the container just gets access to the host GPU.

**Host:** install the NVIDIA driver (`nvidia-smi` must work) and the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html):
```bash
sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker
docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi   # sanity check
```
On Windows use Docker Desktop with the WSL2 backend and the Windows NVIDIA driver; no driver inside WSL.

**Compose:** create `docker-compose.override.yml` next to `docker-compose.yml` (picked up automatically). `GPU: "1"` adds cuBLAS/cuDNN and onnxruntime-gpu to the image (~2 GB); `video` is required for NVENC.
```yaml
services:
  backend:
    build:
      context: .
      args:
        GPU: "1"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu, video]
```

**`.env`:**
```
WHISPER_MODEL=large-v3-turbo
WHISPER_DEVICE=cuda
WHISPER_COMPUTE=float16
FFMPEG_ENCODER=auto           # probes h264_nvenc at startup, falls back to x264
TRANSCRIBE_BACKEND=parakeet   # optional: ~2x faster than whisper, 25 European languages, auto-falls back to whisper
ASR_GPU_CONCURRENCY=1
```

**Verify:**
```bash
docker compose up --build -d
docker exec openshorts-backend nvidia-smi -L
docker exec openshorts-backend ffmpeg -hide_banner -f lavfi -i testsrc=size=256x256:rate=1 -frames:v 1 -c:v h264_nvenc -f null -
```
The backend log on the first job reports the chosen encoder and transcription device. A CUDA error in whisper (e.g. VRAM exhausted) retries once on CPU automatically. 8 GB of VRAM is enough for `large-v3-turbo` fp16 plus the detection models.

---

### 6. Run without a Google key (local LLM, optional)

The only cloud call in the clip pipeline is the moment picker: it sends the
transcript (never the video) to Gemini. Point it at any OpenAI-compatible
server instead and the whole pipeline stays on your box:

```bash
# .env
LLM_BASE_URL=http://host.docker.internal:11434/v1   # Ollama on the host
LLM_MODEL=qwen2.5:14b                                # any chat model that follows instructions
# LLM_API_KEY=...                                    # only if your server checks one (vLLM --api-key, OpenRouter)
```

Works with Ollama, LM Studio, vLLM, llama.cpp server, LocalAI and OpenRouter.
The dashboard stops asking for a Gemini key when this is set. Two things to
know:

- **Context length.** A scoring call carries three transcript windows
  (~2-3k tokens) and the detail call up to ten (~5k on a long podcast).
  Ollama defaults to a 4096-token context and truncates silently, so run it
  with `OLLAMA_CONTEXT_LENGTH=16384` (or set `num_ctx` in a Modelfile); raise
  `LLM_SCORE_BATCH` above 3 only if your context allows it. 7-8B models
  return valid JSON reliably, 3B ones do not.
- **What still needs Gemini.** Anything that has to look at frames: the
  automatic layout picker (`AUTO_LAYOUT`), the on-screen content detector
  and silent videos (no speech to clip by). Without a Gemini key those fall
  back to the plain face-tracking crop, and a silent video fails with a
  message that says so. Add a key alongside `LLM_BASE_URL` and you get both.
