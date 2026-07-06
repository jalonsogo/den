# Test Plan — CLI coverage (branch `feat/cli-coverage`)

Manual QA for the five phases that surface the remaining `sbx` commands in the GUI.
There is no automated test harness in this repo; the app orchestrates a real `sbx`
runtime, so every case below is a manual check against a working install.

Each `sbx` call is verifiable independently in a terminal — run the noted command to
confirm the GUI produced the same effect (`sbx policy ls`, `sbx ports <name>`, etc.).

## Preconditions

- macOS with `sbx` installed and on the configured path (Settings → Runtime shows a version).
- Signed in to the runtime (`sbx login` / Runtime tab shows "Signed in").
- Dependencies build locally: `npm install` (the native `node-pty` build must succeed —
  it fails in the CI sandbox, so run on a real host), then `npm run dev`.
- Gate: `npm run typecheck` is clean.
- Fixtures:
  - At least one **running** sandbox and one **stopped** sandbox.
  - At least one locally-authored **kit** in the library.
  - A scratch/throwaway machine state for Phase 5 destructive cases (see warnings).

## Smoke

| # | Step | Expected |
|---|------|----------|
| S1 | `npm run dev` | App launches, no console errors, sandbox list loads |
| S2 | `npm run typecheck` | Passes for both node and web projects |
| S3 | Open Settings → Runtime; open a sandbox's Info panel | New sections render without layout breakage |

---

## Phase 1 — `sbx diagnose` (Settings → Runtime → Diagnostics)

| # | Step | Expected |
|---|------|----------|
| 1.1 | Click **Run** | Output box streams `sbx diagnose` text; button shows "Running…", returns to "Run" on completion |
| 1.2 | Click **Copy JSON** | Runs `--output json`; button shows "✓ Copied"; clipboard holds valid JSON (paste to verify) |
| 1.3 | Click **For bug report** | Runs `--output github-issue`; clipboard holds the markdown-formatted report |
| 1.4 | Click **Upload bundle** | Runs `--upload`; output box shows a shareable bundle id/URL |
| 1.5 | While one run is in progress | All four buttons are disabled (no concurrent runs) |
| 1.6 | Point sbx path at a bad binary, click Run | Fails gracefully with an error in the output box; app stays responsive |
| Edge | Very long output | Box scrolls to bottom; text is capped (~200k) without freezing |

---

## Phase 2 — Network policy CRUD (Sandbox → Info → Network policy)

> Local rule controls (block input, remove ×, preset, reset) must be **hidden** when
> org governance is active. Test the CRUD path on a machine with local governance.

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 2.1 | Add allow rule `example.com` (regression) | "Rule added." + restart offer; rule appears | `sbx policy ls` |
| 2.2 | In **Add block rule**, enter `ads.example.com`, click **Block** | "Block rule added."; a DENY rule appears | `sbx policy ls` shows deny |
| 2.3 | Click the **×** on an allow/deny rule's resource chip | "Removed …"; rule disappears after refresh | `sbx policy ls` no longer lists it |
| 2.4 | Choose a preset (e.g. Locked down), click **Apply** | "Default preset set to …" + restart offer | `sbx policy ls` default changed |
| 2.5 | Comma-separated allow `a.com,b.com` | Both resources added |
| 2.6 | Refresh button | Re-reads policy; list matches CLI |
| 2.7 | Org governance active machine | Block/×/preset/reset controls are absent; governance note shown |
| Edge | Remove a rule that no longer exists | Error banner, no crash |

---

## Phase 3 — Ports publish/unpublish (Sandbox → Info → Ports)

> Requires a **running** sandbox. Mappings don't persist across stops.

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 3.1 | Stopped sandbox: view Ports | **+ Add forward** is disabled; hint says start the sandbox |
| 3.2 | Running sandbox: click **+ Add forward**, host `8080`, sandbox `8080`, TCP, **Publish** | Row appears `8080 → 8080` after refresh | `sbx ports <name>` |
| 3.3 | Leave sandbox port blank, publish host `9090` | Defaults sandbox port to host port (`9090 → 9090`) |
| 3.4 | Publish UDP mapping | Row shows `UDP` proto | `sbx ports <name>` |
| 3.5 | Click **×** (unpublish) on a row | Row disappears after refresh | `sbx ports <name>` |
| 3.6 | With a service listening in the sandbox, click **Open ↗** | Opens `http://localhost:<host>` in the browser |
| 3.7 | Publish a host port already in use | Error banner surfaced from sbx; no crash |
| 3.8 | Cancel the add form | Form closes, no mapping created |
| Edge | Publish, then stop the sandbox, reopen Ports | List empties (mappings cleared on stop) |

---

## Phase 4 — Kit validate + export (Kits page → row ⋮ menu)

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 4.1 | ⋮ → **Validate spec** on a valid kit | Banner: `"<kit>" is valid.` | `sbx kit validate <dir>` exits 0 |
| 4.2 | Hand-edit a kit's `spec.yaml` to be invalid, then Validate | Banner shows the validation error text |
| 4.3 | ⋮ → **Export as zip…** | Save dialog defaults to `<kit>.zip`; on save, banner shows the export path | File exists and is a valid zip |
| 4.4 | Cancel the save dialog | No banner, no file written, no error |
| 4.5 | ⋮ → **Upload to Hub…** (regression) | Existing push flow still works |
| Edge | Export to a read-only location | Error banner from sbx; no crash |

---

## Phase 5 — Runtime settings, sbx reset, policy reset

### Runtime settings (Settings → Runtime → Runtime settings)

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 5.1 | Toggle **Paste images into agents** on | Toggle turns on; persists | `sbx settings set clipboard.imagePaste true` ran (setting reflects `true`) |
| 5.2 | Toggle off | Runs with `false`; persists across app restart |
| 5.3 | Simulate sbx failure (bad path) then toggle | Toggle reverts to previous state (no false-positive) |

### Policy reset (Sandbox → Info → Network policy → Reset all rules…)

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 5.4 | Select a preset, click **Reset all rules…** | `window.confirm` appears naming the preset |
| 5.5 | Confirm | "Rules reset — default preset is now …" + restart offer; custom rules gone | `sbx policy ls` |
| 5.6 | Cancel the confirm | Nothing happens |
| 5.7 | Command hangs/prompt differs | Times out (~20s) with an error rather than hanging the app |

### sbx reset — DESTRUCTIVE (Settings → Runtime → Danger zone)

> ⚠️ Deletes ALL sandboxes and their contents. Run only on a disposable machine
> state. Test WITH and WITHOUT "Preserve secrets".

| # | Step | Expected | Verify |
|---|------|----------|--------|
| 5.8 | Button disabled until confirmation typed | "Reset everything" disabled until textbox = `reset` |
| 5.9 | Type `reset`, keep **Preserve secrets** checked, click | Runs `sbx reset --preserve-secrets`; success message; `sbx ls` empty; secrets retained | `sbx ls`, `sbx secret …` |
| 5.10 | Repeat with **Preserve secrets** unchecked | Runs `sbx reset`; secrets also cleared |
| 5.11 | After reset, refresh sandbox list in app | List reflects the wiped state (no stale rows) |
| 5.12 | Confirmation is case-insensitive/trimmed | `Reset ` / `RESET` accepted |

---

## Regression sweep

- Existing allow-from-block toast (PolicyBlockToaster) still adds a rule.
- Ports read-only display in HomePage/Info unchanged for existing mappings.
- Kit create/edit (Create & Pack / Save & Pack) still validates+packs.
- General settings (theme, sounds, polling) unaffected by the new `imagePaste` field.
- Runtime tab version/auth/update sections still work.

## Sign-off

- [ ] Smoke S1–S3
- [ ] Phase 1 (1.1–1.6)
- [ ] Phase 2 (2.1–2.7)
- [ ] Phase 3 (3.1–3.8)
- [ ] Phase 4 (4.1–4.5)
- [ ] Phase 5 runtime settings (5.1–5.3)
- [ ] Phase 5 policy reset (5.4–5.7)
- [ ] Phase 5 sbx reset (5.8–5.12) — disposable state
- [ ] Regression sweep
- [ ] `npm run typecheck` clean
