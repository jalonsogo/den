# Isolation Layers

Source: https://docs.docker.com/ai/sandboxes/security/isolation/

AI coding agents need to execute code, install packages, and run tools on your behalf. Docker Sandboxes run each agent in its own microVM protected by five isolation layers.

## 1. Hypervisor Isolation

| Property | Detail |
|----------|--------|
| Process isolation | Separate kernel per sandbox; host processes and other sandbox processes are invisible |
| Filesystem isolation | Only the workspace directory is shared with the host; the rest of the VM filesystem persists until `sbx rm` |
| Full cleanup | `sbx rm` removes the VM entirely |

The agent runs as a **non-root user with sudo privileges** inside the VM.

## 2. Network Isolation

- Sandboxes cannot communicate with each other or reach host localhost
- HTTP/HTTPS traffic is filtered through the host-side network policy proxy
- Raw TCP connections, UDP, and ICMP are blocked at the network layer
- DNS resolution is subject to policy restrictions
- Only domains explicitly listed in the policy are reachable

## 3. Docker Engine Isolation

Each sandbox runs its own **private Docker Engine**, isolated from your host Docker daemon. Agents cannot access the host Docker daemon.

## 4. Workspace Isolation

### Direct Mount (Default)

The workspace is shared into the VM as a read-write mount. The agent can modify:
- Source code
- Build files
- Git hooks
- CI configuration
- IDE settings

> **Warning:** Treat sandbox-modified workspace files the same way you would treat a pull request from an untrusted contributor — review before trusting.

### Clone Mode (`--clone`)

With `--clone`, the agent never works directly against your host repository. Even with full root inside the VM, it cannot modify your `.git` directory, your working tree, or any tracked file.

Protections:
- Read-only bind mount at `/run/sandbox/source`
- Private clone for agent edits
- Git daemon for fetching changes back to the host

## 5. Credential Isolation

Rather than passing API keys into the sandbox, the host-side proxy intercepts outbound API requests and injects authentication headers before forwarding each request.

**Credential values are never stored inside the VM.**
