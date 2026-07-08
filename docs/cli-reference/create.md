# sbx create

**Description** — Create a sandbox for an agent
**Usage** — `sbx create [flags] AGENT PATH [PATH...]`

## Description

Create a sandbox with access to a host workspace for an agent.

Use "sbx run --name SANDBOX" to attach to the agent after creation.

## Commands

| Command | Description |
| --- | --- |
| `sbx create claude` | Create a sandbox for claude |
| `sbx create codex` | Create a sandbox for codex |
| `sbx create copilot` | Create a sandbox for copilot |
| `sbx create cursor` | Create a sandbox for cursor |
| `sbx create docker-agent` | Create a sandbox for docker-agent |
| `sbx create droid` | Create a sandbox for droid |
| `sbx create gemini` | Create a sandbox for gemini |
| `sbx create kiro` | Create a sandbox for kiro |
| `sbx create opencode` | Create a sandbox for opencode |
| `sbx create shell` | Create a sandbox for shell |

## Options

| Option | Default | Description |
| --- | --- | --- |
| `--clone` |  | Run the agent on a private in-container clone of the host Git repository (mounted read-only) instead of bind-mounting the workspace; the agent's commits are accessible via the sandbox-<name> git remote on the host |
| `--cpus` | `0` | Number of CPUs to allocate to the sandbox (0 = auto: all host CPUs) |
| `--kit` |  | experimental Kit reference (directory, ZIP, or OCI). Can be specified multiple times |
| `-m, --memory` |  | Memory limit in binary units (e.g., 1024m, 8g). Default: 50% of host memory, max 32 GiB |
| `--name` |  | Name for the sandbox (default: <agent>-<workdir>, letters, numbers, hyphens, periods, plus signs and minus signs only) |
| `-q, --quiet` |  | Suppress verbose output |
| `-t, --template` |  | Container image to use for the sandbox (default: agent-specific image) |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# Create a sandbox for Claude in the current directory
sbx create claude .

# Create a sandbox with a custom name
sbx create --name my-project claude /path/to/project

# Create with additional read-only workspaces
sbx create claude . /path/to/docs:ro

# Run the agent on an in-container clone of the host repo, wired back via a git-daemon
sbx create --clone claude .
```

## Subcommands

- [`sbx create claude`](create/claude.md)
- [`sbx create codex`](create/codex.md)
- [`sbx create copilot`](create/copilot.md)
- [`sbx create cursor`](create/cursor.md)
- [`sbx create docker-agent`](create/docker-agent.md)
- [`sbx create droid`](create/droid.md)
- [`sbx create gemini`](create/gemini.md)
- [`sbx create kiro`](create/kiro.md)
- [`sbx create opencode`](create/opencode.md)
- [`sbx create shell`](create/shell.md)
