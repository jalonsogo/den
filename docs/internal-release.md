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

### Linux Debian packages with Docker Buildx

Only Docker with the Buildx plugin is required on the host; Node, npm,
`build-essential`, and `dpkg` run in the build container.

```bash
# Both architectures
docker buildx bake

# A single architecture
docker buildx bake deb-amd64
docker buildx bake deb-arm64
```

Artifacts are exported to architecture-specific host directories so concurrent
BuildKit exporters cannot overwrite one another:

```text
dist/docker/amd64/den_<version>_amd64.deb
dist/docker/arm64/den_<version>_arm64.deb
```

Docker `linux/amd64` maps to electron-builder `x64` and Debian `amd64`;
`linux/arm64` remains `arm64` throughout. The build uses the Node version declared by `.nvmrc` (26.5.0), installs the exact
npm version declared by `packageManager` (12.0.1), and resolves Electron 43.1.1
and all npm dependencies from `package-lock.json`. Node archives use
architecture-specific checksums, and Ubuntu 26.04 is pinned by multi-platform
image digest. It runs `npm ci`, typecheck,
bundle, package, and package-content validation for each target. Publishing is
explicitly disabled.

The first build downloads the base image, Node, npm dependencies, Electron, and
packaging tools. Linux icons are reproducibly generated from the tracked
`resources/icon/dock.png` canonical rendered tile with ImageMagick 7:
`npm run sync:icons` writes them, while `npm run sync:icons -- --check`
regenerates them in a temporary directory and requires byte-for-byte equality.
Use `npm run sync:icons -- --mac` only after placing new external Icon Composer
Default/Dark exports in `resources/icon`; that preserves the macOS export
workflow and then refreshes Linux icons. Missing or non-v7 ImageMagick is a hard
error rather than leaving stale icons. The pinned Ubuntu 26.04 release container
installs its ImageMagick package and runs the byte comparison during every
package build.

BuildKit caches those layers plus the `apt` and npm download
caches. Source-only changes reuse the dependency install; changes to
`package.json` or `package-lock.json` rerun it. `docker buildx prune` removes
this cache when deliberately needed.

A multi-architecture build requires the selected builder to report both
`linux/amd64` and `linux/arm64`:

```bash
docker buildx ls
docker buildx inspect --bootstrap
```

On an amd64 machine, arm64 needs either a native arm64 builder node or QEMU with
binfmt registered. Docker Desktop normally supplies emulation; a standalone
Docker Engine installation may require separate builder/binfmt setup. Native
builders are faster and avoid emulation. Do not describe arm64 as validated
unless `docker buildx bake deb-arm64` completed: its container check extracts
the `.deb`, verifies Debian `Architecture: arm64`, and verifies the packaged
`node-pty` addon is AArch64 ELF. Existing host `node_modules/`, `out/`, and
`dist/` never enter the context because `.dockerignore` excludes them.

### Existing native build commands

```bash
npm run build:mac          # macOS artifacts
npm run build:linux:x64    # Debian amd64 .deb; run on native x64 Linux
npm run build:linux:arm64  # Debian arm64 .deb; run on native arm64 Linux
```

Native Linux builds still need a compiler toolchain for `node-pty`
(`sudo apt-get install build-essential` on Debian/Ubuntu). The release workflow
continues to use native GitHub-hosted Ubuntu 26.04 runners (`ubuntu-26.04` and
`ubuntu-26.04-arm`, currently preview images) and its existing npm/publishing
flow; the local Docker builder does not publish or replace CI.

The Linux `.deb` files are an initial distribution channel, not a claim of full
runtime certification. Testers must separately install Docker and a native
`sbx` CLI and run `sbx login`; den does not bundle either dependency. Confirm
`sbx` availability before arm64 testing in particular. Packaging can be
validated without an end-to-end runtime smoke test, and some login, updater,
and daemon-log behaviors remain macOS-oriented.

Linux custom chrome applies only to the main window; file-editor windows remain
natively framed. The main toolbar exposes keyboard-focusable Close, Minimize,
and Maximize/Restore controls backed by window-scoped Electron IPC. It is an
Electron frameless window, not native GNOME CSD. The compositor and X11/Wayland
session determine drag-region double-click, resize-border/corner, shadow, and
corner rendering. No synthetic shadow is added. Release QA should therefore
check controls and tooltips, keyboard focus, maximize/restore state over repeated
cycles, minimize, drag versus button/search/sidebar no-drag regions, toolbar
double-click, edge/corner resizing and minimum size, close lifecycle, and a
native-framed editor on the actual desktop/session. Static package validation
proves source and compiled wiring but is not a visual test.

Versioning follows semver via git tags (`vX.Y.Z`); bump `version` in `package.json` and tag
the release commit on `main`.
