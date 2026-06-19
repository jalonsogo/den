# Policy Concepts

Source: https://docs.docker.com/ai/sandboxes/governance/concepts/

## Core Components

### Policies

Named collections of rules that manage sandbox access.

| Level | How Configured |
|-------|---------------|
| Local | `sbx policy` CLI, per machine |
| Organization | Docker Admin Console or Governance API |

### Rules

Each rule contains:
- A human-readable **name**
- **Action types** (what access is controlled)
- **Resources** (matching targets)
- **Decision** outcome (`allow` or `deny`)

Rules within a single policy must share the same domain: either `network` or `filesystem`.

## Scope and Application

Organization policies apply either:
- **Organization-wide** — all members
- **Team-scoped** — specific teams only

Users belong to multiple policies simultaneously, creating "effective policies" that combine all org-wide policies plus team-specific ones they qualify for.

## Rule Types

### Network Rules

- Actions: `connect:tcp`, `connect:udp`
- Resources: hostname patterns, CIDR ranges, and port specifications
- Pattern matching:
  - Exact match: `api.example.com`
  - Single-level wildcard: `*.example.com`
  - Multi-level wildcard: `**.example.com`

### Filesystem Rules

- Actions: `read`, `write`
- Resources: host paths
- `~` expands to each user's home directory (on Windows resolves to `%USERPROFILE%`)

## Evaluation Principles

1. **Deny wins:** If any rule matches with `decision: deny`, the request is denied regardless of any matching allow rules.
2. **Default deny:** Unmatched requests default to denial.
3. **Allows are additive** across policies; denies are absolute and cannot be overridden by any other policy.
4. **Local policies are inactive** when organization governance is enabled.
