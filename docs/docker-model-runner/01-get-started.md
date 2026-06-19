# Get Started with Docker Model Runner

Source: https://docs.docker.com/ai/model-runner/get-started/

Docker Model Runner (DMR) lets you run and manage AI models locally using Docker.

## Setup

### Docker Desktop

1. Open Docker Desktop → **Settings** → **AI** tab
2. Enable **Docker Model Runner**
3. Optionally enable:
   - GPU acceleration (Windows with NVIDIA)
   - TCP support with custom port
   - CORS origin settings for web app integration

### Docker Engine (Linux)

**Ubuntu/Debian:**

```bash
$ sudo apt-get update
$ sudo apt-get install docker-model-plugin
```

**RPM-based distributions:**

```bash
$ sudo dnf update
$ sudo dnf install docker-model-plugin
```

**Verify:**

```bash
$ docker model version
$ docker model run ai/smollm2
```

## Core Workflows

### Pull a Model

```bash
# From Docker Hub
docker model pull ai/smollm2:360M-Q4_K_M

# From Hugging Face
docker model pull hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF
```

### Run a Model

```bash
docker model run ai/smollm2
```

### List Local Models

```bash
docker model list
```

### Check Status

```bash
docker model status
```

### View Logs

Via Docker Desktop: **Models** → **Logs** tab

Via CLI:

```bash
docker model logs
```

### Inspect Requests

Via Docker Desktop: **Models** → **Requests** tab (shows token usage and context window info).

## Publishing Custom Models

### Tag and Push an Existing Model

```bash
$ docker model tag ai/smollm2 myorg/smollm2
$ docker model push myorg/smollm2
```

### Package a GGUF Model

```bash
$ curl -L -o model.gguf <huggingface-url>
$ docker model package --gguf "$(pwd)/model.gguf" --push myorg/mistral-7b-v0.1:Q4_K_M
```

## Update DMR

```bash
docker model uninstall-runner --images && docker model install-runner
```

## Known Issues

If the `docker model` command is not recognized, ensure the CLI plugin symlink is configured correctly in the CLI plugins directory.
