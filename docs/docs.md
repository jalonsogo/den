# den — Features

A catalog of what den does today. den is a desktop GUI over the `sbx` CLI
(Docker Sandboxes) for spinning up disposable, isolated environments and pointing
an AI agent at a workspace.

> **Maintenance:** keep this file current. When a feature is added, changed, or
> removed, update the relevant section here in the same change. See also
> [`faq.md`](faq.md) (troubleshooting), [`spec.md`](spec.md) (architecture), and
> [`README.md`](../README.md).

---

## Sandboxes

- Create, run, stop, and delete agent sandboxes. Pick an agent (Claude, Codex,
  Cursor, Gemini, Copilot, Droid, …), a workspace, optional memory and Git-clone
  isolation, and a random cosmic name. Live progress shows while a sandbox is
  created.
- **Groups** — organize sandboxes into named groups; drag to reorder or move
  between groups; start/stop a whole group at once; per-sandbox color + icon.
- **Keyboard-driven** — ⌘N new · ⌘S stop · ⌘R restart · ⌘L logs · ⌘F files ·
  ⌘I info · ⌘X delete, plus a menu-bar/tray app for quick access.

## Agent & Shell terminals

Full-screen agent TUIs (e.g. Claude Code) and an interactive shell, rendered with
xterm.js over a real PTY.

## Files & previewer

- Browse the sandbox workspace as a tree; drag files in to copy them; right-click
  for Open / Reveal in Finder / Download / Copy path / Delete.
- **Open behavior is configurable** (Settings → Files → *Open files with*): a
  left-click opens either the built-in **previewer** or the host's **default
  app**. The other option is always available from the right-click menu.
- **Internal previewer** (its own window) renders by file type:
  - **Code** — syntax-highlighted view with **line numbers**, plus an **Edit**
    tab (also with line numbers; ⌘S to save back into the sandbox).
  - **Markdown** — rendered (GitHub-flavored, embedded HTML supported),
    following the app theme, with a **Source** tab.
  - **HTML** — rendered in a locked-down sandboxed iframe (no scripts), with a
    **Code** tab to view source.
  - **Images** — shown inline.
  - **Other binary** — "we can't preview this file" with Download / Open-in-app.
  - The previewer follows the selected light/dark theme live.

## Changes & diff — Review & merge

The **Files → Changes tab** is the review surface (honoring "a branch per
sandbox — review the full diff and merge back"):

- **File list** with per-file **`+adds −dels`** and status. For clone-mode
  sandboxes it shows the agent's committed branch diff (`sandbox/<name>` vs base);
  for direct-mount it shows the working-tree diff.
- **Fixed action bar** at the bottom: total **`+/−`** stat and branch, plus
  actions. Clone mode: **Open PR…** and **Merge…** (+ "Delete after"). Direct
  mount: **Commit…** (commit with a message) and **Open PR…** (push
  the current branch + PR).
- **Exclude from commit** — in direct-mount review each file has a checkbox
  (all ticked by default); untick any and **Commit** stages/commits only the
  ticked files (`git commit -- <paths>`), leaving the rest uncommitted. The
  button shows the count (e.g. *Commit 3*) when a subset is selected.
- **Add to .gitignore** — right-click a file (Files tree or Changes list) →
  **Add to .gitignore** for that exact path, or **Ignore all `<glob>`** for a
  broader pattern (e.g. `**/.claude/settings.local.json` for generated agent
  config). The line is appended (deduped) to the workspace `.gitignore` and the
  file drops out of the change list.
- **Open PR…** expands inline into a form — **base** picker, editable **title**
  and **description** (prefilled from the branch's commits) — then **Create PR**
  shows the created PR inline (number/state + Open in browser); no auto-open.
- **Merge…** merges the branch into your current branch (conflicts abort cleanly),
  optionally deleting the sandbox after.
- The sandbox header's **changes dropdown** shows a short preview with a
  **Review & merge →** link into this panel.

- **Diff view** — clicking a changed file opens the previewer on a **Diff** tab
  (the branch diff in clone mode). A layout dropdown in the Diff tab switches
  between **Side by side** (old left / new right, per-side line numbers) and
  **Inline** (unified); the choice is remembered.

## Git workflow

- **Clone isolation** (`--clone`) — the agent works on a private in-container
  clone; your host workspace is mounted read-only. A `sandbox-<name>` remote links
  the two.
- **Git context at a glance** — each sandbox header shows folder, branch,
  uncommitted-change count, and a link to the GitHub remote. Click the workspace
  folder (folder icon opens on hover) to open it in Finder.
- **Bring the work home** — *Feature changes ▸ Merge changes to your repo*:
  fetches the sandbox branch into your host repo, then opens a PR (if the repo has
  a remote) or merges into your current branch; optionally delete the sandbox
  after.

## Kits — compose & share agent setups

- **Visual composer** — build a kit from a form (no YAML): Remote MCPs, network
  policies, env vars, agent memory (attach PDFs/MD/txt), and commands.
- **Remote-MCP catalog** — 50+ hosted MCP servers with search/filter, or add a
  custom MCP by URL.
- **Mixin vs Sandbox kits** — stack mixin kits, or define a full agent with a
  sandbox kit.
- **Add anywhere** — attach at creation or inject into a running sandbox.
- **Share via any OCI registry** — push to Docker Hub / ghcr; pull by reference.

## Workspaces & runtime mounts

The Info panel's **Workspaces** section lists the sandbox's workspaces and lets
you **mount a host directory into a running sandbox live** (via `sbx mount`):
pick a host folder, an optional container path, and read-only — it appears
immediately (no restart). Unmount from the same list. den tracks the mounts it
created (sbx has no list command).

## Network policy

See which domains a sandbox can reach, add allow rules from the UI, and get a
warning when an org governance profile overrides local rules.

## Secrets

Manage `sbx` service credentials (Anthropic, OpenAI, Google, GitHub, …) with OAuth
where supported, or source a value from **1Password** via an `op://Vault/Item/field`
reference (resolved through the `op` CLI, so the real value never lives in den).
Each secret has a **scope** — global (all sandboxes) or a single sandbox — and the
scope can be changed when editing, which moves the secret (written to the new
scope, removed from the old). The Provider and Scope pickers are custom dropdowns
that show provider icons.

## Templates & Runtime

- List/launch/delete template images.
- Check the `sbx` version, view release notes, and update in place; see runtime
  sign-in status and re-authenticate in a click.
- **Diagnostics** — run `sbx diagnose` (colored output); **Copy JSON** and
  **For bug report** export the report; **Upload** sends a diagnostics bundle to
  Docker and prints a shareable id.
- **Restart daemon** — stop and restart the `sbx` daemon (`sbx daemon stop` then
  `sbx daemon start -d`) from the UI; useful for `ECONNREFUSED`/`ECONNRESET`
  connection errors.

## Logs

Live-tail the `sbx` daemon logs, or read a specific sandbox's kit-startup log.

## Theming

Light / dark / system, custom accent colors that retint the whole UI, and a
terminal theme that can follow the app mode or be set independently. A
**Density** control (Default / Comfortable / Custom) scales the whole interface
up or down at once (a window zoom factor), so you can size the UI without
picking per-element font sizes. **Custom** takes your own zoom multiplier
(0.5–2.0), letting you go smaller than Default or larger than Comfortable.

## Stay awake

Optionally prevent system sleep while any sandbox is running (Settings), so long
agent runs aren't interrupted.
