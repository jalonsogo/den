# FAQ

Source: https://docs.docker.com/ai/sandboxes/faq/

## Pricing & Commercial Use

**Is Docker Sandboxes free? Can I use it commercially?**

The `sbx` CLI is free for all uses including commercial applications. Organization governance (centrally managed network and filesystem policies) requires a paid subscription through Docker Sales.

## Authentication Requirements

**Why do I need to sign in?**

Signing in establishes verified sandbox identity, enabling:
- Association of sandboxes with actual users
- Team collaboration features and audit capabilities
- Authentication for Docker infrastructure services

The Docker account email is used for authentication only, not marketing communications.

## Organization Policies

**Can I enforce sandbox policies across my organization?**

Administrators can use the Docker Admin Console to manage network and filesystem policies centrally. Organization governance replaces local rules set with `sbx policy` when active. This requires a paid subscription.

## Telemetry & Privacy

**Does the CLI collect telemetry?**

Basic usage metrics are collected (command type, success/failure, duration, username if signed in). Sandboxes don't monitor sessions or access code.

Opt out:

```console
export SBX_NO_TELEMETRY=1
```

## Custom Environment Variables

**How do I set custom environment variables inside a sandbox?**

Write variables to `/etc/sandbox-persistent.sh`:

```console
$ sbx exec -d <sandbox-name> bash -c "echo 'export BRAVE_API_KEY=your_key' >> /etc/sandbox-persistent.sh"
```

This file sources automatically on shell login. It is not loaded for direct command execution without a `bash -c` wrapper.

## Agent Permissions

**Why do agents run without approval prompts?**

The microVM isolation boundary handles safety concerns through network policies and credential isolation, negating typical reasons for approval prompts. Re-enable prompts via agent commands (e.g., Claude Code's `/permissions`).

## Sandbox Detection

**How do I know if my agent is running in a sandbox?**

Ask the agent directly. In Claude Code, use `/btw are you running in a sandbox?` without interrupting tasks.

## Agent Configuration

**Why doesn't the sandbox use my user-level agent configuration?**

Sandboxes access only project-level configuration within the working directory, not host directories like `~/.claude`. Copy needed files into your project:

```console
$ cp -r ~/.claude/skills .claude/skills
```

Avoid symlinks — sandboxes cannot follow paths external to the workspace.

## Image Pasting

**Can I paste images into an agent?**

Yes, but disabled by default. Enable:

```console
$ sbx settings set clipboard.imagePaste true
```

> This relaxes the sandbox's isolation by allowing clipboard access.

## Headless Linux Support

**Can I use Docker Sandboxes on headless Linux?**

Yes. The CLI stores secrets in system keyrings where available, or in encrypted files at `~/.config/com.docker.sandboxes` otherwise. Files are encrypted at rest and protected by `0700` directory permissions.
