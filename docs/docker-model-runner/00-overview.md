# Docker Model Runner — Overview

Source: https://docs.docker.com/ai/model-runner/

Docker Model Runner (DMR) makes it easy to manage, run, and deploy AI models using Docker. It integrates with Docker Desktop and Docker Engine, serving models through OpenAI-compatible, Anthropic-compatible, and Ollama-compatible APIs.

## Key Features

- Pull/push models from Docker Hub, OCI-compliant registries, or Hugging Face
- Serve via OpenAI-compatible, Anthropic-compatible, and Ollama-compatible APIs
- Three inference engines: llama.cpp, vLLM, Diffusers
- Image generation from text using Stable Diffusion
- Package GGUF and Safetensors files as OCI Artifacts
- CLI and GUI interaction options
- IDE tool connectivity (Cline, Continue, Cursor, Aider, Claude Code, Zed, OpenCode)
- Configurable context size and model parameters
- Open WebUI integration (ChatGPT-like interface)
- Multi-turn conversational support

## Platform Requirements

| Platform | Requirements |
|----------|-------------|
| **Windows (amd64)** | NVIDIA GPU with drivers 576.57+ |
| **Windows (arm64)** | Qualcomm Adreno GPU (6xx+); OpenCL for Adreno |
| **macOS** | Apple Silicon only |
| **Linux** | CPU, NVIDIA CUDA (driver 575.57.08+), AMD ROCm, or Vulkan |

## Inference Engines

| Engine | Purpose | Model Format |
|--------|---------|-------------|
| llama.cpp | Local development, efficiency, CPU/GPU | GGUF (quantized) |
| vLLM | Production, high throughput | Safetensors |
| Diffusers | Image generation (Stable Diffusion) | Safetensors |

## Privacy

Data collection follows Docker Desktop settings. Only minimal non-personal data is collected: model names (via HEAD requests), user agent, request origin.

## Documentation Index

| Page | Description |
|------|-------------|
| [Get Started](./01-get-started.md) | Install, pull, and run your first model |
| [API Reference](./02-api-reference.md) | OpenAI, Anthropic, Ollama, and DMR native endpoints |
| [Configuration](./03-configuration.md) | Context size, runtime flags, presets |
| [Inference Engines](./04-inference-engines.md) | llama.cpp, vLLM, Diffusers |
| [IDE Integrations](./05-ide-integrations.md) | Cline, Continue, Cursor, Zed, Aider, LangChain, OpenCode, Claude Code |
| [Open WebUI](./06-open-webui.md) | ChatGPT-like interface with Docker Compose |

## Feedback

File issues at the Docker GitHub repository.
