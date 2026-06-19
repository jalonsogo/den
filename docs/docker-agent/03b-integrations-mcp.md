# MCP — Tool Integration

Source: https://docs.docker.com/ai/docker-agent/integrations/mcp/

Docker Agent operates in MCP (Model Context Protocol) mode to function as tools within Claude Desktop, Claude Code, and other MCP clients. Agents become callable without needing terminal access.

## How It Works

When configured, agents become available tools in the MCP client's interface. Users can request the client to invoke specific agents, which execute with their configured tools (filesystem, shell, etc.) and return results. A YAML file with multiple agents creates separate callable tools; the client selects which agent to invoke based on descriptions and user requests.

## Prerequisites

- Docker Agent installed
- A YAML agent configuration file
- An MCP-compatible client (Claude Desktop, Claude Code, etc.)
- Environment variables for API keys

## Configuration

### Claude Desktop

**Config file locations:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "myagent": {
      "command": "docker",
      "args": [
        "agent",
        "serve",
        "mcp",
        "/path/to/agent.yml",
        "--working-dir",
        "/Users/yourname/projects"
      ],
      "env": {
        "ANTHROPIC_API_KEY": "your_anthropic_key_here",
        "OPENAI_API_KEY": "your_openai_key_here"
      }
    }
  }
}
```

Restart Claude Desktop after updating the config.

### Claude Code

```console
$ claude mcp add --transport stdio myagent \
  --env OPENAI_API_KEY=$OPENAI_API_KEY \
  --env ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -- docker agent serve mcp /path/to/agent.yml --working-dir $(pwd)
```

### Other MCP Clients

1. Start Docker Agent: `docker agent serve mcp /path/to/agent.yml --working-dir /project/path`
2. Configure client for stdio communication
3. Pass required environment variables

## Specifying Agent Configuration

```console
# Local file
docker agent serve mcp ./agent.yml

# OCI registry
docker agent serve mcp agentcatalog/pirate
docker agent serve mcp dockereng/myagent:v1.0.0
```

OCI references in the client config work the same way:

```json
{
  "mcpServers": {
    "myagent": {
      "command": "docker",
      "args": ["agent", "serve", "mcp", "agentcatalog/pirate"]
    }
  }
}
```

## MCP Gateway

Use the `docker:` prefix to access Docker's pre-configured MCP Gateway:

```yaml
agents:
  root:
    toolsets:
      - type: mcp
        ref: docker:duckduckgo
```

Available servers are listed in the [MCP Catalog](../docker-mcp/04-catalog.md).

## Agent Design Principles for MCP

### Write Specific Descriptions

The `description` field determines when MCP clients invoke agents. Be specific:

```yaml
agents:
  security_auditor:
    description: Analyzes code for security vulnerabilities and compliance issues
```

Vague descriptions ("A helpful security agent") don't guide the client well.

### Make Agents Self-Sufficient

MCP clients call agents individually, not sequentially. Each agent must work independently:

```yaml
agents:
  engineer:
    description: Implements features and writes production code
    instruction: |
      You implement code based on requirements provided.
      You can work independently without a coordinator.
    toolsets:
      - type: filesystem
      - type: shell
```

### Test Independently

```console
$ docker agent run agent.yml --agent engineer
```

## Testing Integration

After configuring:
1. Restart the MCP client
2. Confirm agents appear as available tools
3. Test with a simple invocation prompt
4. Validate tool access (filesystem, shell, etc.)

## Troubleshooting Checklist

- `docker agent` command is available and executable
- Agent configuration YAML is valid
- Environment variable API keys are set
- Working directory path exists and has correct permissions
- Check MCP client logs for connection/execution errors
