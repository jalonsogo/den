# API Reference

Source: https://docs.docker.com/ai/model-runner/api-reference/

Docker Model Runner provides REST API endpoints compatible with OpenAI, Anthropic, and Ollama API formats.

## Base URLs

### Docker Desktop

| Access From | URL |
|-------------|-----|
| Containers | `http://model-runner.docker.internal` |
| Host (TCP enabled) | `http://localhost:12434` |

> Compose services may need `extra_hosts: ["model-runner.docker.internal:host-gateway"]`.

### Docker Engine (Linux)

| Access From | URL |
|-------------|-----|
| Containers | `http://172.17.0.1:12434` |
| Host processes | `http://localhost:12434` |

### SDK Base URL Summary

| SDK / Tool | Base URL |
|------------|----------|
| OpenAI SDK | `http://localhost:12434/engines/v1` |
| Anthropic SDK | `http://localhost:12434` |
| Ollama clients | `http://localhost:12434` |

---

## OpenAI-Compatible API

### Endpoints

| Path | Method | Function |
|------|--------|----------|
| `/engines/v1/models` | GET | List available models |
| `/engines/v1/models/{namespace}/{name}` | GET | Retrieve a specific model |
| `/engines/v1/chat/completions` | POST | Chat completion |
| `/engines/v1/completions` | POST | Text completion |
| `/engines/v1/embeddings` | POST | Generate embeddings |

Optional engine-specific path: `/engines/llama.cpp/v1/chat/completions`

### Model Naming

| Format | Example |
|--------|---------|
| Docker Hub namespace | `ai/smollm2`, `ai/llama3.2` |
| With tag | `ai/smollm2:360M-Q4_K_M` |
| Custom | `myorg/mymodel` |

### Request Parameters

| Parameter | Type | Details |
|-----------|------|---------|
| `model` | string | Required |
| `messages` | array | Required for chat |
| `prompt` | string | Required for completions |
| `max_tokens` | integer | Token generation limit |
| `temperature` | float | 0.0–2.0 sampling range |
| `top_p` | float | 0.0–1.0 nucleus sampling |
| `stream` | boolean | Enable streaming |
| `stop` | string/array | Sequence terminators |
| `presence_penalty` | float | –2.0 to 2.0 |
| `frequency_penalty` | float | –2.0 to 2.0 |

### Behavioral Notes

- No API key authentication required
- Function calling supported via llama.cpp
- Vision support for multi-modal models (LLaVA)
- JSON mode: `"response_format": {"type": "json_object"}`

### Examples

**From host (TCP):**

```bash
curl http://localhost:12434/engines/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "ai/smollm2", "messages": [{"role": "system", "content": "You are a helpful assistant."}, {"role": "user", "content": "Please write 500 words about the fall of Rome."}]}'
```

**From container:**

```bash
curl http://model-runner.docker.internal/engines/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "ai/smollm2", "messages": [{"role": "user", "content": "Hello!"}]}'
```

**Streaming:**

```bash
curl http://localhost:12434/engines/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "ai/smollm2", "stream": true, "messages": [{"role": "user", "content": "Count from 1 to 10"}]}'
```

**Via Unix socket:**

```bash
curl --unix-socket $HOME/.docker/run/docker.sock \
    localhost/exp/vDD4.40/engines/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{"model": "ai/smollm2", "messages": [{"role": "user", "content": "Hello!"}]}'
```

---

## Anthropic-Compatible API

### Endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/anthropic/v1/messages` | POST | Create message |
| `/anthropic/v1/messages/count_tokens` | POST | Count tokens |

### Parameters

| Parameter | Type | Purpose |
|-----------|------|---------|
| `model` | string | Required |
| `messages` | array | Required |
| `max_tokens` | integer | Generation limit |
| `temperature` | float | 0.0–1.0 |
| `top_p` | float | Nucleus sampling |
| `top_k` | integer | Top-k sampling |
| `stream` | boolean | Streaming output |
| `stop_sequences` | array | Custom terminators |
| `system` | string | System prompt |

### Examples

**Basic:**

```bash
curl http://localhost:12434/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model": "ai/smollm2", "max_tokens": 1024, "messages": [{"role": "user", "content": "Hello!"}]}'
```

**Streaming:**

```bash
curl http://localhost:12434/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model": "ai/smollm2", "max_tokens": 1024, "stream": true, "messages": [{"role": "user", "content": "Count from 1 to 10"}]}'
```

---

## Ollama-Compatible API

### Endpoints

| Path | Method | Function |
|------|--------|----------|
| `/api/tags` | GET | List models |
| `/api/show` | POST | Model information |
| `/api/chat` | POST | Chat completion |
| `/api/generate` | POST | Text completion |
| `/api/embeddings` | POST | Generate embeddings |

### Examples

**Chat:**

```bash
curl http://localhost:12434/api/chat \
  -H "Content-Type: application/json" \
  -d '{"model": "ai/smollm2", "messages": [{"role": "user", "content": "Hello!"}]}'
```

**List models:**

```bash
curl http://localhost:12434/api/tags
```

---

## Image Generation API (Diffusers)

> **Requirement:** NVIDIA GPU with CUDA, Linux x86_64/ARM64 only.

### Endpoint

| Path | Method | Function |
|------|--------|----------|
| `/engines/diffusers/v1/images/generations` | POST | Text-to-image |

### Parameters

| Parameter | Type | Details |
|-----------|------|---------|
| `model` | string | e.g. `stable-diffusion:Q4` |
| `prompt` | string | Image description |
| `size` | string | `WIDTHxHEIGHT` |

### Response

```json
{"data": [{"b64_json": "<base64-encoded-image>"}]}
```

### Example

```bash
curl -s -X POST http://localhost:12434/engines/diffusers/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"model": "stable-diffusion:Q4", "prompt": "A picture of a nice cat", "size": "512x512"}' \
  | jq -r '.data[0].b64_json' | base64 -d > image.png
```

---

## DMR Native Endpoints

| Path | Method | Function |
|------|--------|----------|
| `/models/create` | POST | Pull/create model |
| `/models` | GET | List local models |
| `/models/{namespace}/{name}` | GET | Model details |
| `/models/{namespace}/{name}` | DELETE | Remove model |

---

## SDK Integration

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:12434/engines/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="ai/smollm2",
    messages=[{"role": "user", "content": "Hello!"}]
)

print(response.choices[0].message.content)
```

### Node.js (OpenAI SDK)

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:12434/engines/v1',
  apiKey: 'not-needed',
});

const response = await client.chat.completions.create({
  model: 'ai/smollm2',
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(response.choices[0].message.content);
```
