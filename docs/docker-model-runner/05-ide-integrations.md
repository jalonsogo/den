# IDE and Tool Integrations

Source: https://docs.docker.com/ai/model-runner/ide-integrations/

Docker Model Runner acts as a local backend for AI coding assistants and development tools via its OpenAI-compatible API.

## Prerequisites

1. Enable Docker Model Runner in Docker Desktop or Docker Engine
2. Activate TCP host access:
   - **Docker Desktop:** Enable **host-side TCP support** in Settings → AI, or run:
     ```console
     $ docker desktop enable model-runner --tcp 12434
     ```
   - **Docker Engine:** TCP is enabled by default on port 12434
3. Pull a model:
   ```console
   $ docker model pull ai/qwen2.5-coder
   ```

> **Context size note:** Many models default to 4,096 tokens, which is limiting for coding tasks. Consider models with 128K context built in: `ai/glm-4.7-flash`, `ai/qwen2.5-coder`, `ai/devstral-small-2`.

## Recommended Models by Use Case

| Use Case | Model | Notes |
|----------|-------|-------|
| Code completion | `ai/qwen3-coder` | Large context, optimized for coding |
| Agentic coding | `ai/devstral-small-2` | Claude Code, OpenCode compatible |
| General assistant | `ai/llama3.2` | Balanced capabilities |
| Small/fast | `ai/smollm2` | Low resource usage |
| Embeddings | `ai/all-minilm` | RAG and semantic search |

---

## Cline (VS Code)

1. Open VS Code → Cline extension settings
2. Select **OpenAI Compatible** as API provider
3. Configure:

| Setting | Value |
|---------|-------|
| Base URL | `http://localhost:12434/engines/v1` |
| API Key | `not-needed` |
| Model ID | `ai/qwen2.5-coder` |

> **Important:** The base URL must include `/engines/v1` at the end. No trailing slash.

**Troubleshoot:**

```console
$ docker model status
$ curl http://localhost:12434/engines/v1/models
```

---

## Continue (VS Code / JetBrains)

**OpenAI provider** (`~/.continue/config.json`):

```json
{
  "models": [
    {
      "title": "Docker Model Runner",
      "provider": "openai",
      "model": "ai/qwen2.5-coder",
      "apiBase": "http://localhost:12434/engines/v1",
      "apiKey": "not-needed"
    }
  ]
}
```

**Ollama provider:**

```json
{
  "models": [
    {
      "title": "Docker Model Runner (Ollama)",
      "provider": "ollama",
      "model": "ai/qwen2.5-coder",
      "apiBase": "http://localhost:12434"
    }
  ]
}
```

---

## Cursor

1. Open Cursor Settings (`Cmd/Ctrl + ,`)
2. Navigate to **Models** → **OpenAI API Key**
3. Configure:

| Setting | Value |
|---------|-------|
| OpenAI API Key | `not-needed` |
| Override OpenAI Base URL | `http://localhost:12434/engines/v1` |

4. Enter model name in dropdown: `ai/qwen2.5-coder`

> Some Cursor features may require models with specific capabilities (e.g., function calling).

---

## Zed

Config at `~/.config/zed/settings.json`:

```json
{
  "language_models": {
    "openai": {
      "api_url": "http://localhost:12434/engines/v1",
      "available_models": [
        {
          "name": "ai/qwen2.5-coder",
          "display_name": "Qwen 2.5 Coder (DMR)",
          "max_tokens": 8192
        }
      ]
    }
  }
}
```

---

## Aider

```bash
export OPENAI_API_BASE=http://localhost:12434/engines/v1
export OPENAI_API_KEY=not-needed

aider --model openai/ai/qwen2.5-coder
```

Or as a single command:

```console
$ aider --openai-api-base http://localhost:12434/engines/v1 \
        --openai-api-key not-needed \
        --model openai/ai/qwen2.5-coder
```

---

## Claude Code

Uses the Anthropic-compatible API (not the OpenAI API):

**macOS/Linux:**

```bash
ANTHROPIC_BASE_URL=http://localhost:12434 claude --model qwen2.5-coder
```

**Windows (PowerShell):**

```powershell
$env:ANTHROPIC_BASE_URL="http://localhost:12434"
claude --model gpt-oss:32k
```

**Persistent (add to shell profile):**

```shell
export ANTHROPIC_BASE_URL=http://localhost:12434
```

---

## OpenCode

Config at `~/.config/opencode/opencode.json` or project-local `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "dmr": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Docker Model Runner",
      "options": {
        "baseURL": "http://localhost:12434/v1"
      },
      "models": {
        "ai/qwen2.5-coder": {
          "name": "ai/qwen2.5-coder"
        },
        "ai/llama3.2": {
          "name": "ai/llama3.2"
        }
      }
    }
  }
}
```

---

## LangChain

**Python:**

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="http://localhost:12434/engines/v1",
    api_key="not-needed",
    model="ai/qwen2.5-coder"
)

response = llm.invoke("Write a hello world function in Python")
print(response.content)
```

**JavaScript/TypeScript:**

```typescript
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  configuration: {
    baseURL: "http://localhost:12434/engines/v1",
  },
  apiKey: "not-needed",
  modelName: "ai/qwen2.5-coder",
});

const response = await model.invoke("Write a hello world function");
console.log(response.content);
```

---

## LlamaIndex

```python
from llama_index.llms.openai_like import OpenAILike

llm = OpenAILike(
    api_base="http://localhost:12434/engines/v1",
    api_key="not-needed",
    model="ai/qwen2.5-coder"
)

response = llm.complete("Write a hello world function")
print(response.text)
```

---

## Common Issues

| Problem | Solution |
|---------|---------|
| Connection refused | Verify DMR is running: `docker model status`; test: `curl http://localhost:12434/engines/v1/models` |
| Model not found | Check: `docker model list`; use full name with namespace (e.g., `ai/qwen2.5-coder`) |
| Slow responses | First request loads model; subsequent requests are faster. Try smaller models or reduced context |
| CORS errors | Add origin to Docker Desktop → Settings → AI → **CORS Allowed Origins** |
| WSL networking | Configure mirrored networking in WSL to connect to host DMR |
