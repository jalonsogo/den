# Usage Guide

Source: https://docs.docker.com/ai/sandboxes/usage/

## Core Sandbox Operations

| Command | Purpose |
|---------|---------|
| `sbx run <agent>` | Start a sandbox |
| `sbx ls` | Check status of running sandboxes |
| `sbx stop <name>` | Pause without deleting |
| `sbx rm <name>` | Delete sandbox and all contents |
| `sbx exec -it <name> bash` | Open a shell inside a running sandbox |

## Authentication (Non-Interactive Environments)

Use Docker Personal Access Tokens for CI or headless setups:

```console
$ sbx login --username <your-docker-id> --password-stdin
```

Tokens require at least **Read** scope — generate them from Docker account settings.

## Interactive Dashboard

Running `sbx` without subcommands launches a terminal dashboard showing:
- Sandbox cards with live CPU and memory metrics
- Create, start/stop, attach to agent sessions, open shells, remove sandboxes
- Network governance panel for monitoring outbound connections and managing policies

## Git Integration

### Direct Mode (Default)

The agent has read-write access to your working tree. Changes appear on the host immediately.

### Clone Mode (`--clone`)

Creates a private sandbox Git clone with a read-only host mount. The sandbox exposes its clone as a remote for fetching.

```console
$ sbx run --clone --name my-sandbox claude
```

Restrictions:
- Requires a Git repository — creation fails in non-Git workspaces or from Git worktrees
- The Git daemon runs only while the sandbox is active

## Sandbox Persistence and Naming

- Sandboxes persist after the agent exits
- Running `sbx run` in the same workspace reconnects to an existing sandbox
- Use `--name` for explicit sandbox identity — enables re-attachment from any directory
- Multiple named sandboxes can share one workspace independently

## Multiple Workspaces and File Transfer

Mount multiple directories (first is the primary workspace):

```console
$ sbx run claude /path/to/primary /path/to/secondary:ro
```

The `:ro` suffix makes a mount read-only.

Copy files between host and sandbox:

```console
$ sbx cp ./local-file <sandbox-name>:/path/in/sandbox
$ sbx cp <sandbox-name>:/path/in/sandbox ./local-file
```

## Service Access and Port Forwarding

```console
$ sbx ports
```

- Services must listen on `0.0.0.0` or `[::]`
- Host services are accessible from sandboxes via `host.docker.internal`
- Published ports require explicit host port specification to unpublish
- Port mappings don't persist across stops

## Team Deployment

- Use custom **templates** for shared base environments
- Use **organization governance** for centralized admin enforcement across developers
- See [Customize](./06-customize.md) and [Governance](./07-governance.md)

## Data Persistence

| What | Persists across stop/restart | Removed by `sbx rm` |
|------|------------------------------|---------------------|
| Installed packages | Yes | Yes |
| Docker images inside sandbox | Yes | Yes |
| Configuration | Yes | Yes |
| Workspace files (on host) | N/A | No — host files untouched |
