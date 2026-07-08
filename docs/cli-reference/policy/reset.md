# sbx policy reset

**Description** — Reset policies to defaults
**Usage** — `sbx policy reset [flags]`

## Description

Remove all custom policies and restart the daemon to restore defaults.

This deletes the local policy store and stops the daemon. The daemon restarts automatically on the next command, then prompts you to initialize the global network policy again.

If sandboxes are currently running, they will be stopped when the daemon shuts down. You will be prompted for confirmation unless --force is used.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-f, --force` |  | Skip confirmation prompt |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# Reset policies — prompts if sandboxes are running
sbx policy reset

# Reset policies without confirmation
sbx policy reset --force
```
