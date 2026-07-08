# sbx kit push

**Description** — Push a kit artifact to an OCI registry
**Usage** — `sbx kit push DIRECTORY REFERENCE [flags]`

**Experimental**

**This command is experimental.**

Experimental features are intended for testing and feedback as their functionality or design may change between releases without warning or can be removed entirely in a future release.

## Description

Package and push a kit artifact directory to an OCI registry.

The directory must contain a valid spec.yaml. The reference should be in the format "registry/repo:tag" (e.g., "ghcr.io/myorg/my-plugin:1.0").

The OCI artifact format is selected from the kit's spec.yaml: schemaVersion: "1" → legacy ZIP-based artifact schemaVersion: "2" → v2 tar+gzip layer with the spec in the manifest config blob and standard OCI annotations (so distribution tooling can read kit metadata without pulling layers)

Authentication uses the Docker credential store.

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |
