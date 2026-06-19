# Integrations Overview

Source: https://docs.docker.com/ai/docker-agent/integrations/

Docker Agent supports three integration modes for connecting to editors and other systems.

## Integration Types

| Integration | Purpose | Connection | Discovery |
|-------------|---------|------------|-----------|
| **ACP** | Embedded editor assistant | stdio | Editor plugin |
| **MCP** | Expose agents as tools in Claude Desktop / Claude Code | stdio / SSE | Server manifest |
| **A2A** | HTTP server for agent-to-agent communication | HTTP | Agent card |

## ACP — Editor Integration

Run agents directly in your editor (Neovim, Zed, IntelliJ). The agent becomes part of your editor's environment with access to file context.

Best for: developers wanting an embedded coding assistant that sees what you're working on.

See [ACP Integration](./03a-integrations-acp.md).

## MCP — Tool Integration

Expose agents as tools in MCP clients like Claude Desktop or Claude Code. Agents become callable utilities within these platforms.

Best for: tool-based workflows where you want Claude to invoke specialized agents on demand.

See [MCP Integration](./03b-integrations-mcp.md).

## A2A — Agent-to-Agent Communication

Run agents as HTTP servers that other agents or systems can call using the Agent-to-Agent protocol.

Best for: networked multi-agent architectures where agents need HTTP-based communication.

See [A2A Integration](./03c-integrations-a2a.md).
