# den — TODO

Upcoming features and tasks. Grouped by intent; roughly ordered within each group.
See [`spec.md`](spec.md) for the architectural context behind these.

Legend: `[ ]` open · `[~]` in progress · `[x]` done (keep briefly for context)

---

## Verify at runtime (no Docker/GUI in the dev env — needs a manual app run)

These shipped but were only typecheck/build-verified. Confirm in the running app:


## Near-term features
- [ ] **Onboarding flow**
- [ ] **Release channels (Stable / Nightly)** — in-app channel switching instead of
      leaking the Homebrew cask conflict to users. Design already drafted in
      [`release-channels-proposal.md`](release-channels-proposal.md).
- [ ] **GIT Flows**
      - [ ] Commit, Delete, Push
      - [ ] **PR flow depth** — let the user pick base branch / edit PR title+body before
      opening, and surface the created PR inline (not just open the browser).
      - [ ] **Diff viewer** — view an agent's changes as a real diff (not just `git status`
      names) from the Changes tab.
- [ ] **Test Secrets: more providers via 1Password** and a "test resolve" button that confirms
      an `op://` reference resolves before saving.
- [ ] **Search / command palette** (⌘K) across sandboxes, groups, kits, and actions.
- [ ] **VSCode Integration** Following https://github.com/DockerSolutionsEngineering/ai.gov.sbx-vscode-ssh 
- [ ] **Add an integrated terminal** 

## Platform & release
- [ ] **Signing & notarization** for macOS distribution.
- [ ] **Windows pass** — `build:win` exists but the app is exercised on macOS; audit
      paths, `op`/`brew` assumptions, tray, and PTY behavior on Windows.
- [ ] **Auto-update** for den itself (electron-builder / update feed).


## Tech debt & quality
- [ ] **Automated tests** — there is none today. Start with unit tests for the pure logic
      (kit spec parsing, ordering/grouping, semver compare) and a smoke test for IPC
      wiring.
- [ ] **Integration tests** Write integration test with Playwright
- [ ] **Dropdown/control consistency audit** — a pass was done for New Sandbox; sweep the
      rest of the app for size/padding/radius drift.
- [ ] **Error surfacing** — replace remaining `alert()`/`confirm()` in flows (e.g.
      bring-work-home) with in-app toasts/modals for a consistent voice.
- [ ] **Loading/empty/error states** — make sure every async panel has all three.

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
