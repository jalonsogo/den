# Open WebUI Integration

Source: https://docs.docker.com/ai/model-runner/openwebui-integration/

Open WebUI is an open-source, self-hosted web interface that provides a ChatGPT-like experience for local AI models. It integrates with Docker Model Runner to deliver a polished chat interface.

## Prerequisites

- Docker Model Runner with TCP access enabled
- A pulled model:
  ```bash
  docker model pull ai/llama3.2
  ```

## Quick Start with Docker Compose

Create a `compose.yaml`:

```yaml
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    ports:
      - "3000:8080"
    environment:
      OLLAMA_BASE_URL: http://host.docker.internal:12434
      WEBUI_AUTH: "false"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - open-webui:/app/backend/data

volumes:
  open-webui:
```

Start:

```bash
docker compose up -d
```

Access at [http://localhost:3000](http://localhost:3000).

## API Configuration Options

### Ollama API (recommended)

```
OLLAMA_BASE_URL=http://host.docker.internal:12434
```

### OpenAI-Compatible API

```
OPENAI_API_BASE_URL=http://host.docker.internal:12434/engines/v1
OPENAI_API_KEY=not-needed
```

## Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `OLLAMA_BASE_URL` | Points to Docker Model Runner (Ollama-compatible) |
| `WEBUI_AUTH` | Controls authentication (`true` = require login, `false` = open access) |
| `OPENAI_API_BASE_URL` | Alternative OpenAI-compatible endpoint |
| `OPENAI_API_KEY` | Required field for OpenAI mode (any value works) |

## Network Setup by Platform

| Platform | Configuration |
|----------|-------------|
| Docker Desktop | `host.docker.internal` works automatically |
| Docker Engine (Linux) | Use `network_mode: host` with `localhost:12434`, or explicit IP `172.17.0.1:12434` |

## Using the Interface

- **Model Selection:** Click the dropdown in the top-left to choose a model
- **Pull Models:** Enter model names directly through the UI
- **Features:** Multi-turn conversations, message editing, syntax highlighting, markdown rendering, history search, conversation export

## Advanced Configurations

### Pre-pull Multiple Models on Startup

Add a `model-setup` service with `docker:cli` image that pulls models using `depends_on` conditions before Open WebUI starts.

### Authentication

```yaml
environment:
  WEBUI_AUTH: "true"
```

Requires admin account creation on first access.

### Custom Port

Change the ports mapping in the compose file, e.g., `"8080:8080"`.

## Model Parameter Tuning

System prompts are configurable per model in Settings. Model parameters (temperature, top-p, max tokens) are adjustable per-conversation via the chat interface.

## Troubleshooting

| Problem | Solution |
|---------|---------|
| Models missing | Run `curl http://localhost:12434/api/tags`; confirm pulls with `docker model list` |
| Connection refused | Enable TCP access; verify `host.docker.internal` resolution; use explicit IP on Linux |
| Slow first response | Model loading takes time on first request; subsequent requests are much faster |
| CORS errors | Add Open WebUI URL to Docker Desktop → Settings → AI → CORS Allowed Origins |
