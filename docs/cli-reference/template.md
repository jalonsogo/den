# sbx template

**Description** — Manage sandbox templates
**Usage** — `sbx template COMMAND`

## Description

Manage sandbox templates.

Templates are saved snapshots of sandboxes that can be reused to create new sandboxes with: sbx run -t TAG AGENT [WORKSPACE]

## Commands

| Command | Description |
| --- | --- |
| `sbx template load` | Load an image from a tar file into the sandbox runtime |
| `sbx template ls` | List template images |
| `sbx template rm` | Remove a template image |
| `sbx template save` | Save a snapshot of the sandbox as a template |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Subcommands

- [`sbx template load`](template/load.md)
- [`sbx template ls`](template/ls.md)
- [`sbx template rm`](template/rm.md)
- [`sbx template save`](template/save.md)
