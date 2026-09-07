# Test Plan — sbx 0.42.0 adoption (branch `rename-minipit-to-den`)

Manual QA for den's move to requiring sbx **0.42.0 or newer**, the new surface that
unlocks, and a real bug the upgrade would otherwise have shipped. Covers commits
`278c332`..`cfdb5ec` (see `git log --oneline 278c332^..HEAD` for the exact list).

> **In progress, not covered here yet:** cloud port publish/unpublish, `sbx move`
> (local↔cloud), and the Agent terminal tab's cloud reattach. These need their own
> pass once implemented — don't block sign-off on them.

Each `sbx` call is verifiable independently in a terminal — run the noted command
to confirm the GUI produced the same effect.

## Preconditions

- A real **sbx 0.42.0** (or newer) binary installed and on the configured path.
  Settings → Runtime should show `0.42.x`. **This is now a hard requirement** — see
  Phase 1 for what happens below it.
- Signed in (`sbx login` / Runtime tab shows "Signed in").
- Dependencies build locally: `npm install` (native `node-pty` build must succeed —
  run on a real host, not CI), then `npm run dev`.
- Gate: `npm run typecheck` and `npm test` both clean.
- Fixtures:
  - At least one **running** local sandbox and one **stopped** local sandbox.
  - At least one locally-authored sandbox kit and one mixin kit in the library.
  - *Optional, for Phases 5–8:* a Docker Agentic Platform plan and at least one
    cloud sandbox (`sbx --cloud run claude --name test-cloud`). If you don't have
    one, Phase 5.0 below is the one to run instead — it checks that den behaves
    identically to today with zero cloud entitlement, which matters just as much.

## Smoke

| # | Step | Expected |
|---|------|----------|
| S1 | `npm run dev` | App launches, no console errors, sandbox list loads |
| S2 | `npm run typecheck && npm test` | Both clean |
| S3 | Open New Sandbox, a kit's edit modal, and Secrets | New sections (Kit arguments, Arguments capability, cloud toggle) render without layout breakage |

---

## Phase 1 — The sbx 0.42 floor (`MIN_SBX_VERSION`)

> This is the highest-risk change: den now refuses to treat an older runtime as
> fully supported, where it used to just hide a few features.

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 1.1 | Launch den with a real sbx 0.42.x on PATH | No outdated-runtime banner anywhere; Settings → Runtime shows the version plainly | `sbx version` |
| 1.2 | Point Settings → Runtime's binary path at an sbx **0.38–0.41** binary (or simulate via a wrapper script that prints an older version) | App-wide `OutdatedRuntimeBanner` appears: "needs sbx 0.42.0 or newer... will misbehave until it's updated", with an **Update sbx** button and a **Later** dismiss | — |
| 1.3 | With that banner showing, go to Home | The *separate* "Docker sbx update available" bar does **not** also appear — only the one banner | Regression check for this session's fix |
| 1.4 | Point the path back at 0.42.x, click the outdated banner's context or just relaunch | Banner clears | — |
| 1.5 | With sbx 0.42.x installed, but a newer release exists upstream (check `sbx-releases` on GitHub) | Home's softer "Docker sbx update vX available · you're on 0.42.x" bar **does** show, and is dismissible per-version | — |
| Edge | sbx binary missing entirely | Existing "not installed" setup flow, not a crash |

---

## Phase 2 — Kit signing/verification, dynamic secrets, prune, sandbox environments (regression — no longer gated)

These were previously hidden below sbx 0.39 and are now unconditional. Confirm they
simply work, with no leftover "needs sbx 0.39" messaging anywhere.

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 2.1 | Kits page → row ⋮ menu | **Sign kit…** and **Verify signature…** are present (previously conditional) | — |
| 2.2 | New Secret modal | The "Let sbx resolve it" (dynamic secret) toggle is present unconditionally | — |
| 2.3 | Sandboxes page, with ≥1 stopped sandbox | **Prune N stopped** button shows | `sbx prune --help` |
| 2.4 | Library → Environments | No "needs sbx 0.39" or "Checking your runtime…" empty state — the real page (or its genuine empty state, "no `.sbxenv.yaml` found") renders directly | — |
| 2.5 | Settings → Runtime | The old "Not available on this runtime" disclosure block (list of gated features) is gone entirely | — |

---

## Phase 3 — Workspace-optional `sbx create`

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 3.1 | New Sandbox → Basic tab → Workspace group | A **"No workspace bind mount"** toggle appears above the Path field | — |
| 3.2 | Turn it on | Path field and the whole Isolation section disappear; Name field becomes required (submitting with empty name errors "Name is required when there is no workspace") | — |
| 3.3 | Fill a name, create | Command preview omits the trailing workspace path entirely (`sbx create ... claude` with no path); sandbox is created with no bind mount | `sbx ls` shows the sandbox; `sbx inspect <name>` shows no workspace |
| 3.4 | Turn the toggle back off | Path field and Isolation reappear; previous path value is preserved | — |
| 3.5 | Regression: create a normal sandbox with a workspace path, toggle left off | Unchanged from before — path required, command preview includes it | — |

---

## Phase 4 — Kit arguments (`args:` block + `--kit-arg`)

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 4.1 | New/Edit Kit modal → **Add a capability** → Arguments | New section appears; **Add argument** creates a row with Name, Required checkbox, Description, Default fields | — |
| 4.2 | Fill in 2 arguments (e.g. `MODEL`, required; `REGION`, with a default), save the kit | Kit's `spec.yaml` gets a root-level `args:` block with both entries | Open the packed/saved kit's `spec.yaml` directly |
| 4.3 | Re-open the same kit for editing | Arguments section is pre-populated with both rows, values intact | — |
| 4.4 | New Sandbox → select that kit as a mixin (or base) | A **Kit arguments** group appears in the Basic tab with one input per declared arg, pre-filled with each default | — |
| 4.5 | Leave `MODEL` blank (no default) and try to create | Since den doesn't hard-block on required-but-empty, confirm what actually happens: either sbx's own error surfaces, or fill it in and confirm the flag appears | Command preview shows `--kit-arg MODEL=<value>` |
| 4.6 | Select **two** mixins that each declare an arg with the **same name** | Command preview disambiguates: both use `--kit-arg <kit-name>.<arg-name>=<value>`, not the bare form | — |
| 4.7 | Select two mixins where only one declares a given arg name | That one stays in the bare `--kit-arg name=value` form | — |
| 4.8 | Create a sandbox using the filled-in kit args | Sandbox creates successfully; inside it, confirm the kit's setup commands see the argument value (however the kit is written to consume it) | — |
| Edge | Import/open a kit whose `spec.yaml` already has an `args:` block (hand-written) | Parses without error, round-trips on save | — |

---

## Phase 5 — Cloud sandboxes: listing, filter, badge

> Requires a Docker Agentic Platform plan. **If you don't have one, run 5.0 instead
> of 5.1–5.5** — it's the more important check for most installs.

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 5.0 | **No cloud entitlement/plan at all.** Launch den normally. | Sandbox list, Sidebar, and every page behave exactly as before this release — no error banner, no empty "Cloud" section, no Location filter (it only appears once a cloud sandbox exists) | — |
| 5.1 | With a cloud sandbox created (`sbx --cloud run claude --name test-cloud`), open den | It appears in the sidebar/sandbox list alongside local ones, with a small cloud glyph next to its name | `sbx --cloud ls` |
| 5.2 | Sidebar filter popover | A **Location** segmented control (All/Local/Cloud) now appears next to Status | — |
| 5.3 | Set Location to **Cloud** | Only cloud sandboxes show; **Local** shows only local ones; **All** shows both | — |
| 5.4 | Hover a cloud row while the sidebar is collapsed to icon rail | Hover popover shows the cloud glyph next to the name | — |
| 5.5 | Stop the daemon's network access to Docker's cloud API (or just check behavior when the cloud API is unreachable) | Local sandboxes still list normally; no error surfaced for the failed cloud listing | — |

---

## Phase 6 — Cloud sandbox actions (stop / remove / exec / shell terminal)

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 6.1 | Stop a cloud sandbox from den (context menu or row action) | Runs with `--cloud`; sandbox suspends in place (per `sbx stop --help`, state preserved) | `sbx --cloud ls` shows it stopped |
| 6.2 | Remove a cloud sandbox from den | Runs with `--cloud --force`; deletes the cloud sandbox | `sbx --cloud ls` no longer lists it |
| 6.3 | Open the **Shell** terminal tab on a running cloud sandbox | Connects (via `--cloud exec -it ... bash`), interactive shell works | — |
| 6.4 | Trigger any den feature that shells a one-off command into a cloud sandbox (e.g. whatever calls `den:exec`) | Works, dispatched with `--cloud` | — |
| 6.5 | Regression: same four actions on a **local** sandbox | Completely unchanged — no `--cloud` flag, same as before this release | — |
| Known gap | Open the **Agent** terminal tab on a cloud sandbox | Not yet wired to cloud's `attach`/`run` — note what actually happens (likely tries the local `run --name` path and fails) so it's tracked, not silently broken |

---

## Phase 7 — Cloud network policy

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 7.1 | Open a **cloud** sandbox's Info → Network panel | Loads its policy rules (dispatched with `--cloud` internally) — same panel UI as local | `sbx --cloud policy ls <name>` |
| 7.2 | Add an allow rule on a cloud sandbox | Rule appears in the panel | `sbx --cloud policy ls <name> --wide` |
| 7.3 | Add a deny rule, then remove it (×) | Rule disappears | `sbx --cloud policy ls` |
| 7.4 | "Test access" checker on a cloud sandbox | Returns a real allow/deny decision, not a local-sandbox answer | — |
| 7.5 | Regression: all four on a **local** sandbox | Unchanged | — |

---

## Phase 8 — Cloud secrets

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 8.1 | New Secret modal | A **"Store in the cloud"** toggle appears below Scope, off by default | — |
| 8.2 | Turn it on, store a service secret (e.g. `github`) globally | Written with `--cloud`; Secrets page shows a row with a small **cloud** badge next to "Global" | `sbx secret ls --cloud` |
| 8.3 | Store the **same service** locally too (toggle off) | Both a local and a cloud row show for `github` — they don't collide/overwrite each other | `sbx secret ls` vs `sbx secret ls --cloud` |
| 8.4 | Edit the cloud secret and flip the toggle back to local (or change scope while cloud is on) | Confirmation dialog describes it as a move between locations; old cloud entry is removed, new local one written | `sbx secret ls` / `sbx secret ls --cloud` |
| 8.5 | Remove a cloud-stored secret from the Secrets page | Confirmation mentions "cloud"; entry is gone | `sbx secret ls --cloud` |
| 8.6 | Anthropic OAuth with the cloud toggle on | Routes through sbx's own `--oauth --cloud` (not den's local PKCE flow) | — |
| 8.7 | OpenAI OAuth with the cloud toggle on/off | Both work; cloud one stores via `--cloud` | — |
| 8.8 | Regression: every existing local secret flow (paste, 1Password, dynamic reference/command, OAuth) with the cloud toggle **off** | Byte-for-byte unchanged from before this release | — |

---

## Phase 9 — Devin agent + the `--kit` mixin-only fix

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 9.1 | New Sandbox → agent picker | **Devin** is a selectable option | `sbx create --help` lists it |
| 9.2 | Create a Devin sandbox | Uses `docker/sandbox-templates:devin-docker`; creates successfully | `sbx inspect <name>` |
| 9.3 | New Kit modal, base agent picker (for a sandbox-kind kit) | Devin selectable there too, with a sensible prefilled image/entrypoint | — |
| 9.4 | **The important regression:** create a sandbox from a **sandbox-kind kit** (not a mixin) — either a local one or a Hub kit | Command preview shows the kit **only** as the bare positional agent — it must **not** also appear as a `--kit <dir>` flag | Command preview text; `sbx create` succeeds (would have errored/behaved wrong pre-fix if `--kit` got the base kit) |
| 9.5 | Same sandbox-kind kit, now also add a **mixin** kit alongside it | Command preview shows `--kit <mixin-dir>` for the mixin only; base kit still bare positional | — |
| 9.6 | Kits page → the base kit still shows as "applied" to sandboxes created from it | den's own bookkeeping (`recordKits`) wasn't affected by the argv fix — full kit list still recorded even though only mixins go to `--kit` | Kits page / sandbox Info panel's applied-kits list |

---

## Regression sweep

- Local sandbox create/stop/remove/exec/ports/terminal — every path untouched by
  the `--cloud` threading behaves exactly as before.
- Groups, MCP servers, Templates, general Settings (theme, sounds, polling) —
  untouched by this release, quick sanity pass only.
- Kit export/push/pull, kit validate — unaffected by the args: addition.
- `docs/sbx-quirks.md`'s v0.42 entry — spot-check a couple of the "confirmed"
  claims (e.g. `--kit-arg` spelling) against your own `sbx --help` if you're on
  a different build than v0.42.0 exactly.

## Sign-off

- [ ] Smoke S1–S3
- [ ] Phase 1 — floor enforcement (1.1–1.5)
- [ ] Phase 2 — no-longer-gated features (2.1–2.5)
- [ ] Phase 3 — workspace-optional create (3.1–3.5)
- [ ] Phase 4 — kit arguments (4.1–4.8)
- [ ] Phase 5 — cloud listing (5.0, or 5.1–5.5 with a cloud plan)
- [ ] Phase 6 — cloud sandbox actions (6.1–6.5)
- [ ] Phase 7 — cloud network policy (7.1–7.5)
- [ ] Phase 8 — cloud secrets (8.1–8.8)
- [ ] Phase 9 — Devin + `--kit` mixin-only fix (9.1–9.6)
- [ ] Regression sweep
- [ ] `npm run typecheck && npm test` clean
