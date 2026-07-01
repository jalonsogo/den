# Changelog

All notable changes to **den** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/jalonsogo/den/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/jalonsogo/den/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jalonsogo/den/releases/tag/v0.1.0
