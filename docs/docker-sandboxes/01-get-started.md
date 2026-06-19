# Get Started with Docker Sandboxes

Source: https://docs.docker.com/ai/sandboxes/get-started/

## Prerequisites

### macOS
- macOS Sonoma (version 14) or later
- Apple silicon

### Windows
- 64-bit Intel or AMD (x86_64)
- Windows 11
- Windows Hypervisor Platform enabled:

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All
```

### Linux (Ubuntu)
- Ubuntu 24.04 or later
- 64-bit Intel or AMD (x86_64)
- KVM hardware virtualization enabled:

```console
$ lsmod | grep kvm
```

- User added to `kvm` group:

```console
$ sudo usermod -aG kvm $USER
```

**All platforms:** API key or authentication for your agent's model provider (Anthropic, OpenAI, Google, etc.) is required.

> Docker Desktop installation is optional.

## Installation & Authentication

### macOS

```console
$ brew install docker/tap/sbx
$ sbx login
```

### Windows

```powershell
> winget install -h Docker.sbx
> sbx login
```

### Linux (Ubuntu)

```console
$ curl -fsSL https://get.docker.com | sudo REPO_ONLY=1 sh
$ sudo apt-get install docker-sbx
$ sbx login
```

**Login process:** Opens Docker OAuth in the browser. First login prompts you to select a default network policy:

| Option | Behavior |
|--------|----------|
| Open | All network traffic allowed |
| Balanced | Default deny with common dev sites permitted |
| Locked Down | All traffic blocked unless explicitly allowed |

## Agent Authentication

### Claude Code (with subscription)
Use `/login` within the sandbox for OAuth — no upfront API key setup required.

### API Key-Based Authentication

```console
$ sbx secret set -g anthropic
```

### GitHub Access

```console
$ sbx secret set -g github -t "$(gh auth token)"
```

> Session tokens and API keys remain on the host and are injected via proxy — they are never stored inside the sandbox VM.

## Running Your First Sandbox

```console
$ cd ~/my-project
$ sbx run --name my-sandbox claude
```

### Check Running Sandboxes

```console
$ sbx ls
```

### Interactive Dashboard

```console
$ sbx
```

## Clone Mode (Isolated Workspace)

Create an isolated Git clone inside the microVM so the agent never modifies your working tree directly:

```console
$ sbx rm my-sandbox
$ sbx run --clone --name my-sandbox claude
```

### Review Agent Commits

```console
$ git fetch sandbox-my-sandbox
$ git log sandbox-my-sandbox/main
$ git diff main..sandbox-my-sandbox/main
```

### Create a Pull Request from Agent Work

```console
$ git checkout -b my-feature sandbox-my-sandbox/main
$ git push -u origin my-feature
$ gh pr create
```

### Clone Mode with Subagents (Claude Code)

```console
$ sbx run --clone --name my-sandbox claude -- agents
```

## Network Access Management

```console
$ sbx policy ls
```

Allow a specific host:

```console
$ sbx policy allow network registry.npmjs.org
```

## Cleanup

Stop without deleting:

```console
$ sbx stop my-sandbox
```

Remove completely:

```console
$ sbx rm my-sandbox
```

> The host working tree is unaffected by `sbx rm`.
