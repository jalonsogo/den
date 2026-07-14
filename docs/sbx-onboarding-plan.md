# Plan: sbx onboarding gate + brew-free install for den

## Context

den is a desktop GUI over Docker's `sbx` CLI. Today the app **assumes `sbx` is already
installed and signed in** — `getSbxPath()` (`src/main/index.ts:43`) falls back to the bare
string `'sbx'` and every feature silently fails (spawn ENOENT, blank runtime panel) if it
isn't. The only documented install path in the README is `brew install docker/tap/sbx`, which
forces a heavy prerequisite chain (install Homebrew → tap → install) on macOS users who don't
already have brew.

Goal: when `sbx` is not detected on launch, present a **full-screen blocking onboarding flow**
that walks the user through (1) installing `sbx` — offering both Homebrew *and* a brew-free
direct download so brew is no longer mandatory — and (2) signing in via `sbx login`, ending only
when den can actually create sandboxes.

### Legal basis for the brew-free download (resolved)
Docker's `docker/sbx-releases` repo README documents a "Manual install from release artifacts"
path (download `DockerSandboxes-darwin.tar.gz`, `tar -xzf`). Downloading the binary **onto the
user's own machine, on their behalf** mirrors that documented flow and what brew/winget do — legally
fine. The LICENSE is bare `Copyright © 2026 Docker Inc. All rights reserved.` with no redistribution
grant, so den must **never bundle/redistribute** the binary in its own `.dmg`/`.app`. Download-on-behalf
only.

## Install-method choice (both offered)
The onboarding install step lets the user pick. den detects whether `brew` exists (new helper) and
**recommends** the appropriate default:
- **Homebrew** — official channel, managed updates (den's existing `sbx-update`→`brew upgrade` works
  because `detectInstallManager` returns `brew`), standard path, brew handles quarantine. **But requires
  brew already installed.** Recommended when brew is present.
- **Brew-free download** — den downloads Docker's release tarball, verifies it, extracts to a den-owned
  dir, sets `sbxPath`. Removes the brew prerequisite. den owns updates (install manager = `manual`) and
  must clear macOS quarantine + smoke-test. Recommended when brew is absent.

## Existing pieces to reuse (do NOT reinvent)
- `getSbxPath()` / `getBrewPath()` — `src/main/index.ts:43,61` (path discovery).
- `detectInstallManager()` — `:209`; `pkgCommand()`/`displayCommand()` — `:229,243`.
- `minipit:sbx-version` `:2702`, `minipit:sbx-install-info` `:2738`, `minipit:sbx-update` `:2755`,
  `minipit:sbx-releases` `:2717` (GitHub API fetch pattern).
- `minipit:docker-account` `:1779` (login status: `{loggedIn, username,...}`) and
  `minipit:docker-login` `:1811` (`sbx login`, streams via `minipit:login-output`).
- Streaming channels: `onRuntimeOutput` / `onLoginOutput` (`src/preload/index.ts:111,121`).
- Store pattern in `src/renderer/src/store.ts`; App render gate in `src/renderer/src/App.tsx:159`.
- `SBX_RELEASES_URL` `:204`.

## Implementation

### 1. Main process — `src/main/index.ts`
- **`getBrewPath` already exists**; add a tiny `brewInstalled()` check (fs.accessSync on the two
  brew prefixes) for the UI recommendation.
- **New `minipit:sbx-status`** handler — the boot-time gate source of truth. Runs `sbx version`
  (reuse the `sbx-version` logic) + `docker-account`. Returns
  `{ installed: boolean, version?: string, path: string, signedIn: boolean, username?: string,
    brewAvailable: boolean, platform, arch }`. `installed=false` when `version` errors with ENOENT.
- **New `minipit:sbx-download-install`** handler (macOS first; Windows/Linux fall back to showing
  the documented command since winget/apt don't need brew anyway):
  1. Fetch `https://api.github.com/repos/docker/sbx-releases/releases/latest`, find the macOS asset
     `DockerSandboxes-darwin.tar.gz` `browser_download_url` (reuse fetch pattern from `sbx-releases`).
  2. Download to a temp file over HTTPS; stream progress via `minipit:runtime-output`.
  3. Extract with `tar -xzf` into a **den-owned dir** (`app.getPath('userData')/sbx/`).
  4. Locate the `sbx` binary in the extraction, `chmod +x`, clear quarantine
     (`xattr -dr com.apple.quarantine <dir>`).
  5. **Verify**: run `<binary> version`; on success persist `store.set('sbxPath', <binary>)` and
     return `{ ok:true, path, version }`. On any failure, clean up and return `{ ok:false, error }`
     with a link to `SBX_RELEASES_URL` as fallback.
- **`minipit:sbx-update`** (`:2755`): extend the `manual` branch so a den-managed (userData) install
  can re-run `sbx-download-install` instead of only printing the releases URL. Keep brew/winget as-is.
- **SEC hardening (ties to docs/fix-plan.md SEC-2)**: since we now set `sbxPath` programmatically,
  validate in `getSbxPath()`/on-set that a stored `sbxPath` exists and is a regular file before use,
  falling back to discovery. Scope-limited to what this feature touches.

### 2. Preload — `src/preload/index.ts`
Add bridge methods next to the existing `sbx*` group (`:81`):
`sbxStatus: () => invoke('minipit:sbx-status')`,
`sbxDownloadInstall: () => invoke('minipit:sbx-download-install')`.
(`dockerLogin`, `sbxVersion`, `sbxInstallInfo`, `onRuntimeOutput`, `onLoginOutput`, `sbxSettingSet`,
and the file-picker used for "Locate binary" already exist.)

### 3. Renderer store — `src/renderer/src/store.ts`
- Add `sbxStatus: SbxStatus | null` state + `refreshSbxStatus()` action (calls `window.minipit.sbxStatus()`).
- Call `refreshSbxStatus()` in the App boot effect (`src/renderer/src/App.tsx:26`), before/alongside
  `listSandboxes()`.

### 4. Onboarding component — new `src/renderer/src/components/Onboarding.tsx`
Full-screen gate. Rendered in `App.tsx` return (`:159`) **before** the normal `app-root` when
`sbxStatus && (!sbxStatus.installed || !sbxStatus.signedIn)`. Steps (a simple stepper):
1. **Install sbx** (shown when `!installed`):
   - Two selectable cards: **Homebrew** vs **Direct download** — recommended one pre-selected based
     on `brewAvailable`; each card lists the pros/cons summarized above.
   - Homebrew card → runs `sbx-update`-style `brew install docker/tap/sbx` (add a small install action,
     or show copy-paste command + "Re-check" if we don't want to shell brew install non-interactively).
   - Direct-download card → calls `sbxDownloadInstall()`, shows a live log via `onRuntimeOutput`.
   - Always-available fallbacks: copyable brew/winget/apt command for the current OS, a **"Locate
     binary…"** button (existing file-picker → `sbxSettingSet`/store `sbxPath`), and **"Re-check"**
     (`refreshSbxStatus`).
2. **Sign in** (shown when `installed && !signedIn`): "Sign in to Docker" button → `dockerLogin()`,
   stream `onLoginOutput`, then `refreshSbxStatus()`.
3. On `installed && signedIn` the gate unmounts and the normal app renders.
Re-check status after each action; auto-advance when a step completes.

### 5. Docs — `README.md` (`:56` Requirements) and `docs/docker-sandboxes` reference
Update the Requirements block to show all three OS channels (brew/winget/apt) + note that **den can
install `sbx` for you** on first run, and that brew is macOS-only (not universally required).

## Verification (end-to-end)
1. `npm install` then `npm run dev` (electron-vite hot reload).
2. **Not-installed path**: temporarily point discovery at nothing (rename/override so `sbx version`
   fails, e.g. set `sbxPath` to a bogus path via the store) → app should show the full-screen gate.
3. Click **Direct download** → watch the streamed log, confirm the tarball downloads, extracts to
   userData/sbx, `sbx version` passes, `sbxPath` is persisted, and the gate advances to **Sign in**.
4. Click **Sign in** → complete `sbx login` in the browser → gate dismisses, normal UI appears, and
   `listSandboxes()` works.
5. **Brew path**: on a machine with brew, confirm the Homebrew card is recommended and installs to
   `/opt/homebrew/bin` (install manager detected as `brew`, auto-update still offered in Runtime panel).
6. Restart den with a working sbx → no gate appears (status check passes on boot).
7. `npm run build` (type-check + bundle) passes.
