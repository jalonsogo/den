# sbx create claude

**Description** — Create a sandbox for claude
**Usage** — `sbx create claude PATH [PATH...] [flags]`

## Description

Create a sandbox with access to a host workspace for claude.

The workspace path is required and will be mounted inside the sandbox at the same path as on the host. Additional workspaces can be provided as extra arguments. Append ":ro" to mount them read-only.

Use "sbx run --name SANDBOX" to attach to the agent after creation.

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `--clone` |  | Run the agent on a private in-container clone of the host Git repository (mounted read-only) instead of bind-mounting the workspace; the agent's commits are accessible via the sandbox-<name> git remote on the host |
| `--cpus` | `0` | Number of CPUs to allocate to the sandbox (0 = auto: all host CPUs) |
| `-D, --debug` |  | Enable debug logging |
| `--kit` |  | experimental Kit reference (directory, ZIP, or OCI). Can be specified multiple times |
| `-m, --memory` |  | Memory limit in binary units (e.g., 1024m, 8g). Default: 50% of host memory, max 32 GiB |
| `--name` |  | Name for the sandbox (default: <agent>-<workdir>, letters, numbers, hyphens, periods, plus signs and minus signs only) |
| `-q, --quiet` |  | Suppress verbose output |
| `-t, --template` |  | Container image to use for the sandbox (default: agent-specific image) |

## Examples

```
# Create in the current directory
sbx create claude .

# Create with a specific path
sbx create claude /path/to/project

# Create with additional read-only workspaces
sbx create claude . /path/to/docs:ro
```
