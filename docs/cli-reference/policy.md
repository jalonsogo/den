# sbx policy

**Description** — Manage sandbox policies
**Usage** — `sbx policy COMMAND`

## Description

Manage persistent access policies for sandboxes.

Policies contain rules that control what sandboxes can access. Local rules can apply globally across all sandboxes or be scoped to one sandbox. Use subcommands to allow, deny, list, or remove rules.

## Commands

| Command | Description |
| --- | --- |
| `sbx policy allow` | Add an allow rule for sandboxes |
| `sbx policy deny` | Add a deny rule for sandboxes |
| `sbx policy init` | Initialize the global network policy |
| `sbx policy log` | Show sandbox policy logs |
| `sbx policy ls` | List sandbox policy rules |
| `sbx policy reset` | Reset policies to defaults |
| `sbx policy rm` | Remove a policy rule |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Subcommands

- [`sbx policy allow`](policy/allow.md)
- [`sbx policy deny`](policy/deny.md)
- [`sbx policy init`](policy/init.md)
- [`sbx policy log`](policy/log.md)
- [`sbx policy ls`](policy/ls.md)
- [`sbx policy reset`](policy/reset.md)
- [`sbx policy rm`](policy/rm.md)
