# Supported Agents

Source: https://docs.docker.com/ai/sandboxes/agents/

Docker Sandboxes has built-in support for the following AI coding agents:

| Agent | `sbx run` argument |
|-------|--------------------|
| Claude Code | `claude` |
| Codex | `codex` |
| Copilot | `copilot` |
| Cursor | `cursor` |
| Droid | `droid` |
| Gemini | `gemini` |
| Kiro | `kiro` |
| OpenCode | `opencode` |
| Docker Agent | `docker-agent` |
| Shell (agent-less) | `shell` |

Use `shell` when you want a sandbox without a pre-installed agent — useful for manual setup or custom agent definitions via [Kits](./06b-customize-kits.md).

## Custom Agents

You can define entirely new agents from scratch using **Sandbox Kits** (a `kind: sandbox` kit spec). See [Customize — Kits](./06b-customize-kits.md) for details.

## Environment Customization

To pre-install tools or customize an agent's environment before the sandbox starts, use **Templates** or **Kits**. See [Customize](./06-customize.md).
