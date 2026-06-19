# MCP Profiles

Source: https://docs.docker.com/ai/mcp-catalog-and-toolkit/profiles/

Profiles are named collections of MCP servers organized by project. They support both containerized and remote MCP servers and are the primary unit of configuration for Docker MCP Toolkit.

## What Profiles Do

- Group servers into a named workspace per project or context
- Store server configuration and OAuth credentials
- Connect to one or more AI clients
- Can be shared via OCI registries or version control

## Creating and Managing Profiles

### Create a Profile

**Docker Desktop:**
1. Select **MCP Toolkit** → **Profiles** tab
2. Select **Create profile**
3. Enter a name (e.g., "web-dev")
4. Optionally search and add servers and clients
5. Select **Create**

**CLI:**

```console
$ docker mcp profile create --name web-dev
```

### View Profile Details

Select a profile in the **Profiles** tab. Two sub-tabs:
- **Overview** — servers, secrets configuration, connected clients
- **Tools** — all available tools from the profile's servers

```console
$ docker mcp profile show <profile-id>
```

### Remove a Profile

> **Caution:** Removing a profile deletes all its server configurations and settings, and updates the client configuration. This action cannot be undone.

**Docker Desktop:**
1. Find the profile in the **Profiles** tab
2. Select ⋮ → **Delete**
3. Confirm

**CLI:**

```console
$ docker mcp profile remove <profile-id>
```

### Default Profile

A `default` profile exists for users upgrading from earlier MCP Toolkit versions. You can continue using it or create new profiles per project.

## Adding Servers to Profiles

### Add a Server

**From Catalog tab:**
1. Select **Catalog** tab
2. Select the checkbox next to servers you want to add
3. Choose your profile from the drop-down

**From within a profile:**
1. Select **Profiles** tab → select your profile
2. In the **Servers** section, select **+**
3. Search for and select servers

**CLI:**

```console
$ docker mcp profile server add web-dev \
  --server catalog://mcp/docker-mcp-catalog/github-official \
  --server catalog://mcp/docker-mcp-catalog/playwright
```

**Server URI formats:**

| Format | Source |
|--------|--------|
| `catalog://<catalog-ref>/<server-id>` | OCI catalog |
| `docker://<image>:<tag>` | Docker image |
| `https://<url>/v0/servers/<uuid>` | MCP community registry |
| `file://<path>` | Local YAML or JSON file |

**Local YAML server definition:**

```yaml
name: my-server
title: My Server
type: server
image: myimage:latest
description: Description of the server
```

### List Servers

```console
$ docker mcp profile server ls
$ docker mcp profile server ls --filter profile=web-dev
```

### Remove a Server

**Docker Desktop:**
1. Select **Profiles** tab → select your profile
2. Find the server → select the delete icon

**CLI:**

```console
$ docker mcp profile server remove web-dev \
  --name github-official \
  --name playwright
```

## Configuring Profiles

### Server Configuration

**Docker Desktop:** Select **Profiles** tab → select your profile → **Servers** section → configure icon.

**CLI:**

```console
$ docker mcp profile config <profile-id> --set <server-id>.<key>=<value>
$ docker mcp profile config <profile-id> --get-all
$ docker mcp profile config <profile-id> --del <server-id>.<key>
```

### OAuth Credentials

Configure OAuth for services that require it (GitHub, Notion, Linear, etc.) through the **OAuth** tab in the profile's **Configuration** view. See [MCP Toolkit — OAuth Authentication](./02-toolkit.md).

### Configuration Persistence

Server configuration and OAuth credentials are stored per profile and persist across Docker Desktop restarts.

## Sharing Profiles

### Push a Profile (OCI Registry)

**Docker Desktop:**
1. Select the profile → **Push to Registry**
2. Enter destination (e.g., `registry.example.com/profiles/web-dev:v1`)
3. Complete authentication if required

**CLI:**

```console
$ docker mcp profile push web-dev registry.example.com/profiles/web-dev:v1
```

### Pull a Profile (OCI Registry)

**Docker Desktop:**
1. Select **Pull from Registry** in **Profiles** tab
2. Enter the registry reference (e.g., `registry.example.com/profiles/team-standard:latest`)
3. Complete authentication if required

**CLI:**

```console
$ docker mcp profile pull registry.example.com/profiles/team-standard:latest
```

### Share via Version Control

```console
$ mkdir -p .docker
$ docker mcp profile export web-dev .docker/mcp-profile.json
$ docker mcp profile import .docker/mcp-profile.json
$ echo ".vscode/mcp.json" >> .gitignore
```

## Using Profiles with Clients

### Run the Gateway with a Profile

```console
$ docker mcp gateway run --profile web-dev
```

### Configure Clients for Specific Profiles

**Generic (stdio):**

```json
{
  "servers": {
    "MCP_DOCKER": {
      "command": "docker",
      "args": ["mcp", "gateway", "run", "--profile", "web-dev"],
      "type": "stdio"
    }
  }
}
```

**Claude Desktop format:**

```json
{
  "mcpServers": {
    "MCP_DOCKER": {
      "command": "docker",
      "args": ["mcp", "gateway", "run", "--profile", "claude-work"]
    }
  }
}
```

**VS Code format:**

```json
{
  "mcp": {
    "servers": {
      "MCP_DOCKER": {
        "command": "docker",
        "args": ["mcp", "gateway", "run", "--profile", "vscode-dev"],
        "type": "stdio"
      }
    }
  }
}
```

### Connect a Named Client

```console
$ docker mcp client connect vscode --profile my-project
```

Creates `.vscode/mcp.json` in the current directory.

### Switching Between Profiles

Run separate gateway instances with different `--profile` flags, or reconnect your client to a different profile using the Clients tab or CLI.
