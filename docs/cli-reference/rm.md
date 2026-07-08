# sbx rm

**Description** — Remove one or more sandboxes
**Usage** — `sbx rm [SANDBOX...] [flags]`

## Description

Remove one or more sandboxes and all associated resources.

Stops running sandboxes, removes their containers, cleans up any Git worktrees, and deletes sandbox state. This action cannot be undone.

Removal requires confirmation; use --force to skip confirmation prompts (for non-interactive scripts). Use --all to remove every sandbox.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `--all` |  | Remove all sandboxes |
| `-f, --force` |  | Skip confirmation prompts |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |
