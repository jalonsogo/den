# Monitoring Policies

Source: https://docs.docker.com/ai/sandboxes/governance/monitoring/

## Primary Commands

### List Active Policy Rules

```console
$ sbx policy ls
```

Output columns:

| Column | Description |
|--------|-------------|
| NAME | Rule name |
| TYPE | network or filesystem |
| ORIGIN | `local`, `sandbox:<name>`, or `remote` |
| DECISION | allow or deny |
| STATUS | active or inactive |
| RESOURCES | Matched targets |

**Origins:**
- `local` — global rules applying to all sandboxes
- `sandbox:<name>` — rules scoped to a specific sandbox
- `remote` — organization-set governance rules

**Status:** Inactive rules appear when organization governance overrides local configurations.

**Options:**
- `--include-inactive` — show inactive rules too
- `--type network` — filter by rule type
- `--json` — machine-readable output

### Monitor Network Traffic

```console
$ sbx policy log
```

Output sections:
- **Blocked requests**
- **Allowed requests**

Fields per request: sandbox name, request type, destination host, proxy method, matching rule, context reason, timestamp, request count.

**Options:**
- `--limit N` — limit number of entries
- `--json` — machine-readable output

## Proxy Types

| Proxy Method | Meaning |
|-------------|---------|
| `forward` | Standard routing with credential injection capability |
| `forward-bypass` | Routing without credential injection |
| `transparent` | Intercepted with policy enforcement |
| `network` | Non-HTTP traffic (TCP/UDP/ICMP) |
| `browser-open` | URL opening in host browser with policy enforcement |
