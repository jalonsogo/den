# Fix Plan — `den`

> Engineering review remediation plan for `den` (v0.6.2), an Electron + React GUI over the `sbx` CLI.
> Each item below is written as a **self-contained prompt**: hand any single block to an implementation agent (or use it as your own checklist). Context, exact files/lines, the task, and acceptance criteria are included so no prior conversation is needed.
>
> **Threat-model note reused throughout:** the renderer only loads bundled local content, so the security items require a renderer compromise (e.g. XSS via rendered agent output) as step one. That first step is more plausible here than in a typical Electron app because this app's core job is rendering output from untrusted AI agents, and `rehype-raw` is enabled (raw HTML in markdown). Treat the High security cluster as "fix before wider distribution," not "drop everything."
>
> **Line numbers** are from the review snapshot and may drift — grep for the cited symbol if a line doesn't match.

## Recommended order

1. SEC-3 (delete raw bridge — one line, closes the exploit amplifier)
2. SEC-1 + SEC-2 (path containment + settings allowlist)
3. BUG-1, PERF-1, BUG-2 (the three user-visible bugs)
4. CLEAN-1 (strip shipped prototype code / hardcoded email)
5. INFRA-1 (CI typecheck-on-push)
6. Everything else (Medium/Low), scheduled

---

# 🔴 HIGH

## SEC-1 — Contain kit IPC handlers to the kits root

**Severity:** High · **Area:** Security · **Files:** `src/main/index.ts`

**Context.** Several kit handlers operate on renderer-supplied host paths with no containment check. `ipcMain.handle('minipit:remove-kit', (_, dir) => fs.rmSync(dir, { recursive: true, force: true }))` (~line 1716) will delete *any* directory the user owns. The name sanitizer used by `kit-import`/`import-contrib-kit` — `replace(/[^A-Za-z0-9._-]/g, '-')` — **allows `..`**, so `name = '..'` makes `dest = join(kitsRoot(), '..')` (the userData dir), and the error path (~line 2034) then `rmSync`s the escaped destination. `create-kit` (~1624), `update-kit` (~1683), `kit-import` (~1926), `import-contrib-kit` (~2006) all share this shape (arbitrary write/delete).

**Task.**
- Add a helper, e.g. `assertInsideKitsRoot(p: string): string` that computes `const resolved = path.resolve(p)` and throws unless `resolved === kitsRoot() || resolved.startsWith(kitsRoot() + path.sep)`. Return `resolved`.
- Add a name validator that rejects any segment that is `.` or `..` or empty, in addition to the existing character sanitize (sanitize is not containment — validate too).
- Apply the guard at the top of every handler that derives a path from renderer input: `remove-kit`, `create-kit`, `update-kit`, `kit-import`, `import-contrib-kit`, and the error-path `rmSync` at ~2034 (guard `dest` before deleting).
- Keep the existing `{ ok: false, error }` / throw convention that the specific handler already uses; don't change the response shape.

**Acceptance criteria.**
- `remove-kit` / `create-kit` / `update-kit` with a `dir`/`name` resolving outside `kitsRoot()` throws before touching the filesystem.
- `name === '..'` (or containing a `..` segment) is rejected in every import/create path.
- Legitimate kit CRUD still works (round-trip create → edit → import → remove a real kit).
- `npm run typecheck` passes.

---

## SEC-2 — Allowlist `save-settings` keys and validate `sbxPath`

**Severity:** High · **Area:** Security · **Files:** `src/main/index.ts` (`save-settings` ~2544; `getSbxPath` ~43)

**Context.** `save-settings` loops `for (const [k,v] of Object.entries(settings)) store.set(k, v)` with no allowlist. Setting `sbxPath: '/tmp/evil'` persists across restarts, and the 5-second poll (`startPolling` ~2915) then `execFile`s that binary forever → persistent arbitrary binary execution. `getSbxPath()` returns the stored value unconditionally.

**Task.**
- Define an explicit allowlist of settable setting keys (the ones the Settings UI actually writes). Reject or ignore any key not on it.
- For `sbxPath` specifically: before persisting, validate it exists, is a regular file, and (ideally) is executable / matches a known install location; otherwise reject. Consider requiring it to come from a native file-picker dialog rather than a free-text field.
- In `getSbxPath()`, defensively re-validate the stored path before use; fall back to the discovered-binary path if the stored one is invalid.

**Acceptance criteria.**
- `saveSettings({ sbxPath: '/tmp/evil' })` (a non-existent or non-file path) is rejected and never persisted.
- `saveSettings({ arbitraryKey: 1 })` does not write `arbitraryKey`.
- Legitimate settings the UI writes still persist and reload.
- `npm run typecheck` passes.

---

## SEC-3 — Drop the raw `ipcRenderer` bridge from preload

**Severity:** High · **Area:** Security · **Files:** `src/preload/index.ts:225`

**Context.** `contextBridge.exposeInMainWorld('electron', electronAPI)` (from `@electron-toolkit/preload`) exposes unrestricted `ipcRenderer.invoke/send/on` to the renderer, nullifying the value of the curated `minipit` API — any injected script can call any channel directly, including the SEC-1/SEC-2 handlers. This is the amplifier that turns those from "needs a specific channel" into "call anything."

**Task.**
- Grep the renderer for `window.electron` usage. If nothing uses `window.electron.ipcRenderer`, remove the `exposeInMainWorld('electron', electronAPI)` line entirely.
- If something does use it, replace those call sites with dedicated `minipit`-bridge methods and then remove the raw exposure.

**Acceptance criteria.**
- `window.electron` is no longer defined in the renderer (or is defined without a raw `ipcRenderer`).
- App boots and all features that used IPC still work.
- `npm run typecheck` passes.

---

## BUG-1 — Delete flow must use `setDeleting` so the poll doesn't revert it

**Severity:** High · **Area:** Correctness (user-visible today) · **Files:** `src/renderer/src/App.tsx:140`, `src/renderer/src/store.ts:390` (`deleteGroup`), `src/renderer/src/lib/featureChanges.ts:27` (`bringSandboxToHost`)

**Context.** Three call sites set `updateSandbox(id, { status: 'deleting' })` + `deleteSandbox(name)` but skip `setDeleting(id, true)`. `setSandboxes` (store.ts ~479) only preserves the "deleting" status for ids in `deletingIds`, so the next 5s poll (`sbx ls` still lists the sandbox during teardown) flips the row back to running/stopped mid-delete, and the user can re-trigger stop/delete on a sandbox being destroyed. The correct pattern already exists at `ContextMenu.tsx:227`.

**Task.**
- At all three sites, call `setDeleting(id, true)` (and clear it appropriately on failure) exactly as `ContextMenu.tsx:227` does. Prefer routing all three through a single shared store action so the pattern can't drift again.

**Acceptance criteria.**
- Deleting a sandbox via Cmd+X, group delete, and feature-integrate keeps the row in "deleting" across at least one poll cycle until it actually disappears.
- A sandbox mid-delete cannot be re-stopped/re-deleted.
- `npm run typecheck` passes.

---

## PERF-1 — Memoize ANSI parsing in SbxRuntimePanel

**Severity:** High · **Area:** Performance (user-visible today) · **Files:** `src/renderer/src/components/SbxRuntimePanel.tsx:529, 554`

**Context.** `terminalNodes(diagOut)` and `terminalNodes(daemonOut)` are called inline in JSX. `terminalNodes` → `terminalGrid` walks the whole buffer character-by-character (~lines 109-172). Buffers grow per IPC chunk (capped 200 KB), so every chunk re-parses the entire accumulated stream from scratch — O(n²) over a stream. Any unrelated state change in this 655-line component (e.g. typing in the reset-confirm input ~600) also re-parses both buffers.

**Task.**
- Wrap both calls in `useMemo(() => terminalNodes(diagOut), [diagOut])` / `[daemonOut]`.
- If feasible, parse incrementally instead of re-parsing the full buffer, but memoization alone resolves the reported jank.

**Acceptance criteria.**
- A long `sbx diagnose` or daemon restart no longer janks the Settings page.
- Typing in the reset-confirm input does not re-parse the terminal buffers (verify with a render profiler or a temporary log).
- `npm run typecheck` passes.

---

## BUG-2 — Surface creation errors after "Run in background"

**Severity:** High · **Area:** Correctness (silent data loss) · **Files:** `src/renderer/src/components/modals/NewSandboxModal.tsx:189-193, 234-239`

**Context.** "Run in background" calls `dismiss()` (unmounts the modal) while creation continues. If `createSandbox` later rejects, the catch runs `removeCreatingSandbox(finalName)` then `setCreating(false)`/`setError(...)` on an unmounted component — the creating row vanishes and the error is set on state nobody renders. The sandbox disappears with zero feedback.

**Task.**
- Route creation failures to a global surface (store toast / notification) instead of local component state, so the error shows even after the modal is dismissed.
- Guard the local `setState` calls against the unmounted case (only touch local state if still mounted), and always emit the global error regardless of mount state.
- Related: coordinate with STATE-2 (fire-and-forget mutations need reconciliation) — the same toast surface can serve both.

**Acceptance criteria.**
- Trigger a creation failure after choosing "Run in background" → a visible global error appears; the failed "creating" placeholder is removed.
- No "setState on unmounted component" warning.
- `npm run typecheck` passes.

---

## A11Y-1 — Make primary navigation and menus keyboard-accessible

**Severity:** High · **Area:** Accessibility · **Files:** `ContextMenu.tsx:253-336`, `Sidebar.tsx:367-377`, `TerminalPanel.tsx:339-344`, `SettingsPage.tsx:127-129`, plus `SandboxDetail.tsx:168-179`, `HomePage.tsx:178,222-226`, `KitsPage.tsx:342,608`

**Context.** The app's primary navigation and menus are mouse-only `<div onClick>` with no `role`, `tabIndex`, or key handling: the sandbox/group context menu, sidebar nav items, terminal Agent/Shell tabs, settings tabs, menu items, and sandbox rows. Several `<a onClick>` have no `href`. The correct pattern already exists in the codebase — `FieldSelect.tsx`, `ChangesList.tsx`, and `InfoPanel.tsx` accordions use real `<button>`s.

**Task.**
- Convert click-only interactive divs to `<button>` (or add `role`, `tabIndex={0}`, and Enter/Space handlers where a button isn't structurally possible).
- Give the context menu `role="menu"` / `role="menuitem"`, arrow-key navigation, Enter to activate, Escape to close, and focus management on open.
- Give tab strips (terminal, settings) `role="tab"`/`role="tablist"` with arrow-key movement.
- Replace `<a onClick>` without `href` with `<button>`.
- Model the conversions on `FieldSelect.tsx`.

**Acceptance criteria.**
- Every listed surface is reachable and operable by keyboard alone (Tab to focus, Enter/Space to activate, Escape/arrows in menus).
- Screen-reader roles are announced for menus and tabs.
- No visual regression in the existing mouse interactions.

---

# 🟠 MEDIUM

## SEC-4 — Add `will-navigate` guard and window-open handler to the editor window

**Severity:** Medium · **Area:** Security · **Files:** `src/main/index.ts:1253-1261` (main window), `2341-2361` (editor window), `1269` (existing open handler)

**Context.** `sandbox: false` on both windows means the preload has full Node access. There is no `will-navigate` handler anywhere, so an in-frame navigation (e.g. an `<a href>` without `target=_blank` in rendered agent content) could point a window at a remote origin that then runs with the preload attached. The editor window (`open-file-window`) has **no** `setWindowOpenHandler` at all.

**Task.**
- Add `webContents.on('will-navigate', (e, url) => { if (!isAppUrl(url)) e.preventDefault() })` to both windows.
- Mirror the main window's `setWindowOpenHandler` (deny/openExternalSafe) onto the editor window.
- Evaluate whether `sandbox: true` is feasible — the preload only uses `ipcRenderer`/`webFrame`, which work sandboxed. If feasible, flip it; if not, note why in a comment.

**Acceptance criteria.**
- Attempting to navigate either window to a non-app URL is blocked; external links still open in the system browser via the existing safe path.
- Editor window `window.open` is handled, not defaulted.
- App still loads its own content normally.

---

## SEC-5 — Constrain `start-log-tail` and `open-path` to known roots

**Severity:** Medium · **Area:** Security · **Files:** `src/main/index.ts:2483-2489` (`start-log-tail`), `2334-2338` (`open-path`)

**Context.** `spawn('tail', ['-n','500','-f', path])` will stream any user-readable host file to the renderer (`~/.ssh/id_ed25519`, browser cookie DBs). `list-logs` (~2470) correctly enumerates only the sandboxd log dir, but `start-log-tail` doesn't enforce membership. `shell.openPath(expanded)` opens/launches any host path (on macOS, an `.app` bundle launches it).

**Task.**
- `start-log-tail`: assert the requested path is one of the entries `list-logs` returns (or is contained in the sandboxd log directory) before tailing.
- `open-path`: constrain targets to known workspace roots, or otherwise validate before `shell.openPath`.

**Acceptance criteria.**
- Tailing a path outside the sandboxd log dir is rejected.
- Legitimate log tailing still works.
- Opening an out-of-scope host path is rejected.

---

## SEC-6 — Add IPC sender validation

**Severity:** Medium (Low in isolation; Medium as the other half of the SEC-1/2/3 chain) · **Area:** Security · **Files:** `src/main/index.ts` (all `ipcMain.handle`)

**Context.** No handler checks `event.senderFrame`/`event.sender`. Benign with only local windows, but combined with a missing navigation guard it's the second half of a working exploit chain.

**Task.**
- Track the ids of the app's own windows and add a shared guard (e.g. a `wrapHandler` that throws unless `event.sender.id` is known, or a `senderFrame.url` origin check).

**Acceptance criteria.**
- Handlers reject calls from unknown senders.
- All legitimate in-app IPC still works.

---

## RES-1 — Kill `eventTails` children on quit

**Severity:** Medium · **Area:** Resource management · **Files:** `src/main/index.ts:3007-3012` (`before-quit`), `eventTails` defined ~827/895

**Context.** `before-quit` kills `sbxProcesses`, `ptyMap`, `logTail`, and clears `pollTimer`, but never iterates `eventTails` — one long-lived `sbx exec <name> sh -c 'tail -n0 -F ~/.den/events.jsonl'` host process per attached sandbox is orphaned at quit (they die later on SIGPIPE).

**Task.** Add `for (const p of eventTails.values()) p.kill()` to the `before-quit` cleanup.

**Acceptance criteria.** After quitting with sandboxes attached, no orphaned `tail`/`sbx exec` event-tail processes remain.

---

## PERF-2 — Replace `create-sandbox` wall-clock timeout with an inactivity timeout

**Severity:** Medium · **Area:** UX/correctness · **Files:** `src/main/index.ts:1548`

**Context.** `setTimeout(() => { proc.kill(); reject('sbx create timed out') }, 120000)` — a cold create pulling a multi-GB template over a slow link routinely exceeds 2 minutes; the user sees a spurious failure while the pull may continue daemon-side, leaving a half-created sandbox. Output is already streamed.

**Task.** Switch to an inactivity timeout: reset the timer on each output chunk; only fail after N seconds of *no* output.

**Acceptance criteria.** A slow-but-progressing create is not killed; a genuinely hung create (no output for N s) still fails cleanly.

---

## PERF-3 — Stream large dropped files by path instead of through IPC

**Severity:** Medium · **Area:** Performance · **Files:** `src/main/index.ts:2373-2394` (`copy-into`, 500 MB cap), `2862-2884` (`agent-drop-file`, 100 MB cap)

**Context.** Dropped-file bytes are read in the renderer and passed as `Uint8Array` through `ipcRenderer.invoke`, so a 500 MB file exists simultaneously in the renderer heap, the IPC serialization buffer, and a main-process Buffer — an OOM/jank source. The files come from host drag-and-drop, so the host path is available. Also: `copy-into`'s sanitized filename allows spaces but `agent-drop-file`'s doesn't (inconsistent).

**Task.**
- Pass the host file path from the renderer and let the main process stream from disk (or use `sbx cp`) instead of round-tripping bytes.
- Unify the filename sanitization between the two handlers.

**Acceptance criteria.** Dropping a large file no longer spikes renderer/main memory by the file size; both handlers sanitize filenames identically; drops still land correctly in the sandbox.

---

## STATE-1 — Delete the dead `log-line` pipeline

**Severity:** Medium · **Area:** Dead code + latent bug · **Files:** `src/renderer/src/store.ts:595-600` (`appendLog`), `App.tsx:46-50`, `store.ts:475-476` (logsById merge in `setSandboxes`), `types.ts:56-60,124,383`, `preload/index.ts:142`

**Context.** `minipit:log-line` is listened for in preload but never emitted by main (grep every `webContents.send` in `main/index.ts`). So `appendLog`, `Sandbox.logs`, `LogLine`, and the merge in `setSandboxes` are all vestigial and no component reads `.logs`. Worse, the handler force-sets `status: 'running'`, which deletes a sandbox's `stopHolds` entry (store.ts ~572) — if this channel is ever wired up, a trailing buffered log line after "Stop" defeats the 15s stop-grace window.

**Task.** Remove the listener, `appendLog`, the `logsById` merge, the `LogLine` type, and `Sandbox.logs` — the whole dead chain.

**Acceptance criteria.** No reference to `log-line`/`appendLog`/`LogLine`/`.logs` remains; app builds and behaves identically; `npm run typecheck` passes.

---

## STATE-2 — Add reconciliation/rollback for fire-and-forget mutations

**Severity:** Medium · **Area:** State correctness · **Files:** `src/renderer/src/store.ts:370,377,389,418` (`groupsSet`), `347,357` (`projectConfigSet`)

**Context.** Unlike the rest of the store (which at least `.catch(() => {})`), these group/project-config mutations are bare promises: a rejection becomes an unhandled promise rejection, and since local state was already updated optimistically, renderer state silently diverges from the durable main-process store until restart (`loadGroups`/`syncProjectConfig` run only at startup).

**Task.** For each, add a `.catch` that either rolls back the optimistic update or re-syncs from main, and surface a toast (reuse the BUG-2 surface).

**Acceptance criteria.** A rejected group/project-config mutation either rolls back or re-fetches; no unhandled rejection; user sees an error.

---

## STATE-3 — Fix editor-window theme switching (stale palette)

**Severity:** Medium · **Area:** Correctness (color-themes branch) · **Files:** `src/renderer/src/FileEditorWindow.tsx:142-149`, `main.tsx:23`, `lib/themes.ts:311-322`

**Context.** At startup `main.tsx` runs `applyTheme(accent, resolvedTheme)`, which sets `--bg/--t1/--sb/...` as inline styles on `<html>`. The editor window's `storage`/`matchMedia` handler only re-sets `data-theme` and never re-runs `applyTheme`, so switching light↔dark or changing the color theme in the main window while the editor is open leaves stale inline palette vars overriding the stylesheet → unreadable mixed palette until reopened.

**Task.** In the editor window's theme-follow handler, re-run `applyTheme(...)` (not just `data-theme`) so inline palette vars update.

**Acceptance criteria.** With the editor open, toggling dark↔light or changing color theme in the main window updates the editor's full palette live.

---

## BUG-3 — Show save failures in the file editor

**Severity:** Medium · **Area:** Correctness (data loss) · **Files:** `src/renderer/src/FileEditorWindow.tsx:212-223, 285-286`

**Context.** `save()`'s catch sets `err`, but `err` only renders in the `view === 'error'` branch and `view` stays `'code'`. A rejected `writeFile` (sandbox stopped, path deleted) looks like a successful save except the dirty dot — the edit silently didn't persist.

**Task.** On save failure, show an inline error banner in the code view (or a toast), keep the dirty state, and do not clear the "unsaved" indicator.

**Acceptance criteria.** A failed save shows a visible error and preserves the dirty indicator; a successful save clears it.

---

## STATE-4 — Model sandbox identity once (`id` vs `name`)

**Severity:** Medium · **Area:** Data modeling · **Files:** `src/main/index.ts:373` (`id: raw.name`); `store.ts` (`stopHolds`/`deletingIds`/`files` keyed by `id` ~43,48,42; `agentActivity`/`sandboxIcons`/`sandboxColors`/`sandboxGroups`/`sandboxChanges` keyed by `name` ~76-107); `App.tsx:91`; also UI refs `SandboxDetail.tsx:76`, `ContextMenu.tsx:158,186`

**Context.** `id` is literally `raw.name`. Store maps are keyed inconsistently on the two, and call sites mix them freely. Everything works only because the strings are identical; the day `id` becomes a real id or a sandbox is renamed, tray jump, the (now-deleted) log handler, and every cross-keyed lookup break silently. No type distinction guards it.

**Task.** Pick one key (recommend `id` everywhere), make every store map and call site consistent, and consider a branded type (`type SandboxId = string & { __brand }`) so mixing is a compile error. Low-risk first pass: just unify on one key and add a comment; branded type is a follow-up.

**Acceptance criteria.** All store maps and call sites use the same key consistently; `npm run typecheck` passes; behavior unchanged.

---

## PERF-4 — Narrow the `App` store subscription

**Severity:** Medium · **Area:** Performance · **Files:** `src/renderer/src/App.tsx:23`

**Context.** `const { activePage, modal, ...actions } = useStore()` re-renders `App` and its whole tree (Toolbar/Sidebar/page tree) on *every* store change: each 5s poll (`setSandboxes` allocates new arrays), every `agent-activity` ping, every toast/policy block. Only `activePage`/`modal` are rendered; the rest are stable actions.

**Task.** Select only `activePage` and `modal` via narrow selectors; pull stable actions via `useStore.getState()` or individual selectors.

**Acceptance criteria.** `App` no longer re-renders on unrelated store changes (verify with profiler); navigation/modals still work.

---

## STATE-5 — Guard out-of-order responses in change/git refreshers

**Severity:** Medium · **Area:** State correctness · **Files:** `store.ts:301-305` (`refreshSandboxChanges`), `293-299` (`loadGitInfo`); UI equivalents `InfoPanel.tsx:80-91` (policy + applied kits), `ChangesReview.tsx:33-42` (review summary)

**Context.** Rapid events fire overlapping async calls; if responses land out of order, stale data wins (e.g. sandbox A's policy renders under sandbox B). The fix pattern (`let cancelled = false`) already exists in `NewSandboxModal.tsx:161-171` and `NewKitModal.tsx:221-231` — just applied inconsistently.

**Task.** Add a per-key sequence guard or `cancelled` flag / AbortController to each listed async loader so only the latest response is applied. Prefer a small shared helper.

**Acceptance criteria.** Fast sandbox switching never renders one sandbox's data under another; rapid file-change events show the latest count.

---

## STATE-6 — Fix Sidebar polling stale closure + visibility

**Severity:** Medium · **Area:** React correctness · **Files:** `src/renderer/src/components/Sidebar.tsx:337-346`

**Context.** The polling effect deps are `[runningKeys]` (a joined name string) but the 15s interval closure captures `sandboxes` from the render where the running set last changed. Array changes that don't alter the running-name set (workspace edits, metadata refreshes) leave the interval refreshing from a stale array. It also fires one `refreshSandboxChanges` (`sbx exec` git status) per running sandbox every 15s regardless of visibility.

**Task.** Read fresh state via `useStore.getState()` inside the tick (or include correct deps). Consider skipping refreshes when the window/sidebar isn't visible.

**Acceptance criteria.** The interval always operates on current sandbox state; no redundant git-status calls when nothing running changed.

---

## REACT-1 — Remove setState-during-render in ContextMenu

**Severity:** Medium · **Area:** React correctness · **Files:** `src/renderer/src/components/ContextMenu.tsx:95`

**Context.** `if (!group) { setContextMenu({ visible: false }); return null }` calls the zustand setter synchronously in the render body. If a group is deleted while its menu is open, this triggers a store update mid-render ("cannot update while rendering" warning, render churn).

**Task.** Render `null` unconditionally when `!group`, and move the `setContextMenu({ visible: false })` into a `useEffect`.

**Acceptance criteria.** No "cannot update while rendering" warning when a group is deleted with its menu open; menu closes correctly.

---

## PERF-5 — Stop KitsPage reloading on every modal close

**Severity:** Medium · **Area:** Performance · **Files:** `src/renderer/src/components/KitsPage.tsx:248`, `toggleAdd` ~74-84

**Context.** `useEffect(() => { if (modal === null) load() }, [modal, load])` re-lists all kits and re-reads/re-parses every spec file whenever *any* app modal closes (New Sandbox, secrets, prompt…), not just the kit modal. `toggleAdd` also fires one `appliedKits` IPC per sandbox on every dropdown open.

**Task.** Trigger `load()` only when the *kit-related* modal closes (track which modal), not on all modal transitions. Debounce/cache `appliedKits`.

**Acceptance criteria.** Closing unrelated modals does not re-list/re-parse kits; kit list still refreshes after kit create/edit.

---

## CLEAN-1 — Remove shipped prototype/dead code from Toolbar

**Severity:** Medium · **Area:** Cleanliness (ship-blocker for distribution) · **Files:** `src/renderer/src/components/Toolbar.tsx:6-7, 53, 87-91`

**Context.** Hardcoded personal email `ACCOUNT_EMAIL = 'javier.alonso@docker.com'`, a fake `ORGS = ['Docker','Personal']` switcher that only sets local state, a non-functional ⌘K search box, and a title for a `'projects'` page that no longer exists (no ProjectsPage in the tree). A hardcoded personal email in a shipped binary is a privacy/polish problem.

**Task.** Remove the hardcoded email (source it from the real account state, or drop the display), delete the fake org switcher and non-functional search, and remove the dead `'projects'` title branch.

**Acceptance criteria.** No hardcoded personal email in the bundle; no non-functional UI advertised; toolbar renders correctly for all real pages.

---

## CLEAN-2 — Remove dead CSS from removed features

**Severity:** Medium · **Area:** Cleanliness · **Files:** `src/renderer/src/styles/main.css:2376-~2697` (`── Projects ──`), plus `.sb-proj-pop-*`, and likely-dead `.home-card*`/`.home-stat*`, `.m-step*`, `.detail-switch*`, `.sb-acct*`

**Context.** The `── Projects ──` section (~320 lines) styles the Projects page removed in `0e714b6`; only the `.proj-cpick*` subset is still used (by `SandboxAvatar`). **Caveat:** the review's automated unused-class scan was unreliable because there is a case-variant duplicate checkout at `/Users/javieralonso/code/den` polluting greps — re-verify before deleting.

**Task.**
- First, verify each candidate class family is truly unused: grep `src/renderer/src` (the correct-case path only) for each class name across `*.tsx`/`*.ts`.
- Delete confirmed-dead rules; keep `.proj-cpick*`.
- Separately, consider consolidating selectors re-declared in multiple sections (e.g. `.sb-filter-pop`, `.mcp-custom-row` each declared ~7×) — patch-on-patch accretion.
- Also worth flagging to the user: the duplicate lowercase checkout at `/Users/javieralonso/code/den` should be cleaned up.

**Acceptance criteria.** Confirmed-dead CSS removed; no visual regression on any live page; `.proj-cpick*` retained.

---

## STRUCT-1 — Extract shared hooks/helpers for the copy-pasted patterns

**Severity:** Medium · **Area:** Maintainability · **Files:** many (see list)

**Context.** The same utility patterns are copy-pasted with drifting variants:
- **Outside-click dismiss** (12+ sites): `Sidebar.tsx:324`, `FilesPanel.tsx:223,358`, `KitsPage.tsx:87,188`, `NewSandboxModal.tsx:114,124`, `SandboxDetail.tsx:22,38`, `Toolbar.tsx:36`, `DiffView.tsx:117`, `FieldSelect.tsx:54`, `ContextMenu.tsx:69`.
- **Popup anchoring + viewport clamp** (6 sites): `Sidebar.tsx:413`, `KitsPage.tsx:74,181`, `FilesPanel.tsx:596`, `SandboxAvatar.tsx:90`, `ContextMenu.tsx:80`.
- **Capped-stream append** (4×): `SbxRuntimePanel.tsx:295,308,320`, `LogsPanel.tsx:142`.
- **Autoscroll-to-bottom** (4×): `SbxRuntimePanel.tsx:302,314,326`, `LogsPanel.tsx:200` (+ inline rAF `NewSandboxModal.tsx:211`).
- **Restart-sandbox (stop→run)** (4×, drifting status labels — ContextMenu uses `'creating'`, SandboxDetail uses `'starting'`): `KitsPage.tsx:273`, `InfoPanel.tsx:169`, `SandboxDetail.tsx:120`, `ContextMenu.tsx:181`.
- **`baseSemver`/version-compare** duplicated with two different impls: `SbxRuntimePanel.tsx:13` vs `HomePage.tsx:10`.
- **Modal scaffolding** (overlay/`m-hdr`/`m-body`/`m-ftr` + stopPropagation + error banner) across all 5 modals.

**Task.** Extract: `useOutsideClick(ref, onClose)`, `useAnchoredPopup(...)`, `appendCapped(buf, chunk, cap)`, `useAutoScroll(ref, dep)`, a `restartSandbox(id)` store action (single canonical status sequence), one `semverCompare`, and a `<Modal>` shell. Migrate call sites to them.

**Acceptance criteria.** Each pattern has one implementation; call sites use it; restart shows a consistent status label everywhere; `npm run typecheck` passes; behavior unchanged.

---

## STRUCT-2 — Split the main-process monolith

**Severity:** Medium · **Area:** Maintainability · **Files:** `src/main/index.ts` (3,012 lines)

**Context.** `setupIPC` alone is ~1,400 lines. The same spawn-collect-stream-with-timeout promise wrapper is hand-rolled 6+ times: `create-sandbox` ~1541, `docker-login` ~1760, `diagnose` ~1811, `kit-import`'s `run` ~1930, `import-contrib-kit`'s `run` ~2010, `sbx-update` ~2615, `docker-account` ~1731. The three "find binary in brew prefixes" functions (`getSbxPath`/`getBrewPath`/`getOpPath`) duplicate each other.

**Task.** Extract one shared `runStreaming(bin, args, { send, timeout })` helper and one `errMsg()` formatter. Collapse the three binary-finders into `resolveBin(candidates)`. Split into modules: `sbx.ts`, `kits.ts`, `git-review.ts`, `secrets-oauth.ts`, `policy.ts`, `agent-session.ts`, `tray-menu.ts`, `settings.ts`, plus per-domain IPC registration. Do this incrementally, keeping behavior identical.

**Acceptance criteria.** `main/index.ts` becomes a thin bootstrap; each domain lives in its own module; `runStreaming`/`resolveBin`/`errMsg` are used everywhere; `npm run typecheck` passes; app behaves identically.

---

## STRUCT-3 — Split oversized components

**Severity:** Medium · **Area:** Maintainability · **Files:** `KitsPage.tsx` (629), `Sidebar.tsx` (680), `NewSandboxModal.tsx` (577)

**Context.** `KitsPage` has ~28 `useState` across four features (library table, inline spec editor, push-to-Hub form, contrib gallery). `Sidebar` holds filter popup, two drag-and-drop systems coordinated via a module-global `dragSbx` (line 18), resize, and persistence. `NewSandboxModal` has three interacting name/workspace-derivation effects (143-157) guarded by `nameEdited`/`wsEdited` flags.

**Task.** Extract sub-components: KitsPage → `KitEditor`, `ContribGallery`, `PushToHubForm`; Sidebar → `SidebarFilter`, `SandboxDragList`, `GroupDragList`, `SidebarResizer`; consider modeling NewSandboxModal's name derivation as an explicit reducer.

**Acceptance criteria.** Each extracted component owns its own state; parent files shrink substantially; behavior unchanged; `npm run typecheck` passes.

---

# 🟡 LOW

## LOW-1 — Error-path state assumptions in keyboard shortcuts
**Files:** `App.tsx:131-136` (Cmd+R), `:129` (Cmd+S). Catch sets `status:'running'` regardless of which half of stop→run failed (also clears the stop hold); self-corrects only at next poll. **Task:** in the catch, re-fetch actual status or set an "unknown" state rather than assuming `'running'`.

## LOW-2 — Stale-cache shows phantom sandboxes forever
**Files:** `src/main/index.ts:411-426`. On persistent `sbx ls` failure the UI renders `lastGoodSandboxes` indefinitely and `updatePowerBlocker` is never re-evaluated. **Task:** after N consecutive failures, surface an error state and re-evaluate the power blocker.

## LOW-3 — Unvalidated localStorage theme casts diverge between entry points
**Files:** `store.ts:8,195,7` vs `main.tsx:8-13`. A corrupted `minipit:themePref` is passed through by `resolveTheme` and stamped into `data-theme`; the two startup paths handle bad input differently. **Task:** validate against the known union with a safe fallback in one shared function used by both paths.

## LOW-4 — Duplicated density constants / theme resolution across entry points
**Files:** `main.tsx:15-21` (re-hardcodes `1.1`/`1.2`/clamp `0.5–2` with a "keep in sync with store.ts" comment), `store.ts:13-18` (already exports the constants), `FileEditorWindow.tsx:110-115` (third copy of theme-pref resolution). **Task:** import the exported constants and a shared `resolveThemePref()` in all three entry points.

## LOW-5 — Unpruned caches for deleted sandboxes
**Files:** `store.ts:92-94,42,103` (`gitInfo`/`sandboxChanges`/`files`/`policyBlocks`). `agentActivity` is pruned in `setSandboxes` (~519) but these aren't. **Task:** prune these maps in `setSandboxes` the same way.

## LOW-6 — Whole Lucide icon map bundled eagerly
**Files:** `lib/iconSet.ts:3,8` (`icons as LUCIDE`, ~1500 icons, `as unknown as Record<...>` cast). **Task:** lazy-load the full set for the browse-all picker; keep a small static set for common icons.

## LOW-7 — Type over-promising / unsafe casts
**Files:** `App.tsx:27,40,79`; `types.ts:119-121,278,281`. `Sandbox` declares `branch`/`memory`/`additionalWorkspaces` main never sends; `window.minipit` typed non-optional but always called with `?.`/`!`; `createSandbox(config: unknown)`; redundant `as Sandbox[]` casts; `onOpenModal` payload cast omits `'new-kit'` from `ModalType`; `App.tsx:27` initial `listSandboxes()` has no `.catch`. **Task:** align the `Sandbox` type with what main actually sends, type `createSandbox`'s config, fix `ModalType`, make `window.minipit` optional (or guarantee it), add the missing `.catch`.

## LOW-8 — Mixed IPC error conventions + copy-pasted error idiom
**Files:** `src/main/index.ts` (all handlers). Half return `{ ok:false, error }`, half throw; `(err instanceof Error ? err.message : String(err)).trim()` is copy-pasted ~25×. **Task:** pick one convention and a shared `errMsg()`/`wrapHandler()` (dovetails with STRUCT-2).

## LOW-9 — Sync fs on the hot path
**Files:** `src/main/index.ts:43` (`getSbxPath` does 3 `accessSync` probes on *every* sbx invocation including the 5s poll), plus ~15 inline `require('fs')`, `import-contrib-kit`'s `fs.cpSync(recursive)` ~2028, `applied-kits`' `readdirSync`+`readFileSync` ~1660. **Task:** cache the resolved sbx path (invalidate on settings change); move blocking fs to `fs.promises` where easy.

## LOW-10 — Uncleaned timeouts / setState-after-unmount
**Files:** `SbxRuntimePanel.tsx:257,353`; `Sidebar.tsx:39-47` (hover timer); `NewKitModal.tsx:263,278`; `NewSandboxModal.tsx:74,209-213` (lingering IPC subscription if unmounted outside dismiss); `FilesPanel.tsx:81-95` (child fetch, no unmount guard); `SettingsPage.tsx:100-110` (inner `setTimeout` not cleaned). **Task:** clear timeouts and release subscriptions in effect cleanup; guard async setState with a mounted/`cancelled` flag.

## LOW-11 — Mid-drag unmount leaks window listeners
**Files:** `Sidebar.tsx:185-204` (`startResize`), `SandboxDetail.tsx:45-60`. `mousemove`/`mouseup` removed only in `onUp`; leak on mid-drag unmount. `SandboxDetail` also sets `body.style.cursor` and never resets it. **Task:** remove listeners and reset cursor in effect cleanup.

## LOW-12 — Terminal copy-on-select clobbers the clipboard
**Files:** `TerminalPanel.tsx:137-140`. Every selection change overwrites the system clipboard (deliberate but destructive — selecting to *read* destroys the user's clipboard). **Task:** reconsider; at minimum make it opt-in or copy only on an explicit gesture. *(Note: the rest of the xterm lifecycle in this file is the best-engineered part of the review — leave it alone.)*

## LOW-13 — Click-outside discards a full kit form
**Files:** `NewKitModal.tsx:287`. An overlay click silently discards a fully-composed kit; `NewSandboxModal` deliberately avoids this (comment ~260). **Task:** require confirmation (or ignore overlay click) when the kit form is dirty.

## LOW-14 — Index keys on mutable editable lists
**Files:** `NewKitModal.tsx:177` (`ListField` `key={i}`), `:405` (`customMcps` `key={custom-${i}}`); `InfoPanel.tsx:355,394` (lower risk). Removing a middle row jumps focus/IME to the wrong item. **Task:** use stable ids for editable list rows.

## LOW-15 — Assorted UX/logic nits
**Files:** `SettingsPage.tsx:147,231` (two rows both labeled "Theme" — mode vs palette; rename one); `LogsPanel.tsx:258` (`onWheel` disables follow even scrolling down at bottom; only disable on upward scroll); `ChangesList.tsx:49-59` (`role="checkbox"` span inside `<button>` — nested interactive, not keyboard-toggleable; restructure); `SbxRuntimePanel.tsx:260-267` (initial-load effect deps `[]` with eslint-disable ignores `sbxPath`, so version may not match an edited path until Verify).

---

# 🧱 INFRASTRUCTURE

## INFRA-1 — Run typecheck (and later tests) on push/PR
**Severity:** High-leverage · **Files:** `.github/workflows/build.yml` (currently triggers only on `v*` tags + `workflow_dispatch`)

**Context.** CI only runs on release tags, so nothing checks the code on push/PR. Typecheck already passes clean, so this is nearly free regression protection.

**Task.** Add a `push`/`pull_request` job (separate workflow or a job in `build.yml`) running `npm ci && npm run typecheck`. Extend with `vitest run` once tests exist (INFRA-3).

**Acceptance criteria.** Every push/PR runs typecheck; a type error fails the check.

## INFRA-2 — Add a linter/formatter
**Severity:** Medium · **Context.** No ESLint/Prettier/Biome config. Given the volume of `any` casts and copy-pasted idioms, a linter would catch a real fraction automatically. **Task.** Add ESLint (typescript-eslint + react-hooks — the latter would have flagged several LOW-10/PERF-1 items) or Biome, wire into CI. **Acceptance:** `npm run lint` exists and runs in CI.

## INFRA-3 — Add tests (see order below)
**Severity:** High-leverage · **Context.** Zero tests today. Use **Vitest** (works with the existing Vite/electron-vite setup).
1. **Unit tests for `src/renderer/src/lib/`** — pure functions (`kitSpec.ts`, `filePreview.ts`, `featureChanges.ts`, `names.ts`, `themes.ts`): cheapest, most stable, catch logic regressions instantly.
2. **Store tests (`store.ts`)** — mock the `window.minipit` bridge; test state transitions and the race machinery (`stopHolds`, `deletingIds`, `creatingHold`) — this is where stability bugs live. Regression-guard BUG-1 here.
3. **Extracted main-process logic** — after STRUCT-2, unit-test `resolveBin`, docker/sbx arg construction, and path-containment (SEC-1) directly.
4. **One Playwright Electron smoke test** — `_electron.launch`, wait for window, click one core flow. Catches "app doesn't start." Keep E2E minimal (slower/flakier).

**Acceptance criteria.** `vitest run` green in CI; lib + store covered; SEC-1 containment and BUG-1 delete-tracking have explicit regression tests.

---

## Appendix — what's already done well (don't "fix")

- Security foundations: `contextIsolation: true`, strict CSP via `onHeadersReceived`, `openExternalSafe` scheme allowlist, all process spawning via argv arrays (no host shell interpolation), secrets piped via stdin (never argv), PKCE + state-verified OAuth with token via stdin.
- The store's `stopHolds` grace-window and `creatingHold` placeholder merge — thoughtful, well-commented solutions to real CLI-vs-poll races. **Preserve this behavior; several fixes above exist specifically to stop other code from bypassing it.**
- `TerminalPanel.tsx` xterm lifecycle: complete disposal, fit resync via refs, live theme updates, keep-both-tabs-mounted trick. Best-engineered file in the review.
- Defensive parsing of `sbx` output with good explanatory comments; the deliberate no-StrictMode decision is documented.
