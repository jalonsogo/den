# Docker Agent — Overview

Source: https://docs.docker.com/ai/docker-agent/

Docker Agent is an open-source framework for building teams of specialized AI agents. Rather than relying on a single generalist model, you define agents with specific roles and instructions that collaborate to solve problems — all controlled from the terminal using your choice of LLM provider.

GitHub: [github.com/docker/docker-agent](https://github.com/docker/docker-agent)

## Why Agent Teams

Distributing complex tasks across focused agents produces better results than a single monolithic agent. Each specialist handles what it's good at; Docker Agent manages coordination.

## Installation

| Method | Command |
|--------|---------|
| Docker Desktop 4.63+ | Built-in — no extra install |
| Homebrew | `brew install docker-agent` |
| Winget | `winget install Docker.Agent` |
| GitHub releases | Download pre-built binary |
| Source | Compile from the Docker Agent repository |

The binary belongs in `~/.docker/cli-plugins` for `docker agent` command integration.

## Core Concepts

You interact with a **root agent** that can delegate to **sub-agents**. Each agent:
- Uses its own model and parameters
- Has its own context (agents don't share knowledge)
- Can access built-in tools: todo lists, memory, task delegation
- Can use external tools via MCP servers

## Getting Started

1. Set API credentials for your chosen provider:
   ```bash
   export ANTHROPIC_API_KEY=your_key
   # or
   export OPENAI_API_KEY=your_key
   ```
2. Create an agent configuration YAML file
3. Run: `docker agent run agents.yml`

## Sharing Agent Teams

Package configurations as OCI artifacts:

```bash
# Push to Docker Hub or compatible registry
docker agent share push ./debugger.yaml username/name

# Pull on another machine
docker agent share pull username/name
```

## Documentation Index

| Page | Description |
|------|-------------|
| [Tutorial](./01-tutorial.md) | Build a coding agent step by step |
| [Best Practices](./02-best-practices.md) | Handling output, structuring teams, RAG, model selection |
| [Integrations Overview](./03-integrations.md) | ACP, MCP, A2A comparison |
| [ACP — Editor Integration](./03a-integrations-acp.md) | Run agents inside Neovim, Zed, IntelliJ |
| [MCP — Tool Integration](./03b-integrations-mcp.md) | Expose agents as tools in Claude Desktop / Claude Code |
| [A2A — Agent-to-Agent](./03c-integrations-a2a.md) | HTTP server mode for multi-agent systems |
| [Gordon](./04-gordon.md) | Docker's built-in AI assistant |
