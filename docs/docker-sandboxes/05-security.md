# Security Model

Source: https://docs.docker.com/ai/sandboxes/security/

## Trust Boundaries

The primary trust boundary is the **microVM**. The agent has full control inside the VM, including sudo access.

### What Enters the VM

| Item | How |
|------|-----|
| Workspace directory | Mounted read-write (default) or read-only (`--clone`) |
| Credentials | Injected via host-side proxy — raw values never enter the VM |
| Network access | HTTP/HTTPS to allowed domains proxied through host |

### What Crosses Back to the Host

| Item | Notes |
|------|-------|
| Workspace file changes | Real-time visibility in direct mode |
| HTTP/HTTPS requests | Only to allowed domains, via proxy |

### Blocked Entirely

- Host filesystem (outside workspace)
- Host Docker daemon
- Host network and localhost
- Other sandboxes
- Domains not in the allow list
- Raw TCP, UDP, ICMP

## Five Isolation Layers

| Layer | Description |
|-------|-------------|
| Hypervisor | Separate kernel per sandbox |
| Network | Proxied HTTP/HTTPS, deny-by-default, non-HTTP blocked |
| Docker Engine | Sandbox has its own Docker Engine |
| Workspace | Optional `--clone` mode for read-only repository mount |
| Credential | API key injection via proxy, never stored in VM |

See [Isolation Layers](./05b-security-isolation.md) for full details.

## Agent Capabilities Inside the Sandbox

Inside the VM the agent has full privileges:
- `sudo` access as a non-root user
- Private Docker Engine
- Package installation (`apt`, `pip`, `npm`, etc.)
- Full read-write access to the workspace

## What Is Not Isolated by Default

| Risk | Notes |
|------|-------|
| Workspace changes | Live on host in direct mode — review before trusting |
| Implicit file execution | Git hooks, CI configs, Makefiles, `package.json` scripts |
| Broad allow-list wildcards | e.g. `*.googleapis.com` — review your policy |

## Organization-Wide Control

Admins can enforce security, policy, and access consistently across every developer's sandboxes. See [Governance](./07-governance.md).

## Useful Commands

```console
$ sbx policy ls        # view active security rules
$ sbx run --clone ...  # read-only repository mount
```
