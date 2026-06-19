# CLI Reference — `docker mcp`

Source: https://docs.docker.com/ai/mcp-catalog-and-toolkit/cli/

The `docker mcp` commands manage MCP profiles, servers, OAuth credentials, and catalogs from the terminal. Available in Docker Desktop 4.62 and later.

## Profiles

### Create

```console
$ docker mcp profile create --name <profile-id>
$ docker mcp profile create --name web-dev
```

### List

```console
$ docker mcp profile list
```

### View

```console
$ docker mcp profile show <profile-id>
```

### Remove

> **Warning:** Removing a profile deletes all server configurations and settings irreversibly.

```console
$ docker mcp profile remove <profile-id>
```

### Export / Import (Version Control)

```console
$ docker mcp profile export web-dev .docker/mcp-profile.json
$ docker mcp profile import .docker/mcp-profile.json
```

### Push / Pull (OCI Registry)

```console
$ docker mcp profile push web-dev registry.example.com/profiles/web-dev:v1
$ docker mcp profile pull registry.example.com/profiles/team-standard:latest
```

---

## Servers

### Browse the Catalog

```console
$ docker mcp catalog server ls mcp/docker-mcp-catalog
```

### Server URI Formats

| Format | Source |
|--------|--------|
| `catalog://<catalog-ref>/<server-id>` | OCI catalog |
| `docker://<image>:<tag>` | Docker image |
| `https://<url>/v0/servers/<uuid>` | MCP community registry |
| `file://<path>` | Local YAML or JSON file |

### Add Servers to a Profile

```console
$ docker mcp profile server add <profile-id> \
  --server catalog://<catalog-ref>/<server-id>

$ docker mcp profile server add web-dev \
  --server catalog://mcp/docker-mcp-catalog/github-official \
  --server catalog://mcp/docker-mcp-catalog/playwright

# Add a local server defined in a YAML file
$ docker mcp profile server add my-profile \
  --server file://./my-server.yaml
```

**Local server YAML format:**

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

### Remove Servers

```console
$ docker mcp profile server remove web-dev \
  --name github-official \
  --name playwright
```

### Configure Server Settings

```console
$ docker mcp profile config <profile-id> --set <server-id>.<key>=<value>
$ docker mcp profile config <profile-id> --get-all
$ docker mcp profile config <profile-id> --del <server-id>.<key>
```

---

## Gateway

### Run Gateway

```console
$ docker mcp gateway run --profile <profile-id>
```

### Run Gateway with Custom Catalog

```console
$ docker mcp gateway run --catalog <oci-reference>

# Run with selected servers only
$ docker mcp gateway run --catalog <oci-reference> \
  --servers <name1> --servers <name2>
```

### Connect a Named Client

```console
$ docker mcp client connect <client> --profile <profile-id>
$ docker mcp client connect vscode --profile my-project
```

Creates `.vscode/mcp.json` in the current directory.

### Manual Client Configuration

**Generic JSON:**

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
      "args": ["mcp", "gateway", "run", "--profile", "web-dev"]
    }
  }
}
```

---

## Custom Catalogs

### Tag the Docker Catalog as a Starting Point

```console
$ docker mcp catalog tag mcp/docker-mcp-catalog \
  registry.example.com/mcp/company-tools:latest
```

### Inspect Catalog Contents

```console
$ docker mcp catalog server ls registry.example.com/mcp/company-tools:latest
$ docker mcp catalog show registry.example.com/mcp/data-tools:latest
```

### Remove Servers from Catalog

```console
$ docker mcp catalog server remove \
  registry.example.com/mcp/company-tools:latest \
  --name <server-name>
```

### Add Servers to Catalog

```console
$ docker mcp catalog server add registry.example.com/mcp/company-tools:latest \
  --server docker://registry.example.com/mcp/internal-api:latest \
  --server docker://registry.example.com/mcp/data-pipeline:latest
```

### Build a Catalog from Scratch

```console
$ docker mcp catalog create registry.example.com/mcp/data-tools:latest \
  --title "Data Analysis Tools" \
  --server catalog://mcp/docker-mcp-catalog/sequentialthinking \
  --server catalog://mcp/docker-mcp-catalog/brave \
  --server docker://registry.example.com/mcp/analytics:latest
```

### Publish and Distribute

```console
$ docker mcp catalog push <oci-reference>
$ docker mcp catalog pull <oci-reference>
```
