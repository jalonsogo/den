# Default Security Posture

Source: https://docs.docker.com/ai/sandboxes/security/defaults/

## Network Defaults

- All outbound HTTP and HTTPS traffic is **blocked** unless an explicit allow rule exists (deny-by-default)
- Non-HTTP protocols (raw TCP, UDP, DNS, ICMP) are blocked at the network layer
- Private IP ranges, loopback addresses, and link-local traffic are restricted

View active rules:
```console
$ sbx policy ls
```

Customize with `sbx policy` or via the Admin Console.

## Workspace Defaults

By default sandboxes use **direct mounting**: the agent sees and modifies your working tree directly, and changes appear on your host immediately.

The agent has broad file system permissions within the workspace directory, including access to:
- Hidden files
- Configuration files
- Build scripts
- Git hooks

## Credential Defaults

No credentials are available to the sandbox unless you provide them via `sbx secret` or environment variables.

When supplied, a host-side proxy injects credentials into outbound HTTP headers — the agent never has access to raw credential values.

## Agent Capabilities Inside the Sandbox

Inside the VM, agents operate with elevated privileges:

| Capability | Detail |
|-----------|--------|
| `sudo` access | Non-root user with sudo |
| Private Docker Engine | Full Docker access inside the VM |
| Package installation | `apt`, `pip`, `npm`, etc. |
| Filesystem access | Full read-write within the workspace |

VM installations persist across stop/restart cycles. `sbx rm` deletes the sandbox; workspace files on the host are preserved.

## Permanently Blocked — Cannot Be Changed via Policy

The following are hard-blocked regardless of any policy configuration:

- Host filesystem access beyond the workspace
- Host Docker daemon
- Host network and localhost
- Inter-sandbox communication
- Raw TCP, UDP, ICMP connections
- Traffic to private IP ranges and link-local addresses
- Outbound HTTP/HTTPS to non-allowlisted domains *(the allowed list is customizable)*
