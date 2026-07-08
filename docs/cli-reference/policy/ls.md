# sbx policy ls

**Description** — List sandbox policy rules
**Usage** — `sbx policy ls [SANDBOX] [flags]`

## Description

List active policy rules.

Displays the provenance, scope, rule name (or ID if no name is set), type, decision (allow/deny), and the associated resources for each rule.

When remote governance is active, inactive policy rules are hidden by default. Use --include-inactive to show inactive rules for troubleshooting.

When SANDBOX is specified, only policies that apply to that sandbox are shown (global rules plus rules scoped to that sandbox).

## Options

| Option | Default | Description |
| --- | --- | --- |
| `--include-inactive` |  | Show inactive policy rules hidden by remote governance |
| `--type` | `all` | Filter policies by type: "all", "network", or "filesystem" (default "all") |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# List all policies
sbx policy ls

# List only network policies
sbx policy ls --type network

# List only filesystem policies
sbx policy ls --type filesystem

# List policies that apply to a specific sandbox
sbx policy ls my-sandbox

# Include inactive rules hidden by remote governance
sbx policy ls --include-inactive
```
