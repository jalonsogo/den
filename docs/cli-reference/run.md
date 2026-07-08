# sbx run

**Description** — Run an agent in a sandbox
**Usage** — `sbx run [flags] [AGENT] [PATH...] [-- AGENT_ARGS...]`

## Description

Run an agent in a sandbox, creating the sandbox if it does not already exist.

The first positional argument is the agent to run. To re-attach to an existing sandbox by name, use --name; the agent positional is optional when the named sandbox already exists and is read from its spec.

Pass agent arguments after the "--" separator. Additional workspaces can be provided as extra arguments. Append ":ro" to mount them read-only.

To create a sandbox without attaching, use "sbx create" instead, or pass --detached (-d) to print the sandbox ID and exit without opening an interactive session.

Available agents: claude, codex, copilot, cursor, docker-agent, droid, gemini, kiro, opencode, shell

## Options

| Option | Default | Description |
| --- | --- | --- |
| `--clone` |  | Run the agent on a private in-container clone of the host Git repository; must be set at sandbox creation time (no-op when re-attaching to an existing clone-mode sandbox) |
| `--cpus` | `0` | Number of CPUs to allocate to the sandbox (0 = auto: all host CPUs) |
| `--kit` |  | experimental Kit reference (directory, ZIP, or OCI). Can be specified multiple times |
| `-m, --memory` |  | Memory limit in binary units (e.g., 1024m, 8g). Default: 50% of host memory, max 32 GiB |
| `--name` |  | Name for the sandbox (default: <agent>-<workdir>) |
| `-t, --template` |  | Container image to use for the sandbox (default: agent-specific image) |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# Create and run a sandbox with claude in current directory
sbx run claude

# Create and run with additional workspaces (read-only)
sbx run claude . /path/to/docs:ro

# Re-attach to an existing sandbox by name (agent read from its spec)
sbx run --name existing-sandbox

# Re-attach to an existing sandbox by name and verify the expected agent
sbx run claude --name existing-sandbox

# Run a sandbox with agent arguments
sbx run claude -- --continue
```
