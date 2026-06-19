# Governance Overview

Source: https://docs.docker.com/ai/sandboxes/governance/

> Organization governance requires a separate paid subscription. Contact Docker Sales for access.

## Two-Layer Policy System

| Layer | Configured via | Scope |
|-------|---------------|-------|
| Local Policy | `sbx policy` CLI | Per machine, per developer |
| Organization Policy | Docker Admin Console or Governance API | All org members / specific teams |

When organization governance is active, organizational rules take **complete precedence** and override all local configurations.

## Documentation

| Page | Description |
|------|-------------|
| [Policy Concepts](./07a-governance-concepts.md) | Resource models and rule evaluation |
| [Local Policy](./07b-governance-local.md) | Machine-level configuration |
| [Org Policy](./07c-governance-org.md) | Enterprise-wide administration |
| [Sign-in Enforcement](./07d-governance-sign-in-enforcement.md) | Restrict sandboxes to org members |
| [Monitoring](./07e-governance-monitoring.md) | Traffic inspection and rule review |
| [Audit Logs](./07f-governance-audit.md) | Compliance and SIEM integration |
| API reference | Programmatic policy management via Governance API |

## Sign-in Enforcement

Administrators can require mandatory sign-in for organizational members before sandbox access is permitted. This prevents circumvention via personal accounts at the endpoint level.
