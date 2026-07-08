# sbx secret rm

**Description** — Remove a secret
**Usage** — `sbx secret rm [-g | SANDBOX] [SERVICE] [flags]`

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-f, --force` |  | Delete without confirmation prompt |
| `-g, --global` |  | Use global secret scope |
| `--registry` |  | Registry hostname to remove pull credentials for |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# Remove a global secret
sbx secret rm -g github

# Remove a sandbox-scoped secret
sbx secret rm my-sandbox openai

# Remove without confirmation prompt
sbx secret rm -g github -f

# Remove OpenAI or Anthropic credential(s) from global scope (OAuth and/or API key)
sbx secret rm -g openai
sbx secret rm -g anthropic

# Remove custom secret by specifying the placeholder value
sbx secret rm -g --placeholder docker-placeholder-value

# Remove registry pull credentials (removes host-only and global entries)
sbx secret rm --registry ghcr.io -f

# Remove only the global (all-sandboxes) registry credential
sbx secret rm -g --registry ghcr.io -f
```
