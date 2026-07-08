# sbx kit pull

**Description** — Pull a kit artifact from an OCI registry
**Usage** — `sbx kit pull REFERENCE [flags]`

**Experimental**

**This command is experimental.**

Experimental features are intended for testing and feedback as their functionality or design may change between releases without warning or can be removed entirely in a future release.

## Description

Pull a kit artifact from an OCI registry and save its layer payload to a file.

The reference should be in the format "registry/repo:tag" or "registry/repo@sha256:digest" (e.g., "ghcr.io/myorg/my-plugin:1.0").

The file extension is chosen automatically based on the kit's format: schemaVersion: "1" → .zip (legacy ZIP archive) schemaVersion: "2" → .tar.gz (standard OCI tar+gzip layer)

The registry must support HTTPS.

Authentication: sbx registry secrets (sbx secret set --registry) take priority, falling back to the Docker credential store.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-o, --output` |  | Output file path (default: derived from reference + format) |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |
