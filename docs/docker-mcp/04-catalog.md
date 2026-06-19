# MCP Catalog

Source: https://docs.docker.com/ai/mcp-catalog-and-toolkit/catalog/

The Docker MCP Catalog is a curated collection of 300+ verified MCP servers packaged as container images with versioning, full provenance metadata, and SBOM transparency.

Browse at: [hub.docker.com/mcp](https://hub.docker.com/mcp)

## What's in the Catalog

- **Verified servers** — all servers are versioned with full provenance and SBOM metadata
- **Partner tools** — integrations built by ecosystem partners
- **Docker-built servers** — first-party servers for remote service integrations

## Local vs. Remote Servers

| Type | Where it runs | Offline support |
|------|---------------|----------------|
| Local servers | As containers on your machine | Yes, once downloaded |
| Remote servers | On provider infrastructure | No — requires connectivity |

## Browse the Catalog

- Docker Desktop: **MCP Toolkit** → **Catalog** tab
- Web: [hub.docker.com/mcp](https://hub.docker.com/mcp)

## Add Servers to a Profile

In Docker Desktop:
1. Select checkboxes next to desired servers in the **Catalog** tab
2. Choose the target profile from the dropdown

From the CLI:

```console
$ docker mcp profile server add <profile-id> \
  --server catalog://mcp/docker-mcp-catalog/<server-id>
```

## Custom Catalogs

Custom catalogs let organizations curate a specific server collection rather than exposing all 300+ available options — useful for enterprise governance.

### Custom Catalogs with Dynamic MCP

Dynamic MCP allows agents to discover and add MCP servers on-demand during conversations, within a focused pre-defined server set.

### Import a Custom Catalog

Via Docker Desktop (OCI registry reference) or via CLI:

```console
$ docker mcp gateway run --catalog <oci-reference>
```

### Create a Custom Catalog

**Tag and customize the Docker catalog:**

```console
$ docker mcp catalog tag mcp/docker-mcp-catalog \
  registry.example.com/mcp/company-tools:latest

# List servers
$ docker mcp catalog server ls registry.example.com/mcp/company-tools:latest

# Remove unwanted servers
$ docker mcp catalog server remove \
  registry.example.com/mcp/company-tools:latest \
  --name <server-name>

# Add internal servers
$ docker mcp catalog server add registry.example.com/mcp/company-tools:latest \
  --server docker://registry.example.com/mcp/internal-api:latest \
  --server docker://registry.example.com/mcp/data-pipeline:latest

# Publish
$ docker mcp catalog push registry.example.com/mcp/company-tools:latest
```

**Build from scratch:**

```console
$ docker mcp catalog create registry.example.com/mcp/data-tools:latest \
  --title "Data Analysis Tools" \
  --server catalog://mcp/docker-mcp-catalog/sequentialthinking \
  --server catalog://mcp/docker-mcp-catalog/brave \
  --server docker://registry.example.com/mcp/analytics:latest

$ docker mcp catalog show registry.example.com/mcp/data-tools:latest
```

### Distribute and Use a Custom Catalog

```console
# Push to a registry
$ docker mcp catalog push <oci-reference>

# Pull on another machine
$ docker mcp catalog pull <oci-reference>

# Run gateway with a specific catalog
$ docker mcp gateway run --catalog <oci-reference>

# Run with selected servers only
$ docker mcp gateway run --catalog <oci-reference> \
  --servers <name1> --servers <name2>
```

## Contribute a Server

Submit to [github.com/docker/mcp-registry](https://github.com/docker/mcp-registry). Servers are available within 24 hours of approval.
