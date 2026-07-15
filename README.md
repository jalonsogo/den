<div align="center">

<img src="resources/icon/dock.png" alt="den" width="300" />

# den · Developer Ephemeral Node

**Spin up ephemeral coding environments where AI builds your apps.**

[useden.ai](https://useden.ai)

den is a beautiful desktop GUI for [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) (the `sbx` CLI). Launch disposable, isolated environments, point an AI agent (Claude Code, Codex, Cursor, Gemini, …) at a workspace, and let it build, run, and iterate on apps — then throw the sandbox away when you're done. All without living in the terminal.

<br />

<img src="docs/shots-ui/21-dark-sandbox-claude-agent.png" alt="den — a running sandbox with Claude Code, sandboxes organized into groups" width="820" />

</div>

---

## What it does

den wraps the `sbx` CLI in a native macOS, Windows, and Linux app:

- **Sandboxes** — create, run, stop, and delete agent sandboxes. Pick any agent (Claude, Codex, Cursor, Gemini, Copilot, Droid, …), a workspace, optional memory and Git‑clone isolation, and a random cosmic name. Watch live progress while a sandbox is created.
- **Agent & Shell terminals** — full‑screen agent TUIs (e.g. Claude Code) and an interactive shell, rendered with **xterm.js** over a real PTY.
- **Files** — browse the sandbox workspace, open/edit files in a dedicated editor window, and see the agent's **changes inline** (live `git status` badges).
- **Groups** — organize sandboxes into named groups. Drag to reorder within a group or move a sandbox to another group (an insertion line marks a reorder; a highlighted group marks a move — no modifier keys). Start or stop every sandbox in a group at once, or delete the group (optionally with its sandboxes). Give each sandbox its own **color + icon** so you can tell them apart at a glance.
- **Network policy** — see exactly which domains a sandbox can reach, add allow rules from the UI, and get a clear warning when an org governance profile is overriding local rules.
- **Secrets** — manage `sbx` service credentials (Anthropic, OpenAI, Google, GitHub, …) with OAuth where supported, or source a value straight from **1Password** — paste an `op://Vault/Item/field` reference and den resolves it via the `op` CLI, so the real value never lives in den.
- **Templates & Runtime** — list/launch/delete template images; check the `sbx` version, view release notes, and update in place. See whether you're signed in to the runtime and re‑authenticate in a click.
- **Logs** — live‑tail the `sbx` daemon logs, or read a specific sandbox's kit‑startup log.
- **Theming** — light / dark / system, custom accent colors that retint the whole UI, and a terminal theme that can follow the app's light/dark mode or be set independently.
- **Stay awake** — optionally prevent system sleep while any sandbox is running, so long agent runs aren't interrupted (toggle in Settings).
- **Keyboard‑driven** — ⌘N new · ⌘S stop · ⌘R restart · ⌘L logs · ⌘F files · ⌘I info · ⌘X delete, plus a menu‑bar app for quick access to running sandboxes and groups from the tray.

## Git workflow

den keeps your working tree safe and makes it easy to get an agent's work back onto your machine:

- **Clone isolation** — create a sandbox with `--clone` and the agent works on a private, in‑container clone of your repo; your host workspace is mounted read‑only, so nothing the agent does touches your files directly. A `sandbox-<name>` git remote links the two.
- **Live changes** — see what the agent created or changed via `git status` run inside the sandbox (the **Changes** tab), with inline status badges. Works for both mounted and cloned workspaces.
- **Git context at a glance** — each sandbox's header condenses its folder, branch, uncommitted‑change count, and a link to the GitHub remote into one line.
- **Bring the work home** — from a sandbox's menu, **Feature changes ▸ Merge changes to your repo**: den fetches the sandbox's branch into your host repo, then either **opens a pull request** (when the repo has a remote — it pushes and creates the PR) or **merges** it into your current branch. Pick **Merge, then delete** to finish and discard the sandbox in one step. Nothing lands without a confirmation.

## Kits — compose & share agent setups

Kits are declarative add‑ons (`sbx` artifacts) that layer tools, MCPs, network rules, env vars, agent memory, and startup commands onto an agent. den makes them first‑class:

- **Visual composer** — build a kit from a form (no YAML): add capabilities from a dropdown — **Remote MCPs**, network policies, env variables, agent memory (attach PDFs/MD/txt), and commands.
- **Remote‑MCP catalog** — 50+ hosted MCP servers (GitHub, Linear, Notion, Figma, Sentry, Supabase, …) with icons, search, and category filters; or add a **Custom MCP** by URL. Each becomes a one‑click allow rule + registration.
- **Mixin vs Sandbox kits** — stack several *mixin* kits onto an agent, or define a full agent from a base image with a *sandbox* kit.
- **Add anywhere** — attach kits at sandbox creation, or inject them into a running sandbox; the kits applied to a sandbox show in its info panel.
- **Share via any OCI registry** — push a kit to Docker Hub / ghcr (`sbx kit push`) straight from the row's menu, with the reference prefilled from your logged‑in Docker account. Pull a friend's kit by reference — import it into your library or attach it at creation, no download step.

## Requirements

- macOS, Windows, or Debian/Ubuntu Linux (x64 or arm64 package)
- [Docker](https://www.docker.com/) running
- The **`sbx`** CLI installed and signed in:
  ```bash
  brew install docker/tap/sbx   # macOS
  sbx login
  ```

> **Linux status:** `.deb` packaging targets are configured for x64 (`amd64`
> in Debian package metadata) and arm64. The amd64 path has been build-validated;
> arm64 must be validated on a builder that actually supports `linux/arm64`
> before an arm64 artifact is claimed. Packaging is build-validated separately
> from end-to-end runtime behavior; Linux is initial support rather than a
> fully runtime-certified platform. Install Docker and a native `sbx` binary
> yourself before launching den. In particular, confirm that an `sbx` build is
> available for Linux arm64—the den package does not bundle it. Some login,
> update, and log-path flows retain macOS-oriented behavior and may need manual
> CLI use on Linux.
>
> The Linux **main window** uses an Electron frameless toolbar with accessible
> Close, Minimize, and Maximize/Restore buttons; file-editor windows keep their
> native desktop frame. This is application chrome, not native GNOME client-side
> decoration (CSD). The compositor and X11/Wayland session control drag-region
> double-click behavior, resize borders, corners, and any window shadow. den does
> not draw a synthetic shadow. Validate those interactions on each supported
> desktop/session; the current automated package check verifies wiring rather
> than pixel-level appearance.

## Troubleshooting

Hitting an error? See the [FAQ & Troubleshooting guide](docs/faq.md) — it starts
with known problems (like the `sbx` daemon "another daemon is already running"
race) and their fixes.

## Development

Use Node.js 26.5.0 (see `.nvmrc`) and npm 12.0.1. Node Current is required for reproducible development and CI.

```bash
npm install
npm run dev        # launch the app with hot reload (electron-vite)
```

> Renderer changes hot‑reload; main/preload changes take effect on a full relaunch.

## Build

The local Debian release builder needs only a running Docker installation with
the Buildx plugin. Node, npm, the compiler toolchain, and Debian packaging tools
all run inside a pinned Ubuntu 26.04 image:

```bash
# Build both architectures (requires a builder that supports amd64 and arm64)
docker buildx bake

# Or build one architecture
docker buildx bake deb-amd64
docker buildx bake deb-arm64
```

The first command writes one package per architecture without filename
collisions:

```text
dist/docker/amd64/den_<version>_amd64.deb
dist/docker/arm64/den_<version>_arm64.deb
```

`linux/amd64` maps to Electron `x64` and Debian `amd64`; `linux/arm64` maps to
Electron and Debian `arm64`. Each target runs `npm ci` from `package-lock.json`,
type-checks and bundles the app, builds `node-pty` inside the target-platform
container, and invokes `electron-builder` with publishing disabled. The image
pins Ubuntu 26.04 by digest and downloads the Node version declared by `.nvmrc`
(Node 26.5.0) using architecture-specific checksums. It installs the exact npm
version from `packageManager` (npm 12.0.1); Electron 43.1.1 and all npm
dependencies are reproducibly resolved by `package-lock.json`.

On an amd64 host, the arm64 command needs either a native arm64 Buildx node or
QEMU/binfmt registered with Docker. Docker Desktop normally provides emulation;
on Docker Engine, configure a multi-platform builder separately. Check the
selected builder before building:

```bash
docker buildx ls
docker buildx inspect --bootstrap
```

Only claim an arm64 package as validated after that target has completed and
its package/native ELF metadata has been inspected. BuildKit retains image,
`apt`, and npm cache layers between runs; source changes reuse dependency
layers while `package.json` or `package-lock.json` changes invalidate `npm ci`.
Use `docker buildx prune` when you intentionally want to remove the builder's
cache. Existing host `node_modules/`, `out/`, and `dist/` directories are
excluded by `.dockerignore`.

The existing npm commands remain available for development hosts that already
have Node and native build prerequisites:

```bash
npm run build              # bundle the application
npm run build:mac          # package a macOS app
npm run build:win          # package a Windows app
npm run build:linux:x64    # package a Debian amd64 .deb on native x64 Linux
npm run build:linux:arm64  # package a Debian arm64 .deb on native arm64 Linux
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
