# MCP Gateway

Source: https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/

The MCP Gateway is Docker's open source solution for orchestrating Model Context Protocol (MCP) servers. It acts as a centralized proxy between clients and servers, managing configuration, credentials, and access control.

GitHub: [github.com/docker/mcp-gateway](https://github.com/docker/mcp-gateway)

> **Note:** If Docker Desktop runs with MCP Toolkit enabled, the Gateway operates automatically in the background without manual configuration.

## How It Works

Without the Gateway, each AI application must be individually configured. With it, applications connect to a centralized proxy that handles server lifecycle, routing, and authentication across all servers.

**Request lifecycle:**

1. AI application sends a tool request to the Gateway
2. Gateway identifies the appropriate server and starts its container if needed
3. Required credentials are injected; security restrictions are applied
4. Request is forwarded to the server
5. Result is returned through the Gateway to the application

The Gateway runs MCP servers in isolated Docker containers with restricted privileges, network access, and resource usage. It includes logging and call-tracing features.

> **Tip:** E2B sandboxes provide direct access to the Docker MCP Catalog with over 200 tools and services for building and running AI agents.

## Usage Pathways

| Scenario | Approach |
|----------|---------|
| Docker Desktop with MCP Toolkit | Use [MCP Toolkit](./02-toolkit.md) |
| Terminal / headless workflows | Use [CLI Reference](./06-cli.md) |
| Docker Engine without Desktop | Manual installation (see below) |

## Manual Installation

### 1. Download the Binary

Get the latest release from the [GitHub releases page](https://github.com/docker/mcp-gateway/releases/latest).

### 2. Install

| OS | Destination |
|----|------------|
| Linux | `~/.docker/cli-plugins/docker-mcp` |
| macOS | `~/.docker/cli-plugins/docker-mcp` |
| Windows | `%USERPROFILE%\.docker\cli-plugins` |

### 3. Make Executable (Linux/macOS)

```bash
$ chmod +x ~/.docker/cli-plugins/docker-mcp
```

### 4. Verify

```bash
docker mcp --help
```
