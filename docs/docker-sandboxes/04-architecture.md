# Architecture

Source: https://docs.docker.com/ai/sandboxes/architecture/

## Workspace Integration

Workspaces are mounted directly into sandboxes via filesystem passthrough. Absolute paths are preserved so that error messages, configuration files, and build outputs all reference paths you can find on your host.

## Isolation Model

Each sandbox maintains its own:
- Docker daemon
- Image cache
- Package installations

Sandboxes are completely separate from one another — no shared image layers or resource conflicts between sandboxes.

## Storage

All sandbox contents — Docker images, containers, packages, and workspace modifications — persist until the sandbox is explicitly removed. Disk consumption grows as users build and install components inside the sandbox.

Removing a sandbox with `sbx rm` deletes the VM and all its contents. Workspace files on the host are never affected.

## Networking Architecture

Outbound traffic routes through an **HTTP/HTTPS proxy** running on the host machine.

### Upstream Proxy Configuration

Upstream proxy support is available via environment variables:

| Variable | Purpose |
|----------|---------|
| `HTTP_PROXY` | HTTP upstream proxy |
| `HTTPS_PROXY` | HTTPS upstream proxy |
| `NO_PROXY` | Bypass list |
| `DOCKER_SANDBOXES_PROXY` | Sandbox-specific proxy override |

> **Limitation:** Only HTTP and HTTPS traffic can be forwarded to an upstream proxy. Other TCP traffic cannot be redirected. Proxy auto-configuration (PAC) files are not supported.

## Lifecycle

| Phase | What Happens |
|-------|-------------|
| `sbx run` | Initializes a VM with workspace access; agent starts |
| `sbx stop` | Stops the agent; VM state preserved |
| Subsequent `sbx run` | Reconnects to existing sandbox |
| `sbx rm` | Deletes the VM and all contents; host workspace untouched |

## Comparison to Alternatives

Docker Sandboxes provides **hypervisor-level isolation** with isolated Docker daemons, contrasting with:

- **Lighter container approaches** — less isolation, shared kernel
- **Host execution** — no isolation, maximum resource efficiency

The trade-off is resource usage for security: each sandbox has its own VM kernel.
