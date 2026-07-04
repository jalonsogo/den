# den — Internal Release Guide

How to hand a den build to internal testers, and what they need to know to run it.

> **Scope:** internal only. The build is **not code-signed or notarized** (see
> [*Notarization*](#notarization--external-distribution) below), so macOS Gatekeeper will
> warn on first launch. That's expected — the one-time workaround is here.

---

## What testers get

- A macOS Apple-Silicon build: `den-<version>-arm64.dmg` (or the `.zip`).
- Current version: **v0.6.0** (Groups, `--clone` Git bring-work-home, 1Password secrets,
  keep-awake, sidebar/kit UI polish).

## First launch (the Gatekeeper step)

Because the app isn't notarized, macOS quarantines it on download and refuses to open it
with "den can't be opened because Apple cannot check it for malicious software." Pick one:

**Option A — strip the quarantine flag (recommended, one command):**
```bash
xattr -dr com.apple.quarantine /Applications/den.app
```
Then open den normally. (Adjust the path if you didn't drag it to `/Applications`.)

**Option B — right-click → Open:**
Right-click (or Control-click) `den.app` → **Open** → **Open** in the dialog. First launch
only; macOS remembers the choice.

## Prerequisites for testers

- macOS on Apple Silicon.
- **Docker** running.
- The **`sbx`** CLI installed and signed in:
  ```bash
  brew install docker/tap/sbx
  sbx login
  ```
- Optional: the **`op`** (1Password) CLI, only if testing 1Password secret sourcing.

## Please report

These v0.6.0 areas are build-verified but need real-world eyes (see the "Verify at
runtime" list in [`todo.md`](todo.md)):

- Drag to **reorder** sandboxes within a group / **move** across groups; drag a group
  header to reorder groups.
- The **`--clone`** flow: create a clone sandbox, let the agent change files, then
  *Feature changes → Merge changes to your repo* (PR or merge). Flag anything that could
  touch your working tree unexpectedly.
- **1Password** `op://` references resolving via `sbx secret`.
- Collapsed sidebar rail, custom color/icon pickers.

File issues with: what you did, what you expected, what happened, and whether a **full app
relaunch** fixed it (main-process changes need a relaunch).

---

## Notarization / external distribution

Internal use does **not** require notarization — the steps above are enough. For **external**
distribution (no Gatekeeper friction on anyone's Mac) you need the paid Apple Developer
Program and a valid *Developer ID Application* certificate; there is **no free way to
notarize**. When that's ready, the signing/entitlements setup is tracked as a task in
[`todo.md`](todo.md), and the architecture context is in [`spec.md`](spec.md).

## Building a release locally

```bash
npm run build:mac     # bundles + packages dist/den-<version>-arm64.dmg (+ .zip)
```

Versioning follows semver via git tags (`vX.Y.Z`); bump `version` in `package.json` and tag
the release commit on `main`.
