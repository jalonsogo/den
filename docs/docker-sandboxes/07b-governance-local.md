# Local Policy

Source: https://docs.docker.com/ai/sandboxes/governance/local/

The `sbx policy` command controls network access rules for sandboxes on your local machine. Rules apply globally across all sandboxes or can be scoped to individual sandboxes.

> Local rules function only when organizational governance is inactive. When org governance is active, the organization policy completely replaces local policy — `sbx policy allow` and `sbx policy deny` have no effect.

## Default Network Presets

Selected during initial `sbx login`:

| Preset | Behavior |
|--------|----------|
| **Open** | Permits all outbound traffic without restrictions |
| **Balanced** | Denies by default; allows AI APIs, package managers, and common services |
| **Locked Down** | Blocks all traffic; requires explicit allowlisting |

Set default non-interactively:

```console
$ sbx policy set-default balanced
```

## Rule Management

### Adding Rules

```console
$ sbx policy allow network api.anthropic.com
$ sbx policy deny network ads.example.com
```

Scope to one sandbox:

```console
$ sbx policy allow network api.anthropic.com --sandbox my-sandbox
```

Multiple hosts in one command (comma-separated):

```console
$ sbx policy allow network "api.example.com,cdn.example.com"
```

### Removing Rules

By resource:

```console
$ sbx policy rm network --resource ads.example.com
```

By rule ID:

```console
$ sbx policy rm network --id <uuid>
```

### Reset

```console
$ sbx policy reset
```

Removes all custom rules and prompts for a new default preset.

## Traffic Limitations

| Traffic Type | Policy Support |
|-------------|---------------|
| HTTP/HTTPS | Full policy control |
| Non-HTTP TCP | Require IP + port rules (not hostname) |
| UDP | Cannot be unblocked via policy |
| ICMP | Cannot be unblocked via policy |

## Troubleshooting

If rules show no effect, check whether organization governance is active:

```console
$ sbx policy ls
```

If `ORIGIN` shows `remote`, org-managed rules are in effect — contact your administrator to modify policies.
