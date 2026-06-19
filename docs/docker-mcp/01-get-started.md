# Get Started with Docker MCP Toolkit

Source: https://docs.docker.com/ai/mcp-catalog-and-toolkit/get-started/

> **Note:** This page describes the MCP Toolkit interface in Docker Desktop 4.62 and later. Earlier versions have a different UI — upgrade to follow these instructions.

The Docker MCP Toolkit makes it easy to set up, manage, and run containerized MCP servers in profiles, and connect them to AI agents. It provides secure defaults and support for a growing ecosystem of LLM-based clients.

> **Tip:** Prefer working from the terminal? Use `docker mcp` commands — see [CLI Reference](./06-cli.md).

## Setup

1. Download and install the latest version of [Docker Desktop](https://docs.docker.com/get-started/get-docker/)
2. Open Docker Desktop settings → **Beta features**
3. Select **Enable Docker MCP Toolkit**
4. Select **Apply**

The **Learning center** in Docker Desktop also provides walkthroughs on the **MCP Toolkit** page.

## Create a Profile

Profiles organize your MCP servers into collections.

> **Note:** If upgrading from a previous MCP Toolkit version, your existing server configurations are already in a `default` profile.

1. In Docker Desktop, select **MCP Toolkit** → **Profiles** tab
2. Select **Create profile**
3. Enter a name (e.g., "Frontend development")
4. Optionally add servers and clients now, or add them later
5. Select **Create**

## Add MCP Servers

1. In Docker Desktop, select **MCP Toolkit** → **Catalog** tab
2. Browse and select the servers you want to add
3. Select the **Add to** button and choose a profile

If a server requires configuration, a **Configuration Required** badge appears — complete mandatory configuration before using the server.

## Connect Clients

1. In Docker Desktop, select **MCP Toolkit** → **Clients** tab
2. Find your application in the list
3. Select **Connect**

If your client isn't listed, configure it manually over `stdio`:

```plaintext
docker mcp gateway run --profile my_profile
```

Example generic client configuration:

```json
{
  "servers": {
    "MCP_DOCKER": {
      "command": "docker",
      "args": ["mcp", "gateway", "run", "--profile", "my_profile"],
      "type": "stdio"
    }
  }
}
```

## Verify Connections

### Claude Code

```console
$ claude mcp list
Checking MCP server health...

MCP_DOCKER: docker mcp gateway run - ✓ Connected
```

Test:

```console
$ claude "Use the GitHub MCP server to show me my open pull requests"
```

### Claude Desktop

Restart Claude Desktop and check the **Search and tools** menu in the chat input. `MCP_DOCKER` should appear listed and enabled.

Test:

```plaintext
Use the GitHub MCP server to show me my open pull requests
```

### Codex

```console
$ codex mcp list
Name        Command  Args             Env  Cwd  Status   Auth
MCP_DOCKER  docker   mcp gateway run  -    -    enabled  Unsupported
```

Test:

```console
$ codex "Use the GitHub MCP server to show me my open pull requests"
```

### Continue

Launch `cn` and run `/mcp`:

```plaintext
   MCP Servers

   ➤ 🟢 MCP_DOCKER (🔧75 📝3)
     🔄 Restart all servers
     ⏹️ Stop all servers
     🔍 Explore MCP Servers
     Back

   ↑/↓ to navigate, Enter to select, Esc to go back
```

### Cursor

Open Cursor → **Cursor Settings > Tools & MCP**. `MCP_DOCKER` should appear under **Installed MCP Servers**.

### Gemini

```console
$ gemini mcp list
Configured MCP servers:

✓ MCP_DOCKER: docker mcp gateway run (stdio) - Connected
```

### Goose

**Desktop app:** Open **Extensions** in the sidebar. Look for an extension named `Mcpdocker`.

**CLI:**

```console
$ goose info -v
…
    mcpdocker:
      args:
      - mcp
      - gateway
      - run
      available_tools: []
      cmd: docker
      description: The Docker MCP Toolkit allows for easy configuration and consumption of MCP servers from the Docker MCP Catalog
      enabled: true
      type: stdio
```

### LM Studio

Restart LM Studio and start a new chat. Open the integrations menu and enable `mcp/mcp-docker`.

### OpenCode

Config file at `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "MCP_DOCKER": {
      "type": "local",
      "command": ["docker", "mcp", "gateway", "run"],
      "enabled": true
    }
  },
  "$schema": "https://opencode.ai/config.json"
}
```

### Visual Studio Code

Open VS Code → **Extensions** pane. `MCP_DOCKER` should appear under installed MCP servers.

### Zed

Open agent settings and confirm `MCP_DOCKER` is listed and enabled in the **MCP Servers** section.

## Further Reading

- [MCP Profiles](./05-profiles.md)
- [MCP Toolkit](./02-toolkit.md)
- [MCP Catalog](./04-catalog.md)
- [MCP Gateway](./03-mcp-gateway.md)
