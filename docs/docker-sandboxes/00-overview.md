# Docker Sandboxes — Overview

Source: https://docs.docker.com/ai/sandboxes/

Docker Sandboxes enable AI coding agents to operate in isolated microVM environments. Each sandbox includes its own Docker daemon, filesystem, and network, allowing agents to build containers and install packages without affecting the host system.

> **Note:** The `sbx` CLI is available at no cost for both personal and commercial use. Organization governance features require a separate paid subscription.

## Quick Install

| Platform | Command |
|----------|---------|
| macOS | `brew install docker/tap/sbx` |
| Windows | `winget install Docker.sbx` |
| Linux (Ubuntu) | See [Get Started](./01-get-started.md) |

After installation, run `sbx run claude` to start your first sandbox.

## Documentation Index

| Page | Description |
|------|-------------|
| [Get Started](./01-get-started.md) | Prerequisites, installation, first sandbox |
| [Usage](./02-usage.md) | Core operations, git integration, ports, file transfer |
| [Agents](./03-agents.md) | Supported AI coding agents |
| [Architecture](./04-architecture.md) | How sandboxes work under the hood |
| [Security](./05-security.md) | Trust model and isolation layers |
| [Security — Defaults](./05a-security-defaults.md) | Default security posture |
| [Security — Isolation](./05b-security-isolation.md) | Five isolation layers explained |
| [Customize](./06-customize.md) | Templates and kits overview |
| [Customize — Templates](./06a-customize-templates.md) | Reusable sandbox images |
| [Customize — Kits](./06b-customize-kits.md) | YAML-based capability packages |
| [Governance](./07-governance.md) | Policy framework overview |
| [Governance — Concepts](./07a-governance-concepts.md) | Policy rules and evaluation model |
| [Governance — Local Policy](./07b-governance-local.md) | Per-machine network rules |
| [Governance — Org Policy](./07c-governance-org.md) | Admin Console enterprise rules |
| [Governance — Sign-in Enforcement](./07d-governance-sign-in-enforcement.md) | Restrict access to org members |
| [Governance — Monitoring](./07e-governance-monitoring.md) | Traffic inspection and rule review |
| [Governance — Audit Logs](./07f-governance-audit.md) | SIEM integration and compliance |
| [Troubleshooting](./08-troubleshooting.md) | Diagnostics, resets, common fixes |
| [FAQ](./09-faq.md) | Frequently asked questions |

## Bug Reports & Feedback

[github.com/docker/sbx-releases/issues](https://github.com/docker/sbx-releases/issues)
