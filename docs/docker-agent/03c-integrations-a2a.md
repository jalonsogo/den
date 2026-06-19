# A2A — Agent-to-Agent Integration

Source: https://docs.docker.com/ai/docker-agent/integrations/a2a/

A2A mode enables Docker Agent to function as an HTTP server, allowing other systems to discover and invoke agents through the Agent-to-Agent protocol over a network connection.

## Prerequisites

- Docker Agent installed
- A YAML agent configuration file
- API keys configured for cloud model providers

## Starting an A2A Server

**Basic:**

```console
$ docker agent serve a2a ./agent.yaml
```

**With custom port:**

```console
$ docker agent serve a2a ./agent.yaml --port 8080
```

**Target a specific agent from a multi-agent YAML:**

```console
$ docker agent serve a2a ./agent.yaml --agent engineer
```

**From OCI registry:**

```console
$ docker agent serve a2a agentcatalog/pirate --port 9000
```

## HTTP Endpoints

### Agent Card — `/.well-known/agent-card`

Returns JSON describing the agent's capabilities: name, description, skills, supported transport methods, and version.

### Invoke — `/invoke`

Accepts JSON-RPC requests:

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [{"kind": "text", "text": "query"}]
    }
  }
}
```

## Multi-Agent Workflows

Configure agents to call remote A2A services as tools using the `toolset` configuration with URL specifications and optional authentication headers. This enables networked multi-agent architectures where agents communicate over HTTP.
