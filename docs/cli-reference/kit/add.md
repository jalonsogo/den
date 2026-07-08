# sbx kit add

**Description** — Add a kit to a running sandbox
**Usage** — `sbx kit add SANDBOX REFERENCE [flags]`

**Experimental**

**This command is experimental.**

Experimental features are intended for testing and feedback as their functionality or design may change between releases without warning or can be removed entirely in a future release.

## Description

Inject a kit artifact into an already-running sandbox.

The kit's files, init files, and startup commands are applied to the running container. This allows extending a sandbox without recreating it.

The sandbox must already exist (created or running). The reference can be a local directory, ZIP file path, OCI registry reference, or git repository.

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# Add a local kit directory to a sandbox
sbx kit add my-sandbox ./mcp-postgres/

# Add a kit from a ZIP file
sbx kit add my-sandbox ./mcp-postgres.zip

# Add a kit from an OCI registry
sbx kit add my-sandbox ghcr.io/myorg/mcp-postgres:1.0

# Add a kit from a git repository
sbx kit add my-sandbox git+https://github.com/org/kits.git#dir=mcp-postgres
```
