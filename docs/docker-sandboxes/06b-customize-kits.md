# Kits

Source: https://docs.docker.com/ai/sandboxes/customize/kits/

> **Experimental:** Kits are experimental. The kit file format, CLI commands, and experience are subject to change.

A kit packages a set of capabilities a sandbox can use:
- Tools to install
- Environment variables to set
- Credentials to inject
- Network rules to allow or deny domains
- Files to drop in
- Startup commands to run
- Memory instructions to give the agent

## Kit Types

| Type | `kind` | Purpose |
|------|--------|---------|
| Mixin | `mixin` | Extend an existing agent with extra capabilities |
| Sandbox | `sandbox` | Define a full agent from scratch |

## Capabilities

### Run Commands

**Install commands** — execute once at creation:

```yaml
commands:
  install:
    - command: "apt-get update && apt-get install -y jq"
```

**Startup commands** — execute each time the sandbox starts:

```yaml
commands:
  startup:
    - command: ["my-daemon"]
      background: true
```

> Install and startup command output is only emitted during `sbx run` or `sbx create`; it is not retained for later inspection. Recreate the sandbox to see fresh output.

### Inject Files

**Static files** bundled with the kit:

```
my-kit/
├── spec.yaml
└── files/
    ├── home/
    │   └── .config/my-tool/settings.json
    └── workspace/
        └── .editorconfig
```

**`initFiles`** written at startup with runtime values:

```yaml
commands:
  initFiles:
    - path: /home/agent/.my-tool/config.json
      content: '{"workspace": "${WORKDIR}"}'
      onlyIfMissing: true
```

> Sandboxes seed settings files for some built-in agents during setup. Kit-injected files at those paths get overwritten. To override a path the sandbox writes to, use a `commands.startup` script instead.

### Set Environment Variables

```yaml
environment:
  variables:
    MY_TOOL_WORKSPACE: /home/agent/my-tool
```

> Do not put secret values directly in `environment.variables` — they'd be visible inside the sandbox VM.

### Control Network Access

```yaml
network:
  allowedDomains:
    - api.example.com
    - "*.cdn.example.com"
  deniedDomains:
    - telemetry.example.com
```

> Deny always wins over allow. Kit network rules don't apply when organization governance is active — only organization rules are evaluated in that case.

### Authenticate to External Services

Use the four-block pattern to inject credentials via the proxy without exposing them in the VM:

```yaml
network:
  allowedDomains:
    - api.example.com
  serviceDomains:
    api.example.com: my-service
  serviceAuth:
    my-service:
      headerName: Authorization
      valueFormat: "Bearer %s"

credentials:
  sources:
    my-service:
      env:
        - MY_SERVICE_API_KEY

environment:
  proxyManaged:
    - MY_SERVICE_API_KEY
```

The agent boots with `MY_SERVICE_API_KEY=proxy-managed`. When it sends a request, the proxy overwrites the header with the real credential before forwarding.

> Map only the hosts that need credential injection — an overly broad `serviceDomains` mapping can break downloads.

### Inject Agent Memory

```yaml
agentContext: |
  Ruff is installed. Run `ruff check` before committing.
  Shared config lives at `/workspace/ruff.toml`.
```

Multiple kits create a directory structure the agent can read:

```
/Users/you/
├── myproject/
├── AGENTS.md
└── kits-agent-context/
    ├── ruff-lint.md
    ├── vale.md
    └── git-ssh-sign.md
```

### Define an Agent (Sandbox Kits Only)

```yaml
sandbox:
  image: "my-registry/my-agent:latest"
  entrypoint:
    run: [my-agent, "--yolo"]
```

## Mixin Kit Example — Python Linting

Directory structure:

```
ruff-lint/
├── spec.yaml
└── files/
    └── workspace/
        └── ruff.toml
```

`spec.yaml`:

```yaml
schemaVersion: "1"
kind: mixin
name: ruff-lint
displayName: Ruff Linter
description: Python linting with shared team config

network:
  allowedDomains:
    - pypi.org
    - files.pythonhosted.org

commands:
  install:
    - command: "uv tool install ruff@latest"
      user: "1000"
      description: Install Ruff
```

`ruff.toml`:

```toml
line-length = 100

[lint]
select = ["E", "F", "I"]
```

## Sandbox Kit Example — Full Claude Agent Definition

```yaml
schemaVersion: "1"
kind: sandbox
name: claude
sandbox:
  image: "docker/sandbox-templates:claude-code-docker"
  aiFilename: CLAUDE.md
  entrypoint:
    run: [claude, "--dangerously-skip-permissions"]

network:
  serviceDomains:
    api.anthropic.com: anthropic
    console.anthropic.com: anthropic
  serviceAuth:
    anthropic:
      headerName: x-api-key
      valueFormat: "%s"
  allowedDomains:
    - "claude.com:443"

credentials:
  sources:
    anthropic:
      env:
        - ANTHROPIC_API_KEY

environment:
  variables:
    IS_SANDBOX: "1"

commands:
  install:
    - command: "curl -fsSL https://claude.ai/install.sh | bash"
      user: "1000"
      description: Install Claude Code
```

## Using Kits

> `--kit` only takes effect when a sandbox is created. Passing it against an existing sandbox name fails with: `--kit can only be used when creating a new sandbox`.

### From a Local Path

```console
$ sbx run claude --kit ./my-kit/
$ sbx run claude --kit ./my-kit-1.0.zip
```

Apply to a running sandbox (for iteration):

```console
$ sbx kit add my-sandbox ./my-kit/
```

> Kits cannot be removed from a running sandbox — remove and recreate it to start clean.

### From a Git Repository

```console
$ sbx run claude --kit "git+https://github.com/docker/sbx-kits-contrib.git#ref=v0.1.0&dir=code-server"
```

| Parameter | Purpose |
|-----------|---------|
| `#ref=<branch\|tag\|commit>` | Pin to a specific revision |
| `#dir=<path>` | Load from a subdirectory |

`git+ssh://` URLs are supported with a local SSH agent.

### From an OCI Registry

```console
$ sbx run claude --kit ghcr.io/myorg/my-kit:1.0
```

Docker Hub requires the full `docker.io` prefix.

Registry credentials:

```console
$ gh auth token | sbx secret set --registry ghcr.io --password-stdin
```

> `sbx kit push` only uses the Docker credential store, so pushing to a private registry requires a prior `docker login`.

## Packaging and Distribution CLI

```console
$ sbx kit validate <path>       # Validate kit spec
$ sbx kit inspect <path>        # Inspect kit
$ sbx kit inspect <path> --json # JSON output
$ sbx kit pack <path> -o <file.zip>  # Package as zip
$ sbx kit push <path> <ref>     # Push to OCI registry
$ sbx kit pull <ref>            # Pull from registry
```

## Debugging

View all outbound requests and matched rules:

```console
$ sbx policy log
```

Inspect inside the sandbox:

```console
$ sbx exec <sandbox> -- which mytool
$ sbx exec <sandbox> -- ls /home/agent/.local/bin/
$ sbx exec <sandbox> -- cat /home/agent/.config/...
```
