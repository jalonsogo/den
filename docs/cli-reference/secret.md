# sbx secret

**Description** — Manage stored secrets

## Description

Manage stored secrets for sandbox environments.

SERVICE SECRETS (e.g. "github", "anthropic", "openai") When a sandbox starts, the proxy uses stored secrets to authenticate API requests on behalf of the agent. The secret is never exposed directly. Scoped globally (shared across all sandboxes) or to a specific sandbox.

REGISTRY SECRETS (e.g. "ghcr.io", "myregistry.azurecr.io") Used to pull private template images and kit artifacts before sandbox creation. Host-only secrets (no -g) are not injected into sandboxes; global secrets (-g) are written as ~/.docker/config.json in every new sandbox. Use "sbx secret set --registry --password-stdin" to store them.

## Commands

| Command | Description |
| --- | --- |
| `sbx secret ls` | List stored secrets |
| `sbx secret rm` | Remove a secret |
| `sbx secret set` | Create or update a secret |
| `sbx secret set-custom` | experimental Create or update a custom secret |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Subcommands

- [`sbx secret ls`](secret/ls.md)
- [`sbx secret rm`](secret/rm.md)
- [`sbx secret set`](secret/set.md)
- [`sbx secret set-custom`](secret/set-custom.md)
