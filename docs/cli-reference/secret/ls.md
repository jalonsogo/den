# sbx secret ls

**Description** — List stored secrets
**Usage** — `sbx secret ls [SANDBOX] [flags]`

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-g, --global` |  | Only list global secrets |
| `--service` |  | Filter by secret service name |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# List all secrets
sbx secret ls

# List only global secrets
sbx secret ls -g

# List secrets for a specific sandbox
sbx secret ls my-sandbox

# Filter by service
sbx secret ls --service github
```
