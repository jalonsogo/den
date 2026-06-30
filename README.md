<div align="center">

<img src="resources/icon/dock.png" alt="den" width="300" />

# Den · Developer Ephemeral Node

**Spin up ephemeral coding environments where AI builds your apps.**

[den.studio](https://den.studio)

Den is a beautiful desktop GUI for [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) (the `sbx` CLI). Launch disposable, isolated environments, point an AI agent (Claude Code, Codex, Cursor, Gemini, …) at a workspace, and let it build, run, and iterate on apps — then throw the sandbox away when you're done. All without living in the terminal.

</div>

---

## What it does

den wraps the `sbx` CLI in a native macOS/Windows app:

- **Sandboxes** — create, run, stop, and delete agent sandboxes. Pick any agent (Claude, Codex, Cursor, Gemini, Copilot, Droid, …), a workspace, optional memory and Git‑clone isolation, and a random cosmic name. Watch live progress while a sandbox is created.
- **Agent & Shell terminals** — full‑screen agent TUIs (e.g. Claude Code) and an interactive shell, rendered with **xterm.js** over a real PTY.
- **Files** — browse the sandbox workspace, open/edit files in a dedicated editor window, and see the agent's **changes inline** (live `git status` badges).
- **Projects, color‑coded** — sandboxes grouped by workspace; give a project a color + icon and its sandboxes inherit the color so you can tell them apart at a glance.
- **Network policy** — see exactly which domains a sandbox can reach, add allow rules from the UI, and get a clear warning when an org governance profile is overriding local rules.
- **Secrets** — manage `sbx` service credentials (Anthropic, OpenAI, Google, GitHub, …), with OAuth where supported.
- **Templates & Runtime** — list/launch/delete template images; check the `sbx` version, view release notes, and update in place.
- **Logs** — live‑tail the `sbx` daemon logs, or read a specific sandbox's kit‑startup log.
- **Theming** — light / dark, custom accent colors that retint the whole UI, and a terminal theme that can follow the app's light/dark mode or be set independently.
- **Menu‑bar app** — quick access to running sandboxes and projects from the tray.

## Kits — compose & share agent setups

Kits are declarative add‑ons (`sbx` artifacts) that layer tools, MCPs, network rules, env vars, agent memory, and startup commands onto an agent. den makes them first‑class:

- **Visual composer** — build a kit from a form (no YAML): add capabilities from a dropdown — **Remote MCPs**, network policies, env variables, agent memory (attach PDFs/MD/txt), and commands.
- **Remote‑MCP catalog** — 50+ hosted MCP servers (GitHub, Linear, Notion, Figma, Sentry, Supabase, …) with icons, search, and category filters; or add a **Custom MCP** by URL. Each becomes a one‑click allow rule + registration.
- **Mixin vs Sandbox kits** — stack several *mixin* kits onto an agent, or define a full agent from a base image with a *sandbox* kit.
- **Add anywhere** — attach kits at sandbox creation, or inject them into a running sandbox; the kits applied to a sandbox show in its info panel.
- **Share via any OCI registry** — push a kit to Docker Hub / ghcr (`sbx kit push`) straight from the row's menu, with the reference prefilled from your logged‑in Docker account. Pull a friend's kit by reference — import it into your library or attach it at creation, no download step.

## Requirements

- macOS or Windows
- [Docker](https://www.docker.com/) running
- The **`sbx`** CLI installed and signed in:
  ```bash
  brew install docker/tap/sbx   # macOS
  sbx login
  ```

## Development

```bash
npm install
npm run dev        # launch the app with hot reload (electron-vite)
```

> Renderer changes hot‑reload; main/preload changes take effect on a full relaunch.

## Build

```bash
npm run build      # type-check + bundle
npm run build:mac  # package a macOS app
npm run build:win  # package a Windows app
```

## Tech stack

Electron · React · TypeScript · electron‑vite · Zustand · xterm.js · lucide‑react · @lobehub/icons · @basiclines/rampa‑sdk (palette generation)

## Project layout

```
src/
  main/      # Electron main: sbx wrapper, PTYs, IPC, tray, window
  preload/   # contextBridge API surface
  renderer/  # React app (components, store, styles)
```

---

<div align="center">
<sub>Not affiliated with Docker, Inc. den is an independent GUI for the <code>sbx</code> CLI.</sub>
</div>
