# Changelog

All notable changes to **den** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **The kit composer covers the whole spec.** New capability blocks for **Setup** (install commands that run once at create, startup commands that run on every start, each with an "agent vs root" and a "background" flag), **Files** (static files packed with the kit, targeted at `files/home/` → `/home/agent/` or `files/workspace/` → the workspace, with an editable destination path), **Environment** (name/value pairs), **Credential** (writes the four-block proxy-injection pattern — `network.serviceDomains` + `serviceAuth`, `credentials.sources`, `environment.proxyManaged` — so the secret stays on the host and the container only sees `proxy-managed`), and **Agent instructions** (with the profile filename the kit owns, `sandbox.aiFilename`). The kit list gains a Credentials column, and its Setup column now counts startup commands too.
- Editing a kit no longer strips the parts the form doesn't show: a command's `description`, `commands.initFiles` and `network.deniedDomains` are parsed and re-emitted, and the two spec-authored ones are listed read-only so they aren't invisible. Files already packed into a kit are listed when you re-open it, and can be deleted from there.

- **Import a kit from a Git repository, from whatever URL you have.** The repo importer now takes a bare repo URL, sbx's `git+https://…#ref=<rev>&dir=<subdir>` form, an scp-style or `ssh://` remote (using your local SSH agent), or the browser URL of a branch or subfolder on GitHub, GitLab, Bitbucket, Gitea or Codeberg — `https://github.com/owner/repo/tree/v1.2/kits/ruff-lint` resolves to the same clone as the canonical form. `#ref=` is now honoured (it was parsed and then ignored, so a pinned tag silently imported the default branch): den shallow-clones that branch or tag, falling back to fetching a single commit when the revision is a sha. When the repo holds **several kits**, den lists them — name, kind, subfolder, description — and asks which to import, instead of failing with "No spec.yaml found at the repo root". A subfolder that holds no kit falls back to scanning the repo rather than dead-ending on the typo.
- A **Git URL pasted into the OCI-reference field** is cloned instead of pulled. `sbx kit pull` can't fetch a repo, and its refusal surfaces as a `kit.allowedSources` error that names an allowlist the publisher is often already on — so it read as a permissions problem rather than a wrong-kind-of-reference one.
- **sbx v0.38 is now the minimum runtime**, and den speaks only its CLI dialect: `sbx daemon restart` (replacing the stop-then-start pair, which raced when the daemon was slow to exit), and secrets scoped by `--sandbox <name>` with global as the default — `-g` and the bare positional sandbox name are both deprecated in v0.38. An app-wide banner appears on an older runtime and links to Settings → Runtime, rather than letting the mismatch surface one opaque "unknown flag" at a time across unrelated features.
- **Kits are authored as spec v2.** The composer writes `schemaVersion: "2"`: network rules move under `permissions.network.allow`/`deny`, `commands` becomes `setup` (with `initFiles` → `files`), `sandbox.entrypoint` flattens to a bare list, and `agentContext` + `sandbox.aiFilename` merge into `agentInstructions`. The biggest simplification is credentials — v1's four coordinated blocks (`network.serviceDomains`, `network.serviceAuth`, `credentials.sources`, `environment.proxyManaged`) collapse into one record per service. Existing v1 kits keep loading: both shapes are parsed into the same structure and the editor never knows which it read.
- **A Code view in the kit composer**, beside the existing Summary — the `spec.yaml` the form will write, updating as you edit. Read-only by design: it's generated from the form on every keystroke, so an edit made there would be overwritten by the next one; hand-editing a spec is still the kit row's **Edit code** panel. This matters more now that Edit opens the composer directly and no longer routes through that panel.
- **Edit a kit in one click.** Each kit row gets an **Edit** button that opens the composer — the same editor **New kit** opens, pre-filled. Reaching it used to mean expanding the row and then clicking Edit in the panel footer. Clicking the row still opens the read-only Summary/Code panel exactly as before.
- **Vercel in the remote-MCP catalog.** `https://mcp.vercel.com` (Streamable HTTP, OAuth) joins the Cloud group in the kit composer's Remote MCP picker, so a mixin kit can be built for it in one tick. Its tools cover projects, deployments, deployment logs, Web Analytics and Vercel's docs.
- **A catalog entry can declare the hosts its OAuth handshake needs** (`authHosts`), and they become allow rules alongside the server's own. Under the MCP Authorization spec the client — the agent, inside the sandbox — performs discovery, dynamic client registration and the token exchange itself, and a provider can put those somewhere other than the MCP endpoint. Allowing only the endpoint leaves a flow that half-works: the browser authorization succeeds, the token exchange is then blocked, and it reads as "it just doesn't connect". Vercel is the first entry to need it — `vercel.com` serves the authorization-server metadata and JWKS, `api.vercel.com` the client registration, token exchange/refresh, revoke and userinfo — so a Vercel mixin now allows all three hosts.
- **Debug traces for dropped agent API connections.** When an agent reports `API ERROR: Connection closed mid-response` or an `ECONNRESET`, den now records what the host could attest to at that moment: how long the request had been running (`streamMs`), how long the stream had been quiet, whether this Mac had just woken or changed network, and whether the sbx daemon answered a probe taken right after. den can't see the connection itself — it's opened inside the container, through the sandbox proxy — but those fields are what separate a connection-lifetime cap (`streamMs` repeating across traces) from a whole-path reset (a wake or a Wi-Fi hop moments earlier), which is otherwise guesswork on an intermittent failure. One JSON object per line under `<userData>/traces/`, rolled at 1 MB, with a count and a reveal button in Settings → Runtime. New [`docs/errors.md`](docs/errors.md) explains how to read one.

### Changed
- **Blocked network requests now live in the Network policy section** (unfolded) instead of a red slab pinned above it, and one host is one row: the same domain is denied on every retry, so six log lines for two domains used to read as six problems. Each row leads with the host, replaces the engine's `no applicable policies for op=(action:net:connect:tcp, resource=…)` with what it means ("No allow rule — default deny"), and says how long ago and how many times. A long hostname used to overflow its box and paint across the **Allow** button, which is what made the button look — and in places behave — unclickable.
- **Allowing a host says so, then gets out of the way.** The row confirms in place ("Allowed"), fades out and leaves the list, since a handled block sitting among the unhandled ones is just noise; a failure keeps the row with a **Retry**. Only the row you clicked changes state — one allow used to disable every other Allow button on the panel.
- **A policy change is inert until the sandbox restarts, so the panel now says so where you can't miss it.** Allowing a host, applying rules, removing one, or switching preset docks a **Restart to apply** bar at the bottom of the Network panel with the list of pending changes and the button that applies them; it survives scrolling, outlives the toast that started it (allowing from a toast raises the same bar), and clears itself the moment the sandbox next starts — from anywhere in den, not just from that button. Restarting from the bar confirms with **New policy active**. The old feedback was a one-line banner at the far bottom of the section, usually below the fold.

### Fixed
- **The API-traces Reveal button did nothing** in the common "None recorded" case. The traces folder is created lazily on the first write, so with no traces neither the file nor the folder existed — and `shell.openPath` on a missing path fails silently. Reveal now creates the folder so it always shows where traces will appear, reports a failure instead of swallowing it, and reads **Show folder** while empty.
- **Changed files lost the first letter of their name** — `README.md` listed as `EADME.md`, which then failed to open, preview, or be used by the agent, because the corrupted name was the stored path and not just a label. `git status --porcelain` writes two status columns then a space, and a worktree-only change leaves the first column blank (`" M README.md"`); den's `sbx()` helper returns `stdout.trim()`, which ate that leading space on the first line, and the parser's fixed `slice(3)` then took a character of the filename with it. Only the first line could be hit, and only when it began with a space — which is exactly where such an entry lands, since git lists tracked changes before untracked ones. The status call now asks for untrimmed output and matches the `XY path` shape explicitly, so an unexpected line is skipped rather than silently mangled; it also passes `core.quotePath=false`, since a C-quoted non-ASCII name (`"caf\303\251.md"`) was unopenable for the same reason.
- **A workspace mounted somewhere other than its host path spammed `list-files` errors.** When den couldn't reach a container to resolve the real workspace root, it fell back to the *unverified* host path — a listing that fails by construction, once per mount, each one an `Error occurred in handler for 'minipit:list-files'` stack in the log. The resolver now returns nothing when it can't verify, and the Files panel retries briefly (a sandbox often reports `running` a moment before `exec` works) before letting a listing through to surface the real error.
- **Switching density to Comfortable clipped the bottom row of the terminal** — the agent's status line came out sliced in half, and stayed that way until the window was resized. Density zooms the window, which changes `devicePixelRatio`, and xterm derives a row's height from it (`ceil(charHeight × dpr)` device px): at a fractional dpr each row grows a fraction of a pixel, ~5px across a full screen. xterm re-measures on that event but never changes the row count — that's the fit addon's job, and the only thing re-running it was the container's own resize, which lands *before* xterm re-measures and so fits against the outgoing cell height. den now refits on a dpr change (which also covers dragging the window onto a differently-scaled display) and, after every fit, measures what was actually laid out and hands back a row if the grid still overflows its box. The app shell is sized off `100%` rather than `100vh` for the same reason: Chromium can resolve `vh` a rounded pixel taller than the viewport really is at fractional zoom.
- The **Base agent** dropdown in the kit editor rendered as a column of little pills: its rows are `<button>`s and the stylesheet never reset the browser's own button border, background and shrink-to-fit width. It also stayed open on an outside click, unlike the same dropdown in New Sandbox.
- Kit specs are read with a real (small) YAML reader instead of line-matching, so nested blocks — `serviceDomains`, `serviceAuth`, `credentials.sources`, argv-form startup commands, quoted keys — survive a round-trip through the editor. Startup commands are no longer displayed as install commands.
- Attaching kit files no longer filters the picker down to documents, so dotfiles and helper scripts can be selected; renderer-supplied kit paths are confined to the kits folder before any write.

## [0.8.0] - 2026-07-30

### Added
- **SSH access to sandboxes (sbx v0.37).** Settings → Runtime can run `sbx setup ssh`, which makes every sandbox reachable as `<name>.sbx`. New per-sandbox actions **Connect with VS Code** (or Cursor / Windsurf / VSCodium) and **Copy SSH Command**; the editor attaches to the sandbox over SSH and opens the workspace at the path the sandbox mounts it on. den also warns when `~/.ssh/config` has more than one `Host *.sbx` block, because ssh takes the first value it finds and a stale block silently overrides the current one.
- **Shared agent skills (sbx v0.37).** New Settings → Skills tab: previews what `sbx skills import` would copy from the host's agent skill folders, shows what the shared store already holds, flags which imports replace an existing skill, and lists what sbx skipped (symlinked skill folders are silently excluded). Import always previews with `--dry-run` first. New sandboxes can opt out of the store with a **Shared agent skills** toggle (`--no-share-skills`).
- **Publish ports at creation.** The New Sandbox modal takes a port list, passed as `-p` (sbx v0.37 accepts it on `create`). Later changes still go through the Network panel.
- **`system` proxy preset.** One tap sets `DOCKER_SANDBOXES_PROXY=system`, routing sandbox egress through this Mac's own proxy settings, including a PAC auto-config URL.
- Governance-policy denials now show the organization's configured support message, so a block says who to contact.
- **Runtime in the menu bar.** Both the tray icon and a new top-level **Runtime** menu carry the installed sbx version, **Restart daemon** and a jump to the **Log viewer** — reachable without opening den first. The app menu adds the SSH access state (read fresh each time the menu is built), **Set Up / Re-run SSH**, and **Copy SSH Config Path**, and repeats the duplicate-`Host *.sbx` warning there, because a stale block breaks connections silently and the symptom points nowhere useful.
- **Connect in Terminal** runs `ssh <name>.sbx` for you instead of leaving you to paste it. Terminals with a command-taking CLI are driven directly (Ghostty, WezTerm, kitty, Alacritty); the rest get a short-lived executable script handed to `open`, so **System default** means whatever your Mac already opens shell scripts with rather than a hardcoded Terminal.app. Picked in Settings → General alongside the editor.
- **Settings are searchable from the command palette.** 21 entries, each deep-linking to its tab and expanding the section it lives in, so `ssh`, `proxy`, `vscode` or `1password` finds the setting without knowing which tab holds it. Keywords include the underlying names you'd meet in a log — `DOCKER_SANDBOXES_PROXY`, `no_proxy`, `op://`, `virtiofs`, `sandboxd`.
- **Editor preference** in Settings → General → Files & editors. "Connect with…" uses your chosen editor (VS Code, Cursor, Windsurf, VSCodium) instead of listing a menu entry per IDE.
- **Connect an app** — a sandbox's menu can now point **Claude Desktop** or the **ChatGPT** app at it over SSH, completing the set of integrations Docker documents. Neither app has a `--remote` equivalent, so den does the automatable half (offers to run `sbx setup ssh` if the managed config is missing, puts `<name>.sbx` on the clipboard, launches the app) and then lists the in-app steps. Connecting ChatGPT to a sandbox that wasn't created from the `codex` template warns first, since its remote server needs that CLI; Claude Desktop repeats Docker's caveat that the connection puts your Anthropic credentials inside the sandbox.

### Changed
- A failed `sbx setup ssh` now reports the actual error instead of always claiming the config couldn't be written — the usual cause is an IPC failure, not the file. An unregistered handler additionally says to restart den.
- The toolbar's right-panel button always reopens the **Files** browser, instead of whichever panel happened to be showing last.
- **The Sandboxes menu is per-sandbox.** "Stop Sandbox", "Open in Finder" and "Logs" used to act on whichever sandbox was open without saying which one that was; each sandbox now has its own submenu, and `⌘.` / `⇧⌘F` / `⌘L` sit on the open sandbox's items with a ✓ beside it, so a shortcut is visibly attached to what it affects. Sandboxes are ordered by what wants attention — working, waiting, running, transitional, stopped — with a coloured dot per state (green working, yellow waiting, a faint outline for anything not up) and are capped at seven, ending in a **View All *N* Sandboxes…** link rather than the old disabled "N more…".
- **A lighter sandbox context menu**, 14 items down to 11. Save Snapshot and Logs move up beside Start/Restart, and Copy Path, Copy SSH Command and the Terminal theme submenu are gone — the first two duplicated the action right next to them, and terminal theme is a preference rather than a per-sandbox action (it lives in Settings → General → Appearance, and is searchable).
- The command palette's selected row is now unmistakable. It was tinted with `--bg-subtle` over `--bg` — about a 2% step in the light themes — so the ↵ glyph was carrying the whole job.

### Fixed
- **A sandbox that refused to start now says why.** `sbx run` prints its failure and exits, but a launch that never reaches "running" has its terminal replaced by the stopped placeholder — so the reason (most often a workspace folder moved or deleted on the host) only reached the log file, and the sandbox just appeared not to start. The failure is now shown as a banner on the sandbox, and as a toast when you're looking elsewhere; for a missing workspace folder it names the path and offers to remove the sandbox.
- **The Files panel no longer logs a failed listing on every open.** It listed the stored *host* workspace path before resolving where that folder actually lives inside the container, which for a moved or clone-mode workspace is a guaranteed failure, followed by a retry cycle. It now waits for the resolved root, and a missing directory reports "no such directory in sandbox: &lt;path&gt;" instead of an opaque "exited with 1 and no output".
- **Policy log entries never appeared.** den looked for `entries`/`log`/`events` in `sbx policy log --json`, but sbx emits `blocked_hosts`/`allowed_hosts` and names the sandbox in `vm_name`, so every fetch parsed to zero rows. It also passed a `--sandbox` flag the command doesn't accept, which failed the call outright — two faults that masked each other. Only blocks scraped from terminal output were reaching the UI.
- **"Test access" could report a false denial.** The decision was read by regex over the whole output, so an *allowed* host whose name contains "blocked" or "deny" parsed as denied. It now reads the explicit `allowed` boolean from `--json`, falling back to the decision line only.
- Linux/ARM64 users are no longer told there's no build for their platform and to stay on their current version — sbx v0.37 ships `linux-arm64` again.
- **VS Code connected to a sandbox and then reconnected forever.** macOS's per-user temporary directory is 49 characters, and Remote-SSH appends a 64-character socket name to it — past the 104-byte limit on unix socket paths. Its askpass server therefore couldn't bind, couldn't answer its own shutdown request, and the resulting five-second timeout read as a dropped connection. den now hands the editor a short temporary directory, which fits. Only a cold start can be fixed this way — asking a running editor to open a remote window is a message to a process that keeps the environment it launched with — so if the editor is already open, den says so once rather than letting it loop.
- **A stale bridge now says to relaunch den.** The "Connect with…", "Connect in Terminal", "Connect an app" and "Set Up SSH Access" actions reported an out-of-date preload bundle as its raw JS error (`window.minipit?.openRemoteApp is not a function`), which reads like a broken feature rather than "quit and reopen". Both stale-bundle cases — preload (only re-evaluated when the window is created, so a renderer reload never picks it up) and main (`no handler registered`) — now give that instruction, while genuine failures still pass through verbatim.

## [0.7.1] - 2026-07-14

### Fixed
- **Docker sign-in state detection with sbx v0.35+.** The session moved from the Docker credential store to the macOS keychain, so den always showed "not signed in" even after a successful login (and sign-out appeared to do nothing). den now reads the sbx keychain session, falling back to the credential store for plain `docker login`.
- Fewer macOS keychain password prompts: the account is resolved once per app session and cached (invalidated on sign-in/out) instead of re-read by every component.
- The toolbar account refreshes immediately after signing in or out from Settings → Runtime.

### Changed
- The account menu shows the real signed-in email, and long organization lists scroll (5 rows visible) instead of growing unbounded.

## [0.7.0] - 2026-07-14

### Added
- **Command palette** for keyboard-driven navigation and actions.
- Runtime **proxy** settings and daemon controls in Settings → Runtime.
- **Secrets import** and info-panel mounts.
- Account menu with Docker Hub profile (email, gravatar) and a **namespace switcher** (personal + organizations) that prefills push references on the Kits and Templates pages.

## [0.6.2] - 2026-07-10

### Added
- **UI density** control, per-file commit selection, and .gitignore actions in the Changes panel.

### Changed
- Full-interface **color themes** replace the accent-color picker.
- Removed the landing page.

### Fixed
- CI no longer splits release assets across duplicate draft releases.

## [0.6.1] - 2026-07-08

### Added
- **Changes review surface and PR flow**, runtime mounts, and macOS code signing.
- Internal **file previewer** with syntax highlighting, markdown, and diff views.
- `sbx diagnose` in Runtime settings with coloured output, plus a **Restart daemon** button, runtime settings, and `sbx reset`.
- **Ports panel** publish/unpublish and complete network-policy CRUD (deny / rm / set-default).
- Kit **validate** and **export-as-zip** actions.
- Scope-aware **Secrets** tab (global + per-sandbox).

### Fixed
- "Reveal in Finder" silently doing nothing.
- Agent-printed URLs are clickable in the terminal.
- Files panel listing on BusyBox sandboxes, and NaN rows in the Ports panel.
- macOS signing identity (drop the "Developer ID Application:" prefix).

## [0.6.0] - 2026-07-04

### Added
- **Named sandbox groups replace projects**: group sandboxes in the sidebar and dashboard, drag onto a group to move (or to Ungrouped to remove), drag to reorder, and an optional Group field in New Sandbox.
- Per-sandbox **color + icon customization**.
- Command shortcuts with hints in the context menu: ⌘N new · ⌘S stop · ⌘R restart · ⌘X delete · ⌘L logs · ⌘F files · ⌘I info.
- **Files | Changes** tabs with a subheader changes dropdown.

### Changed
- Removed the Projects page and data layer — groups replace them; the dashboard groups sandboxes by group.
- Filter rethink: Show/Hide groups, manual ordering, and drag-to-reorder without holding Shift.
- Header/subheader declutter with a segmented Stop | Restart control; unified dropdown sizing.

### Fixed
- PromptModal stuck on "Working…" when reused.
- Sandbox ⋮ menu opening the group menu (stale group id).

## [0.5.5] - 2026-07-03

### Added
- Feature workflow on `--clone` (sbx doesn't support git worktrees): **New feature…** on a project starts an isolated clone-mode sandbox, and **Bring work to host…** fetches its commits into a `sandbox/<name>` review branch, then offers to open a PR (via `gh`) or merge — review-first, never auto-merging your working branch, with conflict-safe aborts.
- **Keep computer awake** setting (Settings → App, default on): holds a `powerSaveBlocker` while any sandbox is running so long agent runs aren't interrupted by system sleep.

### Changed
- Dashboard redesign: a compact overview strip (box icon + total + running/stopped pills, with Projects/Disk as chips) replaces the three stat cards, so the sandbox list is the focus. Added a page title.

### Fixed
- Icon browse loads more on scroll instead of stopping at a hard 300-icon cap.
- InfoPanel Workspaces rows stack the label above the path, so long paths wrap cleanly instead of cramming beside the label.

## [0.5.0] - 2026-07-03

### Added
- Per-sandbox **custom icons** (curated set + full Lucide browse), or the two-letter initials — set from the detail avatar or right-click → Customize.
- **1Password sourcing** for secrets: a "Load from 1Password" switch resolves an `op://` reference on the host via `op read`.
- Shared-working-tree **safety**: den records each sandbox's isolation, warns when multiple sandboxes mount one folder directly, and guards New Sandbox creation into an already-used folder.

### Changed
- **Removed the Home page** — the Sandboxes view is now the dashboard and default landing, listing all sandboxes grouped by project (running first, then stopped).
- **Removed the sidebar Projects section**; "Add project" moves to the Sandboxes header, and project group headers gain a hover + and a right-click menu.
- Project **Customize** promoted to the top of the menu and is now color-only.
- The sandbox detail view shows the workspace **git branch** below the status.

### Fixed
- Per-project appearance (color/name/icon) persists in the file-based store instead of `localStorage`, surviving dev-server port changes; existing config is migrated on first launch.
- Stopped sandboxes keep their project color (no longer fully grayscaled).
- The New Sandbox folder picker can create a new folder on Windows/Linux.

## [0.4.0] - 2026-07-03

### Added
- Community kit gallery: a "Browse contrib" tab on the Kits pages lists kits from [docker/sbx-kits-contrib](https://github.com/docker/sbx-kits-contrib), fetched live from GitHub. Import one to add it to your local library (shallow git clone + `sbx kit pack`). Agent kits appear on the Sandbox Kits page, mixin kits on the Mixin Kits page.

### Changed
- The Kits pages move their Your kits / Browse contrib tabs into a dedicated sub-toolbar under the page title, mirroring the sandbox `Agent | Shell` bar.
- The collapsed sidebar now shows a single Projects icon when the Projects group is collapsed, instead of always fanning out every project avatar.

### Fixed
- Per-project appearance (color, icon, display name) is now persisted in the file-based store instead of the renderer's `localStorage`, so it survives dev-server origin changes (a shifting port no longer appears to wipe project config). Existing localStorage config is migrated on first launch.
- The New Sandbox folder picker can create a new workspace folder on Windows and Linux too (`createDirectory`), matching macOS and the project picker.

## [0.3.1] - 2026-07-02

### Fixed
- The sidebar uncommitted-change badge now clears after committing in the terminal — change counts are polled instead of only refreshed on file events.

## [0.3.0] - 2026-07-01

### Added
- Sidebar filtering and grouping: filter by status and agent from the sidebar filter/group dropdown, plus a resizable sidebar width.
- Collapsible sidebar sections, a full-icon picker, and hover flyouts.
- Background sandbox creation: new sandboxes show a "Creating…" row and flash in the sidebar when ready, with live creation output streamed into an in-modal terminal.
- Save Snapshot context-menu action, backed by a reusable prompt modal (Electron has no `window.prompt()`); the stop-sandbox prompt during snapshot is auto-confirmed.
- Offer to initialize a Git repo when `--clone` is used on a folder that has none.
- A three-dot menu on templates.

### Changed
- The New Sandbox modal no longer closes on outside click.
- "Add to sandbox" now uses the PackagePlus icon.

### Fixed
- Kit push no longer fails with `docker-credential-desktop not found`.
- Filter dropdown no longer clips or looks washed out, and stays on-screen (anchored left, clamped).
- The terminal-theme flyout flips left when it would overflow, and the sandbox header kebab is no longer clipped.

## [0.2.0] - 2026-07-01

### Added
- Drag and drop now accepts any file type (PDF, TXT, MD, CSV, Excel, Doc, PPT, …), not just images; multiple files are batched into a single write and the size cap is raised to 100 MB.
- A distinct, separately configurable "agent needs you" sound cue, driven by the Claude Code `Notification` hook.
- A Redraw control in the terminal toolbar to force a repaint on demand.
- Default kits: star mixin kits on the Kits page to auto-add them to every new sandbox (persisted).
- Inline capability preview in the New Sandbox modal via a shared `KitCaps` component, so you can see what a mixin adds before creating.
- "From template" now accepts OCI artifact refs, with a datalist autocompleting local templates alongside free-form refs.

### Changed
- Promoted the `--clone` (isolation) toggle in the New Sandbox modal out of Advanced to a primary control.
- Reworked the New Sandbox modal: base image moved into Advanced, workspace defaults to the last-used folder, project sessions pin to the project folder with `--clone` on, the command preview moved into its own accordion (persisted show/hide), and the modal width is now viewport-responsive.
- Kit panel now opens read-only; code becomes editable only after entering edit mode.

### Fixed
- Blank/white agent view on attach, tab switch, and sandbox switch — the terminal now forces a repaint once layout and fonts settle.
- "Working…" no longer sticks after a sandbox stops; agent activity is cleared on stop and delete, and a `SessionStart` hook resets stale `working` state left by an interrupted turn, CLI crash, or session resume.

## [0.1.1] - 2026-06-30

### Added
- Files panel updates and a static UI mockup.

### Changed
- Replaced the context-menu **Reset** action with **Restart**.
- Settings page padding tweaks.

### Fixed
- Hook injection and the event tail now retry past the sandbox-startup race, so freshly started sandboxes reliably get Claude Code hooks installed and agent-activity tracking works.
- Hook injection no longer fails under the sandbox's `dash` shell; the finalize chime autoplays.
- Blank xterm canvas fixed by refitting across frames.

## [0.1.0] - 2026-06-30

Initial release — the first automated, cross-platform build (macOS + Windows).

### Added
- GUI for Docker Sandboxes: dashboard, project-colored sandboxes, and a flat Sandboxes view reachable from Home and the sidebar.
- Hook-driven agent state and network-policy surfacing.
- Sandbox terminal with clipboard support (copy-on-select, paste).
- Kit sharing: push/pull OCI artifacts, remote kits, bundled icons.
- Theme submenu and den branding.
- GitHub Actions release pipeline that builds and publishes macOS (`.dmg`/`.zip`) and Windows (NSIS `.exe`) installers on each `v*` tag.

[Unreleased]: https://github.com/jalonsogo/den/compare/v0.7.1...HEAD
[0.7.1]: https://github.com/jalonsogo/den/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/jalonsogo/den/compare/v0.6.2...v0.7.0
[0.6.2]: https://github.com/jalonsogo/den/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/jalonsogo/den/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/jalonsogo/den/compare/v0.5.5...v0.6.0
[0.5.5]: https://github.com/jalonsogo/den/compare/v0.5.0...v0.5.5
[0.5.0]: https://github.com/jalonsogo/den/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/jalonsogo/den/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/jalonsogo/den/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/jalonsogo/den/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jalonsogo/den/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/jalonsogo/den/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jalonsogo/den/releases/tag/v0.1.0
