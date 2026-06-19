# Inference Engines

Source: https://docs.docker.com/ai/model-runner/inference-engines/

Docker Model Runner supports three inference engines, each optimized for different workloads.

## Engine Comparison

| Engine | Purpose | Format | Platform |
|--------|---------|--------|----------|
| **llama.cpp** | Local dev, efficiency, CPU/GPU | GGUF (quantized) | macOS, Windows, Linux (all backends) |
| **vLLM** | Production, high throughput | Safetensors | Linux x86_64, Windows WSL2 (NVIDIA CUDA only) |
| **Diffusers** | Image generation | Safetensors | Linux x86_64/ARM64 (NVIDIA CUDA only) |

Multiple engines can operate simultaneously, with automatic routing based on model specifications or explicit backend selection.

---

## llama.cpp

The most versatile option — supports CPU-only inference and runs on all platforms including macOS, Windows, and Linux. Excels in resource-constrained environments through built-in quantization.

**Model format:** GGUF

**Quantization:** Recommended level is `Q4_K_M` — approximately 4.5 bits per weight, best balance of quality and memory usage for most use cases.

**API path:** `/engines/llama.cpp/v1/chat/completions`

---

## vLLM

Optimized for production workloads with high throughput. Delivers superior throughput when handling multiple concurrent requests on powerful GPUs.

**Requirements:**
- NVIDIA CUDA-capable hardware
- Linux x86_64 or Windows with WSL2

**Model format:** Safetensors (typically larger than quantized GGUF but potentially higher quality/speed)

**API path:** `/engines/vllm/v1/chat/completions`

---

## Diffusers

Specialized for image generation workflows using Stable Diffusion models.

**Requirements:**
- NVIDIA CUDA
- Linux x86_64 or ARM64

**API path:** `/engines/diffusers/v1/images/generations`

See [API Reference — Image Generation](./02-api-reference.md) for usage examples.

---

## API Routing

Specify an engine explicitly in the API path, or use the generic `/engines/v1/` prefix and let DMR route automatically based on the model's format.

| Explicit Path | Engine |
|---------------|--------|
| `/engines/llama.cpp/v1/chat/completions` | llama.cpp |
| `/engines/vllm/v1/chat/completions` | vLLM |
| `/engines/diffusers/v1/images/generations` | Diffusers |
| `/engines/v1/chat/completions` | Auto-selected |
