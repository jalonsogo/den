# Changelog

All notable changes to **den** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-07-03

### Added
- Per-sandbox **custom icons**: pick an icon (or keep the two-letter initials) from the sandbox detail-header avatar or right-click → Customize. Picker offers a curated set plus a full Lucide browse (search + scrollable grid). Stored durably per sandbox.
- **1Password sourcing for secrets** (merged from the 1password-secrets line): a "Load from 1Password" switch in the New Secret modal resolves an `op://` reference on the host via `op read`.
- Shared-working-tree safety: den records each sandbox's isolation (`--clone` vs direct mount), warns on a project when **multiple sandboxes mount the same folder directly**, and guards New Sandbox creation into an already-used folder with an "Enable isolation" nudge.

### Changed
- **Removed the Home page** — the Sandboxes view is now the dashboard and the default landing. The dashboard lists **all** sandboxes grouped by project (running first, then stopped).
- **Removed the sidebar Projects section**; "Add project" moves to the Sandboxes header, and project group headers gain a hover + (new sandbox) and a right-click project menu.
- Project group headers show as plain text; "Customize" is promoted to the top of the project menu and is now **color-only** (icon customization removed).
- The sandbox detail view shows the workspace **git branch** below the status (previously surfaced in the removed Projects section).
- The New Sandbox folder picker can create a new folder on Windows/Linux (`createDirectory`).

### Fixed
- Per-project appearance (color/name/icon) now persists in the file-based store instead of the renderer's `localStorage`, surviving dev-server origin/port changes. Existing config is migrated on first launch.
- Stopped sandboxes keep their project color (no longer fully grayscaled), so they stay distinguishable.

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

[Unreleased]: https://github.com/jalonsogo/den/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/jalonsogo/den/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/jalonsogo/den/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jalonsogo/den/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/jalonsogo/den/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jalonsogo/den/releases/tag/v0.1.0
