# den — TODO

Upcoming features and tasks. Grouped by intent; roughly ordered within each group.
See [`spec.md`](spec.md) for the architectural context behind these.

Legend: `[ ]` open · `[~]` in progress · `[x]` done (keep briefly for context)

---

## Verify at runtime (no Docker/GUI in the dev env — needs a manual app run)

These shipped but were only typecheck/build-verified. Confirm in the running app:

- [ ] **Drag-to-reorder** sandboxes within a group (insertion line, drops correctly incl.
      last position) and **drag-to-move** across groups (group highlights).
- [ ] **Group reorder** by dragging a group header (insertion line in the gap).
- [ ] **Collapsed sidebar rail** shows the plug icon + tooltip, no empty footer box.
- [ ] **Custom-color swatch** renders as a clean circle (no square-in-circle) in the
      accent picker and the sandbox icon/color picker.
- [ ] **Kit capability columns** align table-style across rows in the full list.
- [ ] The `--clone` **bring-work-home** flow (fetch → PR / merge → optional delete)
      end-to-end against a real repo.

## Near-term features

- [ ] **Release channels (Stable / Nightly)** — in-app channel switching instead of
      leaking the Homebrew cask conflict to users. Design already drafted in
      [`release-channels-proposal.md`](release-channels-proposal.md).
- [ ] **Bulk actions** — start/stop/delete across a multi-select of sandboxes (today it's
      per-sandbox or per-group).
- [ ] **Group polish** — collapse/expand a group section; show running/total count per
      group header; empty-group affordance.
- [ ] **PR flow depth** — let the user pick base branch / edit PR title+body before
      opening, and surface the created PR inline (not just open the browser).
- [ ] **Diff viewer** — view an agent's changes as a real diff (not just `git status`
      names) from the Changes tab.
- [ ] **Secrets: more providers via 1Password** and a "test resolve" button that confirms
      an `op://` reference resolves before saving.
- [ ] **Search / command palette** (⌘K) across sandboxes, groups, kits, and actions.

## Platform & release

- [ ] **Windows pass** — `build:win` exists but the app is exercised on macOS; audit
      paths, `op`/`brew` assumptions, tray, and PTY behavior on Windows.
- [ ] **Auto-update** for den itself (electron-builder / update feed).
- [ ] **Signing & notarization** for macOS distribution.

## Tech debt & quality

- [ ] **Automated tests** — there is none today. Start with unit tests for the pure logic
      (kit spec parsing, ordering/grouping, semver compare) and a smoke test for IPC
      wiring.
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
