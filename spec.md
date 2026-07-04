# den — Architecture & Decisions

A running record of the architectural decisions behind **den**, the desktop GUI for
[Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) (the `sbx` CLI). This is the
"why", not the "what" — pair it with the code and [`README.md`](README.md).

> Naming: the product is the lowercase wordmark **den** ("Developer Ephemeral Node").
> The internal IPC namespace and preload bridge are still `minipit` for historical
> reasons (see *Deferred* in [`todo.md`](todo.md)); treat `minipit` and `den` as the
> same thing in code.

---

## 1. Shape of the app

**Electron, three processes.** `src/main` (Node/Electron main), `src/preload`
(contextBridge), `src/renderer` (React app). Bundled with **electron-vite**; packaged
with **electron-builder** (`build:mac` / `build:win`).

**den is a GUI over a CLI, not a reimplementation.** Every capability is `sbx …` (or
`git …`, `op …`, `brew …`) shelled out from the main process. den owns *presentation,
orchestration, and durable preferences* — never sandbox state that `sbx` already owns.
Consequence: `sbx ls --json` is the source of truth for the sandbox list (name, id,
agent, status, workspaces, ports); den does not cache or invent sandbox fields it can't
get from the CLI (e.g. model/cost/duration aren't shown because `sbx` doesn't expose
them).

**TypeScript strict, everywhere.** `noUnusedLocals` / `noUnusedParameters` are on, split
into `tsconfig.node.json` (main/preload) and `tsconfig.web.json` (renderer). `npm run
typecheck` gates both. There is no runtime test suite — **typecheck + `npm run build`
are the verification bar** (see §9).

---

## 2. IPC & the preload bridge

**One namespaced channel surface.** The renderer never touches Node/Electron directly;
it calls `window.minipit.*`, which the preload maps to `ipcRenderer.invoke('minipit:*')`
against `ipcMain.handle('minipit:*')`. Event streams (PTY output, sandbox updates,
policy blocks, agent activity) use `ipcRenderer.on('minipit:*')` with unsubscribe
functions returned to React effects.

**All channel names are static string literals.** No `'minipit:' + dynamic` construction
in handlers — this keeps the surface greppable and makes a future rename mechanical.

**Security hardening in main** (from the Electron threat model):
- Content-Security-Policy set on the renderer.
- External-URL scheme guard: only vetted schemes open externally; navigation is blocked
  otherwise.
- OAuth `state` is checked on the callback to prevent CSRF on the sign-in flow.

---

## 3. State & persistence

**Zustand is the single renderer store** (`src/renderer/src/store.ts`). Components
subscribe to slices; actions mutate and, where the data is durable, sync to disk.

**Two-tier persistence for preferences — the key decision.** localStorage alone was
losing data because the electron-vite **dev server origin/port changes**, so
`localStorage` (scoped to origin) silently reset between runs. Fix:

- **localStorage = instant-paint cache.** Read synchronously on mount so the UI never
  flashes defaults. Keys are prefixed `minipit:*` (e.g. `minipit:sandboxOrder`,
  `minipit:sandboxColors`, `minipit:showGroups`, `minipit:themePref`).
- **electron-store = source of truth.** Durable across origins/ports/upgrades. Synced via
  a config-sync IPC pair (`*-config-sync` / `*-config-set`) over a `CFG_KEYS` allowlist
  (currently `sandboxIcons`, `sandboxColors`, `sandboxGroups`). Group definitions live
  under `groups`; per-sandbox clone isolation under `sandboxIsolation`.

Rule of thumb: **anything the user would be annoyed to lose on restart goes through
electron-store**, with localStorage as the cache in front of it.

---

## 4. Sandboxes, workspaces, and Git isolation

**`--clone` is the safe default for real repos.** `sbx` does **not** support git
worktrees, so the isolation model is:
- The host workspace is mounted **read-only** into the container.
- The agent works on a **private in-container clone**, so it can never mutate your working
  tree directly.
- A `sandbox-<name>` git remote links the two for fetch-back.

**Git context is condensed into one place.** The sandbox detail subheader shows
`folder · branch · N changed · GitHub remote` — the single home for git info (we removed
the separate git footer bar to avoid duplication). Live changes come from `git status
--porcelain` run *inside* the sandbox (works for both mounted and cloned workspaces),
surfaced as the **Changes** tab with inline badges.

**"Bring work home" is fetch-then-choose, never silent.** From a sandbox's *Feature
changes* menu, den fetches the sandbox branch into the host repo, then:
- if the repo has a remote → offer **open a PR** (push + create PR), else
- offer **merge** into the current branch.

Optionally *merge, then delete*. Every landing step is behind a confirm — den never
writes to your repo without asking.

---

## 5. Groups (replaced Projects)

**Groups are lightweight labels, not folders.** The old "Projects" model tied grouping to
a workspace folder + color + icon; it was replaced wholesale by **named groups**:
- A group has **only a name** (rename-able). No folder, color, or icon.
- A sandbox belongs to **at most one** group.
- Group actions are exactly: **start-all**, **stop-all**, **delete** (with an option to
  also delete the contained sandboxes).
- **Customization moved to the sandbox**: each sandbox carries its own **color + icon**
  (so you can tell them apart even when stopped/greyed).

**Rendering order:** named groups first (in their own manual order), then an "Ungrouped"
section (only labeled when named groups exist). Manual order is stored in `sandboxOrder`
/ the `groups` array; sorting by Name/Status is an explicit opt-in — **Manual is the
default** so hand-arranged order survives.

**Drag & drop is inferred from context, not modifier keys.** An earlier design gated
reorder on holding **Shift**; it was undiscoverable and unreliable, so it was removed.
The current model:
- Drag a sandbox **within its own group** → **reorder** (an insertion line marks the gap
  above/below the row).
- Drag a sandbox **onto a different group** → **move** (the target group illuminates).
- Drag a **group header** onto another → **reorder groups** (insertion line in the gap).

The dragged item's source group can't be read during `dragover` (the DnD spec forbids
reading `dataTransfer` values then — only types), so the source group is stashed in a
module-level `dragSbx` variable on `dragstart` and compared during `dragover`. Any drag
switches the sort to Manual.

---

## 6. Kits

**Kits are first-class `sbx` artifacts** that layer MCPs, network policy, env vars, agent
memory, and startup commands onto an agent. Decisions:
- **Visual composer over YAML.** Kits are built from a form; users don't hand-edit
  `spec.yaml`.
- **Mixin vs Sandbox kits.** Mixins stack onto an agent; a sandbox kit defines a full
  agent from a base image.
- **Remote-MCP catalog** (`src/renderer/src/lib/mcpCatalog.ts`) — a curated list with
  icons/search; each pick becomes a one-click allow-rule + registration. Custom MCPs by
  URL are supported.
- **Capability display is positional.** In the full kit list, capabilities render as
  **fixed grid columns** (Remote MCP · Policies · Env vars · Commands · Memory) so types
  line up table-style across rows even when a kit lacks some. The compact variant (New
  Sandbox modal / dropdowns) packs only present capabilities.
- **Sharing is OCI, not bespoke.** Push/pull via any registry (`sbx kit push`), reference
  prefilled from the logged-in Docker account.
- **Community gallery** is browsed live from `docker/sbx-kits-contrib` on GitHub (one tree
  API call + raw `spec.yaml` fetches) and imported via a sparse shallow clone. Kits are
  consumed by `sbx` as `--kit "git+<repo>#dir=<name>"`.

---

## 7. Secrets

**Credentials are managed through `sbx secret`, with OAuth where the provider supports
it.** The notable addition is **1Password sourcing**: instead of pasting a raw value, a
user provides an `op://Vault/Item/field` reference, which the main process resolves with
the `op` CLI (`op read`) — mirroring `op read "op://…" | sbx secret set`. The real secret
value **never lives in den's storage**; only the reference is retained where relevant, and
the resolved value is handed straight to `sbx`. The 1Password option is gated on the `op`
CLI being installed.

---

## 8. UI system

- **Terminals**: `xterm.js` over a real PTY (`node-pty`) — full agent TUIs (e.g. Claude
  Code) and an interactive shell. `node-pty` is a native module (`npm run rebuild` /
  `postinstall` handle Electron ABI).
- **Theming**: light / dark / **system**; a custom **accent color retints the whole UI**
  (palette generation via `@basiclines/rampa-sdk`). The default terminal theme is
  **adaptive** — it follows the app's light/dark mode — or can be pinned independently.
- **Icons**: `lucide-react` for UI, `@lobehub/icons` for AI/provider marks. Per-sandbox
  icons are picked from a curated set with a full Lucide browse fallback.
- **Primitives**: Radix (`dialog`, `dropdown-menu`, `select`, `tabs`, `tooltip`, `switch`,
  `scroll-area`) for accessible behavior; styling is hand-authored CSS in
  `src/renderer/src/styles/main.css` (design tokens as CSS variables, not a component
  library).
- **Fixed popovers via portals**: hover popovers (e.g. kit capabilities) render into
  `document.body` so they escape ancestor `overflow:hidden` / `backdrop-filter`
  containing-block traps.
- **Keyboard-first**: ⌘N new · ⌘S stop · ⌘R restart · ⌘L logs · ⌘F files · ⌘I info ·
  ⌘X delete. Cmd (not Ctrl) so terminal control keys are untouched; shortcuts are
  suppressed while typing in inputs.

**Anti-pattern we removed:** decorative left-color stripes on banners/alerts/toasts
("AI slop"). Variants now use a full tinted border + background instead.

---

## 9. Power management

While any sandbox is running, den prevents system sleep via Electron's
`powerSaveBlocker` (`prevent-app-suspension`), so long agent runs aren't interrupted.
Gated by the **Keep computer awake** setting (default on); `updatePowerBlocker` is driven
by the running-sandbox count.

---

## 10. Verification constraints (important for contributors)

The development environment has **no Docker and no GUI**. That means:
- Only `npm run typecheck` and `npm run build` can verify changes here.
- Anything that needs a live runtime — sandbox create/run, the `--clone` git workflow,
  drag-and-drop, tray/menu behavior — must be confirmed by **running the packaged/dev app
  manually**.
- **Main/preload changes require a full app relaunch** (renderer hot-reloads; main does
  not). A stale main process has caused several "it's broken" red herrings — always
  relaunch before diagnosing main-side behavior.

---

## Repository layout

```
src/
  main/      # Electron main: sbx/git/op wrappers, PTYs, IPC handlers, tray, windows, power
  preload/   # contextBridge — the window.minipit.* API surface
  renderer/  # React app
    src/
      components/   # UI (Sidebar, SandboxDetail, KitsPage, KitCaps, modals, …)
      lib/          # iconSet, mcpCatalog, kitSpec, termThemes, accent, sound
      store.ts      # Zustand store (state + durable-sync actions)
      styles/       # main.css (tokens + all component styles)
docs/          # proposals & vendored reference (sandboxes, MCP, model-runner)
landing/       # marketing site + app screenshots
```
