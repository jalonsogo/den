# sbx reset

**Description** — Reset all sandboxes and clean up state
**Usage** — `sbx reset [flags]`

## Description

Reset Docker Sandboxes to a freshly-installed state.

This command will:

- Stop all running sandboxes gracefully (30s timeout)

- Clear image cache

- Clear all internal registries

- Delete all sandbox state

- Remove all policies

- Delete all stored secrets

- Sign out of Docker Sandboxes

- Stop the daemon

- Remove all state, cache, and config directories

WARNING: This is destructive and cannot be undone. Running agents will be terminated and their work lost. Cached images will be deleted and recreated on next use. Stored secrets will need to be re-entered.

Use --preserve-secrets to keep stored secrets. By default, you will be prompted to confirm (y/N). Use --force to skip the confirmation prompt.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-f, --force` |  | Skip confirmation prompt |
| `--preserve-secrets` |  | Keep stored secrets |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |
