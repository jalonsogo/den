# sbx kit

**Description** — Manage kit artifacts
**Usage** — `sbx kit COMMAND`

**Experimental**

**This command is experimental.**

Experimental features are intended for testing and feedback as their functionality or design may change between releases without warning or can be removed entirely in a future release.

## Description

Manage kit artifacts.

Kits are declarative YAML artifacts that extend sandbox agents with additional credentials, network policies, environment variables, startup commands, and files.

## Commands

| Command | Description |
| --- | --- |
| `sbx kit add` | experimental Add a kit to a running sandbox |
| `sbx kit inspect` | experimental Display details about a kit artifact |
| `sbx kit pack` | experimental Package a directory as a kit artifact |
| `sbx kit pull` | experimental Pull a kit artifact from an OCI registry |
| `sbx kit push` | experimental Push a kit artifact to an OCI registry |
| `sbx kit validate` | experimental Validate a kit artifact |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Subcommands

- [`sbx kit add`](kit/add.md)
- [`sbx kit inspect`](kit/inspect.md)
- [`sbx kit pack`](kit/pack.md)
- [`sbx kit pull`](kit/pull.md)
- [`sbx kit push`](kit/push.md)
- [`sbx kit validate`](kit/validate.md)
