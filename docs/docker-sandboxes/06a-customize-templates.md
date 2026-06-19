# Templates

Source: https://docs.docker.com/ai/sandboxes/customize/templates/

Templates capture a configured sandbox environment into a reusable image so you don't have to set up tools every time. Custom templates extend one of the built-in agent base images.

Templates make sense when multiple people need the same environment, when setup is tedious to repeat, or when you need pinned versions of specific tools.

> **Note:** Custom templates customize an existing agent's environment — they don't create new agent runtimes. The agent that runs inside the sandbox is determined by the base image variant and the `sbx run` command, not by binaries installed in the template. To define a new agent from scratch, use [Kits](./06b-customize-kits.md).

## Base Images

| Variant | Agent |
|---------|-------|
| `claude-code` | Claude Code |
| `claude-code-minimal` | Claude Code with minimal toolset (no Node.js, Python, Go, or Java) |
| `codex` | OpenAI Codex |
| `copilot` | GitHub Copilot |
| `cursor-agent` | Cursor |
| `docker-agent` | Docker Agent |
| `droid` | Droid |
| `gemini` | Gemini CLI |
| `kiro` | Kiro |
| `opencode` | OpenCode |
| `shell` | No agent pre-installed |

## Build a Custom Template

```dockerfile
FROM docker/sandbox-templates:claude-code
USER root
RUN apt-get update && apt-get install -y protobuf-compiler
USER agent
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```

Build and push:

```console
$ docker build -t my-org/my-template:v1 --push .
```

> **Note:** The Docker daemon used by Docker Sandboxes pulls templates from a registry directly; it doesn't share the image store of your local Docker daemon.

## Registry Credentials

For registries other than Docker Hub, store credentials before running:

```console
$ gh auth token | sbx secret set --registry ghcr.io --password-stdin
```

> **Important:** Unlike Docker commands, `sbx` does not automatically resolve the Docker Hub domain (`docker.io`) in image references.

## Template Caching

Increase Docker volume size (default 50 GB):

```console
$ DOCKER_SANDBOXES_DOCKER_SIZE=10g sbx run claude
```

Run a non-Docker variant:

```console
$ sbx run claude --template docker.io/docker/sandbox-templates:claude-code
```

Allow the registry during sandbox creation:

```console
$ sbx policy allow network "*.example.com:443,example.com:443"
```

## Save a Running Sandbox as a Template

```console
$ sbx template save my-sandbox my-template:v1
```

Run from the saved template:

```console
$ sbx run -t my-template:v1 claude
```

> **Warning:** Saving a sandbox captures its entire filesystem, including any secrets stored in it. If you manually added API keys or tokens to the sandbox, they're embedded in the saved template. Use `sbx secret set` for credentials instead.

## List and Remove Templates

```console
$ sbx template ls
$ sbx template rm my-template:v1
```

## Export and Import

```console
# Export
$ sbx template save my-sandbox my-template:v1 --output my-template.tar

# Import on another machine
$ sbx template load my-template.tar
$ sbx run -t my-template:v1 claude
```

Local load alternative (without export):

```console
$ docker image save my-org/my-template:v1 -o my-template.tar
$ sbx template load my-template.tar
```

## Agent Mismatch Warning

If a template was built for a different agent than the one specified in `sbx run`, the sandbox shows a warning:

```text
⚠ WARNING: template "my-template:v1" was built for the "claude" agent but you are using "codex".
  The sandbox may not work correctly. Consider using: sbx run -t my-template:v1 claude
```

## Limitations

- Agent configuration files (e.g., `/home/agent/.claude/settings.json`) are always recreated on sandbox creation — changes to these files do not persist in saved templates.
- Cached template images are cleared by `sbx reset`.
