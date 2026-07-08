# sbx secret set

**Description** — Create or update a secret
**Usage** — `sbx secret set [-g | SANDBOX] [SERVICE] [flags]`

## Description

Create or update a secret for a service or registry.

Available services: anthropic, aws, cursor, droid, github, google, groq, mistral, nebius, openai, openrouter, xai

When no arguments are provided, an interactive prompt guides you through scope and service selection.

Use --registry to store pull credentials for a container registry: Without -g: host-only — used for template/kit pulls, not injected into sandboxes. With -g: global — host pulls AND written as ~/.docker/config.json in every new sandbox. With SANDBOX as the first argument: scoped to that specific sandbox only.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-f, --force` |  | Overwrite an existing secret when --token is used |
| `-g, --global` |  | Use global secret scope |
| `--oauth` |  | Start OAuth flow and store OAuth tokens (openai/global only) |
| `--password-stdin` |  | Read registry password or token from stdin (use with --registry) |
| `--registry` |  | Registry hostname for pull credentials (e.g. ghcr.io) |
| `-t, --token` |  | Secret value (less secure: visible in shell history) |
| `--username` |  | Registry username (use with --registry; omit for token-only auth) |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# Store a GitHub token globally (available to all sandboxes)
sbx secret set -g github

# Store an OpenAI key for a specific sandbox
sbx secret set my-sandbox openai

# Non-interactive via stdin (e.g., from a secret manager or env var)
echo "$ANTHROPIC_API_KEY" | sbx secret set -g anthropic

# Start OpenAI OAuth flow and store global OAuth tokens
sbx secret set -g openai --oauth

# Registry: host-only (template/kit pulls, not injected into sandboxes)
gh auth token | sbx secret set --registry ghcr.io --password-stdin

# Registry: global (host pulls + injected into every new sandbox)
gh auth token | sbx secret set -g --registry ghcr.io --password-stdin

# Registry: specific sandbox only
gh auth token | sbx secret set my-sandbox --registry ghcr.io --password-stdin
```
