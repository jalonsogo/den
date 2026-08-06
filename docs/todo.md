# den — TODO

Upcoming features and tasks. Grouped by intent; roughly ordered within each group.
See [`spec.md`](spec.md) for the architectural context behind these,
[`sbx-quirks.md`](sbx-quirks.md) for sbx/API errors already diagnosed (check it
before re-debugging one), and [`errors.md`](errors.md) for the operator runbook.

Legend: `[ ]` open · `[~]` in progress · `[x]` done (keep briefly for context)

---

## Verify at runtime (no Docker/GUI in the dev env — needs a manual app run)

These shipped but were only typecheck/build-verified. Confirm in the running app:

- [ ] **Governance support message** (sbx v0.37) — the key name in
      `sbx policy check network --json` could not be observed: it only appears when
      governance is *active*, which needs an org-managed policy. `governanceSupportMessage()`
      in `src/main/index.ts` reads several plausible spellings (`support_message`,
      `supportMessage`, `contact`, …) and shows nothing if none match. Confirm against a
      real governed host and pin the key.
- [ ] **`sbx skills import` real-run wording** — the `--dry-run` output is parsed against
      verified output ("Would import skill …"), but the non-dry verb wasn't observed. The
      parser accepts would import / importing / imported; confirm and narrow.
- [ ] **`sbx setup ssh` write** — not run during development (it edits `~/.ssh/config`).
      Confirm the button writes the managed block and that the duplicate-block warning
      clears after removing a stale one.


## Near-term features
- [ ] **Onboarding flow**
- [ ] **Release channels (Stable / Nightly)** — in-app channel switching instead of
      leaking the Homebrew cask conflict to users. Design already drafted in
      [`release-channels-proposal.md`](release-channels-proposal.md).
- [ ] **Search / command palette** (⌘K) across sandboxes, groups, kits, and actions.
- [x] **VSCode Integration** — done via sbx v0.37's native SSH support (`sbx setup ssh` +
      `<name>.sbx`), which removes the need for the custom bridge in
      https://github.com/DockerSolutionsEngineering/ai.gov.sbx-vscode-ssh. Settings → Runtime
      runs the setup; per-sandbox actions open VS Code / Cursor over that host.
- [ ] **Add an integrated terminal** 

## Platform & release
- [ ] **Windows pass** — `build:win` exists but the app is exercised on macOS; audit
      paths, `op`/`brew` assumptions, tray, and PTY behavior on Windows.
- [ ] **Auto-update** for den itself (electron-builder / update feed).


## Tech debt & quality
- [ ] **Automated tests** — there is none today. Start with unit tests for the pure logic
      (kit spec parsing, ordering/grouping, semver compare) and a smoke test for IPC
      wiring.

- [ ] **Dropdown/control consistency audit** — a pass was done for New Sandbox; sweep the
      rest of the app for size/padding/radius drift.
- [ ] **Error surfacing** — replace remaining `alert()`/`confirm()` in flows (e.g.
      bring-work-home) with in-app toasts/modals for a consistent voice.
- [ ] **Loading/empty/error states** — make sure every async panel has all three.

## Tests
- [ ] **Integration tests** Write integration test with Playwright
- [ ] **Test Secrets: more providers via 1Password** and a "test resolve" button that confirms
      an `op://` reference resolves before saving.

## Deferred (intentionally not doing yet)

- [ ] **Rename `minipit` → `den`** across IPC channels + the `window.minipit` bridge.
      Mechanically safe (all channel names are static literals; durable electron-store
      keys are *not* `minipit`-prefixed), **but** ~22 `localStorage` keys use the
      `minipit:` prefix — renaming them resets user prefs (theme, accent, sort, sidebar
      width, sandbox order/colors/icons/groups) unless a one-time migration copies old
      keys to new. Plan when we do it: rename IPC + global to `den`, add a localStorage
      migration shim, keep durable keys as-is. Owner requested we hold off for now.

---

_Last updated: 2026-07-04._
