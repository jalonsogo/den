# MCP Toolkit

Source: https://docs.docker.com/ai/mcp-catalog-and-toolkit/toolkit/

The Docker MCP Toolkit is a management interface in Docker Desktop 4.62+ that enables setup, management, and execution of containerized MCP servers within profiles, connecting them to AI agents.

## Key Features

- Cross-LLM compatibility with Claude, Cursor, and other MCP clients
- Integrated tool discovery via Docker MCP Catalog
- Zero manual setup — no dependency management, runtime configuration, or environment setup required
- Profile-based organization for different projects
- Dynamic MCP capability for on-demand server discovery

## Core Concepts

**MCP Clients** — embedded in LLM applications like Claude Desktop; they send tool requests.

**MCP Servers** — launched to perform requested tasks; Docker containerization eliminates isolation and environment conflicts.

**Profiles** — named collections of servers with configurations; distinct setups for different environments.

## Security Model

### Passive Security (Build-time)

- Image signing and attestation for all MCP servers under `mcp/` in the catalog
- Software Bill of Materials (SBOM) for full transparency

### Active Security (Runtime)

| Protection | Detail |
|-----------|--------|
| CPU allocation | Each MCP tool runs in its own container, restricted to 1 CPU |
| Memory | Limited to 2 GB per container |
| Filesystem access | By default, MCP servers have no access to the host filesystem |
| Secret interception | Requests to/from tools containing sensitive information are blocked |

### OAuth Authentication

Automatic handling of OAuth for services like GitHub, Notion, and Linear — no manual API token creation required.

**OAuth setup steps:**
1. Navigate to **MCP Toolkit** → **Catalog** tab in Docker Desktop
2. Find and add an MCP server requiring OAuth
3. Select **OAuth** authentication method in the server's **Configuration** tab
4. Follow browser authorization prompts
5. Return to Docker Desktop upon completion
6. View/revoke authorized services in the **OAuth** tab

## Usage Examples

### Claude Desktop as Client

1. Select **Catalog** tab → find and add **Puppeteer** server
2. Repeat for **GitHub Official** server
3. Select **Clients** tab → **Connect** next to Claude Desktop
4. Restart Claude Desktop
5. Test: `"Take a screenshot of docs.docker.com and then invert the colors"`

### Visual Studio Code as Client

**Enable globally** — add to User `mcp.json`:

```json
"mcp": {
  "servers": {
    "MCP_DOCKER": {
      "command": "docker",
      "args": [
        "mcp",
        "gateway",
        "run",
        "--profile",
        "my_profile"
      ],
      "type": "stdio"
    }
  }
}
```

**Enable per project:**

```bash
docker mcp client connect vscode --profile my_profile
```

Add to `.gitignore`:

```console
echo ".vscode/mcp.json" >> .gitignore
```

Then open a new Chat in VS Code → select **Agent** mode → available MCP tools appear in the interface.
