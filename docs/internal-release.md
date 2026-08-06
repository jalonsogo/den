# den — Internal Release Guide

How to hand a den build to internal testers, and what they need to know to run it.

> **Scope:** internal only. Builds produced by the tag pipeline are **signed and notarized**
> (see [*Signing and notarization*](#signing-and-notarization) below), so there is no
> Gatekeeper step. A build packaged by hand on a machine without the Apple credentials is
> not notarized — the one-time workaround for that case is here too.

---

## What testers get

- A macOS Apple-Silicon build: `den-<version>-arm64.dmg` (or the `.zip`), and a Windows
  NSIS installer.
- Current version: **v0.9.0** (MCP Servers page with host-side OAuth, kit spec v2 and a
  composer that covers the whole spec, sbx v0.38 as the minimum runtime).

## Prerequisites for testers

- macOS on Apple Silicon (or Windows for the NSIS build).
- **Docker** running.
- **`sbx` v0.38 or newer**, installed and signed in:
  ```bash
  brew install docker/tap/sbx
  sbx login
  sbx version          # must be >= 0.38
  ```
  den speaks only the v0.38 CLI dialect. On an older runtime it shows an app-wide banner
  linking to Settings → Runtime rather than failing feature by feature.
- Optional: the **`op`** (1Password) CLI, only if testing 1Password secret sourcing.

## First launch of an unnotarized build

Only applies to a build packaged locally without the Apple credentials — a release
downloaded from the tag pipeline opens normally. macOS quarantines an unnotarized app and
refuses to open it with "den can't be opened because Apple cannot check it for malicious
software." Pick one:

**Option A — strip the quarantine flag (recommended, one command):**
```bash
xattr -dr com.apple.quarantine /Applications/den.app
```
Then open den normally. (Adjust the path if you didn't drag it to `/Applications`.)

**Option B — right-click → Open:**
Right-click (or Control-click) `den.app` → **Open** → **Open** in the dialog. First launch
only; macOS remembers the choice.

## Please report

These v0.9.0 areas are build-verified but need real-world eyes (see the "Verify at
runtime" list in [`todo.md`](todo.md)):

- The **MCP Servers** page end to end: register from the catalog and by hand, **Authorize**
  (the browser callback lands on the host, which is the whole point), **Add to sandbox** on
  an already-running sandbox, and pre-loading servers at creation — picking any switches
  the sandbox to static mode, picking none leaves it dynamic.
- Whether the **Auth** column tells the truth after authorizing, after revoking on the
  provider's side, and for a non-OAuth server. Its state is partly a den-side note about a
  successful `sbx mcp auth`, because sbx doesn't report authorization; the badge tooltip
  says where the value came from.
- **Kit spec v2**: open an existing v1 kit in the composer, save it, and check nothing was
  dropped — especially credentials, which collapse from four coordinated blocks into one
  record per service.
- **Creating a sandbox from a sandbox kit** (the kit *is* the agent) and from an imported
  one, where the folder name and the declared `name:` differ.
- **Importing a kit from a Git repo** by bare URL, by browser URL, with `#ref=` pinned to a
  tag, and from a repo holding several kits.

File issues with: what you did, what you expected, what happened, and whether a **full app
relaunch** fixed it (main-process changes need a relaunch — den now shows a banner when its
main process is older than the window).

---

## Signing and notarization

The tag pipeline signs with the *Developer ID Application* certificate and notarizes:
`.github/workflows/build.yml` imports `APPLE_CERTIFICATE_P12` into a temporary keychain and
runs electron-builder with `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`,
against `build.mac.notarize: true` in `package.json`. All five are repository secrets; a
build that can't see them produces an unnotarized app rather than failing, so check the
job's signing step before handing out a DMG.

## Cutting a release

1. Merge the work to `main`.
2. Bump `version` in `package.json` and move the `[Unreleased]` block in
   [`CHANGELOG.md`](../CHANGELOG.md) under a new `## [X.Y.Z] - <date>` heading, adding the
   compare link at the foot of the file.
3. Tag the release commit on `main` (`vX.Y.Z`) and push the tag.

Pushing the tag runs `.github/workflows/build.yml`, which pre-creates one draft release,
then builds and uploads macOS (`.dmg`/`.zip`) and Windows (NSIS `.exe`) assets to it. The
draft is pre-created deliberately: electron-builder's parallel uploads otherwise race on
get-or-create and split the assets across duplicate drafts. Review the draft and publish it.

To package locally without going through a tag:

```bash
npm run build:mac     # bundles + packages dist/den-<version>-arm64.dmg (+ .zip)
npm run build:win
```

Versioning follows semver via git tags (`vX.Y.Z`).
