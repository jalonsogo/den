# Configuration Options

Source: https://docs.docker.com/ai/model-runner/configuration/

## Context Size

The context size determines the maximum number of tokens the model processes per request.

**Engine defaults:**
- **llama.cpp:** 4096 tokens
- **vLLM:** Uses the model's maximum trained context size

### Configure via CLI

```bash
docker model configure --context-size 8192 ai/qwen2.5-coder
```

### Configure via Compose

```yaml
models:
  llm:
    model: ai/qwen2.5-coder
    context_size: 8192
```

### Context Size Guidelines

| Size | Use Case | Memory Impact |
|------|----------|---------------|
| 2,048 | Simple queries, short snippets | Low |
| 4,096 | Standard conversations, medium files | Moderate |
| 8,192 | Long conversations, large files | Higher |
| 16,384+ | Extended documents, multi-file analysis | High |

Each additional 1,000 tokens requires approximately 100–500 MB of additional memory depending on model size.

Inspect a model's capabilities:

```bash
docker model inspect ai/qwen2.5-coder
```

---

## Runtime Flags (llama.cpp)

Pass parameters for fine-grained control over sampling, performance, and GPU behavior.

**Compose format:**

```yaml
models:
  llm:
    model: ai/qwen2.5-coder
    context_size: 4096
    runtime_flags:
      - "--temp"
      - "0.7"
      - "--top-p"
      - "0.9"
```

**CLI format:**

```bash
docker model configure ai/qwen2.5-coder -- --temp 0.7 --top-p 0.9
```

### Sampling Parameters

| Flag | Description | Default | Range |
|------|-------------|---------|-------|
| `--temp` | Temperature (lower = deterministic, higher = creative) | 0.8 | 0.0–2.0 |
| `--top-k` | Limit to top K tokens | 40 | 1–100 |
| `--top-p` | Nucleus sampling threshold | 0.9 | 0.0–1.0 |
| `--min-p` | Minimum probability threshold | 0.05 | 0.0–1.0 |
| `--repeat-penalty` | Penalty for repeating tokens | 1.1 | 1.0–2.0 |

### Performance Parameters

| Flag | Description | Default | Notes |
|------|-------------|---------|-------|
| `--threads` | CPU threads for generation | Auto | Set to performance core count |
| `--threads-batch` | CPU threads for batch processing | Auto | Usually matches `--threads` |
| `--batch-size` | Batch size for prompt processing | 512 | Higher = faster prompt processing |
| `--mlock` | Lock model in memory | Off | Prevents swapping |
| `--no-mmap` | Disable memory mapping | Off | May improve performance on some systems |

### GPU Parameters

| Flag | Description | Default | Notes |
|------|-------------|---------|-------|
| `--n-gpu-layers` | Layers to offload to GPU | All (if available) | Reduce if VRAM constrained |
| `--main-gpu` | GPU for computation | 0 | For multi-GPU systems |
| `--split-mode` | GPU split method | layer | Options: `none`, `layer`, `row` |

### Advanced Parameters

| Flag | Description | Default |
|------|-------------|---------|
| `--rope-scaling` | RoPE scaling method | Auto |
| `--rope-freq-base` | RoPE base frequency | Model default |
| `--rope-freq-scale` | RoPE frequency scale | Model default |
| `--no-prefill-assistant` | Disable assistant pre-fill | Off |
| `--reasoning-budget` | Token budget for reasoning models | 0 (disabled) |

---

## vLLM Configuration

Override HuggingFace model config as JSON:

```bash
docker model configure --hf_overrides '{"rope_scaling": {"type": "dynamic", "factor": 2.0}}' ai/model-vllm
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LLM_URL` | Auto-injected model endpoint URL |
| `LLM_MODEL` | Auto-injected model identifier |

---

## Configuration Presets

### Code Completion (fast, deterministic)

```yaml
models:
  coder:
    model: ai/qwen2.5-coder
    context_size: 4096
    runtime_flags:
      - "--temp"
      - "0.1"
      - "--top-k"
      - "1"
      - "--batch-size"
      - "1024"
```

### Chat Assistant (balanced)

```yaml
models:
  assistant:
    model: ai/llama3.2
    context_size: 8192
    runtime_flags:
      - "--temp"
      - "0.7"
      - "--top-p"
      - "0.9"
      - "--repeat-penalty"
      - "1.1"
```

### Creative Writing (high temperature)

```yaml
models:
  writer:
    model: ai/llama3.2
    context_size: 8192
    runtime_flags:
      - "--temp"
      - "1.2"
      - "--top-p"
      - "0.95"
      - "--repeat-penalty"
      - "1.0"
```

### Long Document Analysis (large context)

```yaml
models:
  analyzer:
    model: ai/qwen2.5-coder:14B
    context_size: 32768
    runtime_flags:
      - "--mlock"
      - "--batch-size"
      - "2048"
```

### Low Memory System

```yaml
models:
  efficient:
    model: ai/smollm2:360M-Q4_K_M
    context_size: 2048
    runtime_flags:
      - "--threads"
      - "4"
```

---

## Reset to Defaults

Use `-1` to reset any parameter:

```bash
docker model configure --context-size -1 ai/qwen2.5-coder
```

Configuration persists until explicitly reset.
