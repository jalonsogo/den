# sbx setup

**Description** — Detect host configuration and prepare Docker Sandboxes
**Usage** — `sbx setup`

**Experimental**

**This command is experimental.**

Experimental features are intended for testing and feedback as their functionality or design may change between releases without warning or can be removed entirely in a future release.

## Description

Detect what is already configured on your host and prepare Docker Sandboxes.

Agent secrets are detected from the built-in agent kit specs and the env vars set on this host, and accepted secrets are imported into the global secrets store (the same store as "sbx secret set -g").

[T] toggle the detailed review table on/off ↑/↓ move between rows TAB toggle import / skip for the selected row [enter] accept and import [q]/esc quit without importing

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |
