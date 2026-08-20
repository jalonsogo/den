# Plan: den-managed sbx runtime (pinned version)

## Context

den is a GUI over `sbx`, and **each sbx minor is tightly coupled to den's UI**: v0.37 brought SSH
and shared skills, v0.38 the MCP gateway and kit spec v2, v0.39 sandbox environments and dynamic
secrets. Every one of them added surface den had to map by hand.

Today den *chases* the runtime — `sbxAtLeast()` (`src/main/index.ts:2493`) and `sbxFlag()` (`:2523`)
detect what's installed and open or close features accordingly. That machinery works, but it is a
strategy built on not knowing what den is talking to. The evidence that it can't win: **den 0.9.0
requires sbx 0.38, and 0.39.0 was already the latest release on the day it shipped.**

This plan inverts the relationship. den **declares** its runtime instead of discovering it, so the
version becomes a build-time constant and the UI maps 1:1 by construction.

> **The contract:** a den release is built and tested against exactly one sbx minor, and says so.
> Running that combination is the supported path; anything else is explicitly best-effort.

### Relationship to `sbx-onboarding-plan.md`
That plan solves *"the user has no sbx at all"* — a full-screen gate offering a brew-free download.
This one solves *"which sbx, exactly"*. They share the download mechanism, and the version policy
here supersedes its "fetch the latest release" step: den fetches the **pinned** version, not the
newest. Build this first; the onboarding gate then becomes a thin caller.

### Legal basis (settled — do not revisit without re-checking)
`docker/sbx-releases` ships a bare copyright notice (`Copyright © 2026 Docker Inc. All rights
reserved`), no grant of rights, README labelled "Proprietary — Docker Inc." Verified against the
LICENSE file directly.

**den must never bundle or redistribute the binary.** Downloading it onto the user's own machine, at
their request, mirrors Docker's own documented manual-install path and what brew/winget/apt do — that
is the only permitted route. Bundling would also nest a proprietary binary inside den's notarized
app, and at 126 MB would roughly double its size.

## Scope

**In (Phase 1, macOS only):** resolving, downloading, verifying, pinning and reverting a den-owned
sbx; the runtime-source switch; saying which version den was built for.

**Out (later phases):** daemon ownership and takeover UX, the PATH shim (`code`-style), the
full-screen onboarding gate, Windows.

### Why macOS only
The release assets decide this. macOS ships `DockerSandboxes-darwin.tar.gz` (126 MB) — extractable
into a den-owned folder, so a private pinned runtime is real. **Windows ships only
`DockerSandboxes.msi`** (76 MB); there is no portable archive. An MSI installs system-wide behind
UAC, so on Windows there is no private runtime to pin and the 1:1 guarantee cannot be offered.
Windows keeps the current detect-and-gate behaviour.

Extracting an MSI with `msiexec /a` was considered and rejected: unsupported, and it breaks the
first time Docker changes packaging.

Windows is separately *broken* today (brew assumed in `guiEnv()`, macOS-only paths in
`getSbxPath()`). That is pre-existing and unrelated to this feature — **fix it in its own commit**,
not here.

## Design decisions

**Pinned exact version, patch updates offered but never automatic.** den ships a known-good version
and its SHA-256. If a patch appears in the same minor, den offers it and says "den was tested against
`<pinned>`" — the default is always the tested combination. Silently drifting the runtime under a UI
built for a specific one would contradict the whole point. Crossing a minor requires a den release.

**The coupling runs one way only, and the pin lives in den's minor.** A new sbx minor forces a den
release; a den release does not require a new sbx. den ships bug fixes, integrations and UI work as
often as it likes against the same pin — those never touch the runtime.

> **Rule:** the sbx pin may change only in a den **minor** (or major). Never in a patch.

| den | pinned sbx | carries |
|---|---|---|
| `0.10.0` | 0.39.x | adopts sbx 0.39 · features |
| `0.10.1` | 0.39.x | bugs, integrations, UI |
| `0.11.0` | 0.40.x | adopts sbx 0.40 |

This turns the coupling into a guarantee rather than a constraint: `den 0.10.x` always means
`sbx 0.39.x`, so a user can take den patches without their runtime moving underneath them. It also
keeps patch updates cheap — same pin, same digest, the installed runtime is reused, so only a minor
bump triggers a 126 MB download. A den feature that *needs* a newer sbx was never uncoupled by
definition, and raises the pin, i.e. a minor.

**Consequence — release branches.** Once `main` starts adopting the next sbx minor, a patch for users
on the current one can no longer be cut from `main` without dragging the runtime change with it. Cut
it from the release tag instead and merge forward. Decide this before the first minor adoption, not
during a hotfix.

**Digest baked into the build, not provenance verification.** Docker publishes `provenance.json` and
`sbom.json` per release, but verifying them needs cosign or slsa-verifier — dependencies den would
have to ship. A pinned SHA-256 answers the only question that matters here: *is this the exact
artifact den was tested against?* It also can't cover a future patch, which is consistent with patch
updates being an explicit user choice rather than an automatic one (a patch's digest is read from the
release API over TLS, and the UI says so).

**`system` stays the default on upgrade.** An existing user's setup must not change under them
because they installed a den update. Managed is offered, not imposed.

**Never delete the previous runtime until the new one answers.** Adoption is: download → verify
digest → extract → `chmod +x` → clear quarantine → run `sbx version` → *only then* switch the
pointer.

## Verified against the real v0.39.0 artifact

Measured, not assumed. Redo this whenever the pin moves.

**The pin digest must come from the published asset, not from provenance.** They are different files:

| | sha256 |
|---|---|
| `DockerSandboxes-darwin.tar.gz` — 132,953,770 B, what den downloads | `d12fa06aeece298d96dae058101f256537770a00ef46e6584762e0f27b06a5a3` |
| `sandboxes-v0.39.0.darwin-arm64.tar.gz` — the provenance subject | `f390df6fcd93b36d03bf05d6bf280ee67b382297c4e819f5572c31bb8607f3db` |

The provenance attests a per-arch build artifact that is renamed on release, so its digest never
matches the asset. Two consequences: the digest has to be computed by downloading the asset once per
pin bump, and `slsa-verifier` could not have verified the download anyway — the attestation is about
another file. That settles the provenance question for good.

**`bin/sbx` is not a standalone binary.** The tarball is a tree that has to stay intact:

```
bin/sbx  bin/llmman
libexec/   nerdbox-kernel-arm64 · nerdbox-rootfs-arm64.erofs
           containerd-shim-nerdbox-v1 · mkfs.ext4 · mkfs.erofs
           llama/*.dylib · lib/libsailor.dylib
completions/{bash,zsh,fish}   LICENSE   THIRD-PARTY-NOTICES
```

den must extract the whole tree and run `<root>/bin/sbx` in place — the VM kernel, rootfs and shim
are resolved relative to the binary. **This also constrains the Phase 2 PATH shim:** a plain symlink
into `/usr/local/bin` risks breaking `../libexec` resolution depending on how sbx resolves its own
path. Use a wrapper script that execs the real path, not a symlink.

**331 MB extracted** from a 127 MB tarball. Keeping the previous version for revert doubles that, so
retention is a policy, not an afterthought. Phase 1 keeps **only the adopted version** and prunes
every other on successful adoption — there is no patch-update flow yet, so a second copy would be
331 MB held for a revert path that doesn't exist. Revisit when patch updates land.

**arm64 only.** The darwin tarball contains no x86_64 payload (`nerdbox-kernel-arm64`,
`nerdbox-rootfs-arm64.erofs`). The managed runtime is therefore Apple Silicon only; an Intel Mac must
stay on `system`, and the UI should say so rather than offering an install that cannot work.

## Implementation

### 1. Main process — `src/main/index.ts`

**Pin constants**, next to `MIN_SBX_VERSION` (`:2472`):
```ts
export const PINNED_SBX = { version: '0.39.0', minor: '0.39', sha256: '<digest>' }
```
`MIN_SBX_VERSION` stays — it still governs the `system` path.

**`getSbxPath()` (`:78`) becomes source-aware.** This is the existing seam and the reason Phase 1 is
contained: nothing else in the codebase needs to know.
```
runtimeSource === 'managed' && a verified managed binary exists  → that path
otherwise                                                        → today's discovery
```
Falling back rather than failing matters: a managed install that went missing (userData cleared,
partial upgrade) should degrade to the user's own sbx, not brick the app.

Also harden as `sbx-onboarding-plan.md` notes under SEC-2: a stored `sbxPath` must be an existing
regular file before it's used, else fall through to discovery.

**New handlers:**
- `minipit:runtime-source` (get/set) — `'managed' | 'system'`, persisted in `store`. Setting it
  returns whether a daemon restart is needed.
- `minipit:runtime-install` — download the pinned tarball, verify SHA-256 **before** extracting,
  extract to `app.getPath('userData')/runtime/sbx-<version>/`, `chmod +x`,
  `xattr -dr com.apple.quarantine`, smoke-test `sbx version`, adopt on success. Streams progress on
  the existing `minipit:runtime-output` channel. Cleans up the temp file on every exit path.
- `minipit:runtime-status` — `{ source, pinned, installed?, running?, patchAvailable? }` for the
  Settings panel.
- `minipit:runtime-revert` — repoint at the previous verified install.

**Reuse, don't reinvent:** `SBX_RELEASES_URL` (`:638`), the GitHub fetch pattern in
`minipit:sbx-releases` (`:4918`), `detectInstallManager()` (`:643`) and `pkgCommand()` (`:663`) for
the `system` path, and `minipit:sbx-update` (`:4953`) — whose `manual` branch should route to
`runtime-install` when the current binary is den-managed.

### 2. Preload — `src/preload/index.ts`
Bridge the four handlers next to the existing `sbx*` group. Types in
`src/renderer/src/types.ts` alongside `sbxVersionCheck`.

### 3. Settings → Runtime — `src/renderer/src/components/SbxRuntimePanel.tsx`
A **Runtime source** row above the existing "sbx binary path" row (`:652`):

- Two options, `den-managed` / `my own install`, with the current one marked.
- Managed shows the pinned version, the running version, and **Revert to known-good** when they
  differ.
- System shows the detected manager and **the exact command for this platform, copyable** — via the
  existing `displayCommand()`, with the releases URL as a fallback link rather than the first answer.
- **"Built for sbx 0.39.x"** stated plainly. It's the promise den is making; it belongs on screen,
  not in the source.
- Switching source warns that it takes effect when the daemon next starts — the state directory is
  global, so the switch is not silent-safe.

`SettingsPage.tsx:22` hardcodes `sbxPath: '/opt/homebrew/bin/sbx'` as a default; it should come from
discovery, not a literal.

### 4. What this lets us simplify (later, not in Phase 1)
On the managed path the version is known exactly, so `hasEnvFiles`-style gating and the `sbxFlag()`
`--help` probing become a cheap assertion rather than the mechanism. **Keep both** — they are what
holds the `system` path together, and that path is now explicitly best-effort. Removing them is a
separate change once managed is the common case.

## Risks

- **Global state, one daemon.** `~/Library/Application Support/com.docker.sandboxes/…` is shared, so
  switching source changes which binary the *next* daemon serves. Phase 1 only warns; Phase 2 owns it.
- **State downgrade.** If state was written by a newer sbx than den pins, refuse and explain rather
  than run an older binary against it.
- **Terminal drift.** The user's shell `sbx` is untouched by Phase 1, so `sbx ls` in a terminal may
  disagree with den. Accepted for now; the PATH shim in Phase 2 is the fix.
- **Release cadence.** A new sbx minor now requires a den release. This is the cost of the guarantee
  and should be accepted deliberately.
- **Corporate networks.** Egress is often restricted; the download needs a clear failure and a
  documented manual fallback (locate-binary already exists).

## Verification
1. `npm run typecheck` and `npm run build`.
2. **Fresh managed install:** switch to managed with nothing downloaded → progress streams → binary
   lands in `userData/runtime/sbx-0.39.0/` → `sbx version` matches the pin → sandboxes list.
3. **Digest mismatch:** corrupt the expected SHA → install must refuse *before* extracting, leave no
   partial directory, and keep the previous runtime working.
4. **Fallback:** delete the managed directory while managed is selected → den falls back to the
   system sbx instead of breaking.
5. **Revert:** with two versions present, Revert repoints and `sbx version` follows.
6. **System path unchanged:** with source = system, behaviour is byte-identical to today, including
   the outdated-runtime banner on 0.37.
7. **No auto-drift:** with a patch available, den offers it and does nothing until asked.
