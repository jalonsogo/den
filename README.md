<div align="center">

<img src="logo.png" alt="minipit" width="120" />

# minipit

**A beautiful desktop GUI for [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) (the `sbx` CLI).**

Launch, monitor, and work with AI‑agent sandboxes — without living in the terminal.

</div>

---

## What it does

minipit wraps the `sbx` CLI in a native macOS/Windows app:

- **Sandboxes** — create, run, stop, and delete agent sandboxes. Pick any agent (Claude, Codex, Cursor, Gemini, Copilot, Droid, …), a workspace, optional memory and Git‑clone isolation, and a random cosmic name.
- **Agent & Shell terminals** — full‑screen agent TUIs (e.g. Claude Code) and an interactive shell, rendered with **xterm.js** over a real PTY.
- **Files** — browse the sandbox workspace, open/edit files in a dedicated editor window, and see the agent's **changes inline** (live `git status` badges).
- **Projects** — sandboxes grouped by workspace; open a project to see its sandboxes and files.
- **Secrets** — manage `sbx` service credentials (Anthropic, OpenAI, Google, GitHub, …), with OAuth where supported.
- **Templates** — list, launch from, and delete sandbox template images.
- **Kits & Mixins** — author kit artifacts from a form (no YAML required) and pack them with `sbx kit pack`.
- **Logs** — live‑tail the `sbx` daemon logs.
- **Theming** — light / dark (GitHub‑dark palette), custom accent colors, and an independent terminal theme.

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
<sub>Not affiliated with Docker, Inc. minipit is an independent GUI for the <code>sbx</code> CLI.</sub>
</div>
