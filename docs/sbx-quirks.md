# sbx & API quirks — observed errors and their fixes

A running log of every `sbx` CLI / API behaviour that broke den, with what it
actually does and how den works around it. den is a GUI over a CLI whose output
isn't a stable contract: flags disappear, columns get renamed, JSON keys differ
per version, and a failure often surfaces as text on stderr rather than an exit
code we can branch on. Each of those costs an afternoon to re-diagnose, so it
gets written down once.

**Add an entry whenever an sbx or API error is diagnosed** — at the time of the
fix, not later. An entry is worth writing even if the fix is one line; the
value is the symptom→cause mapping, not the patch.

Sibling doc: [`errors.md`](errors.md) is the operator-facing runbook — an error
you can see on screen → what to do about it (restart the sandbox, restart the
daemon, …). This file is the developer-facing side: sbx behaviours den works
around in code. A quirk that users hit directly belongs in both.

Template:

```
### <short symptom>
- **Version:** sbx vX.YY (where observed)
- **Symptom:** what the user or the log sees.
- **Cause:** what sbx actually does.
- **Fix:** what den does instead, and where (`file` → `function`).
- **Status:** fixed / worked around / open / unverified.
```

---

## Network policy

### `sbx policy log` rejects `--sandbox`
- **Version:** v0.37.0
- **Symptom:** a per-sandbox block fetch returned nothing at all — the whole
  command failed, so blocked hosts never reached the UI.
- **Cause:** `sbx policy log` accepts only `--json` / `--limit` / `--type` / `-q`.
  An unknown flag fails the command rather than being ignored.
- **Fix:** ask for the full log and narrow by each row's own sandbox field.
  `src/main/index.ts` → `fetchPolicyLog()`.
- **Status:** fixed.

### `sbx policy log --json` has no pinned schema
- **Version:** v0.35 – v0.37
- **Symptom:** denials parsed on one version and silently vanished on another.
- **Cause:** the payload envelope and field names move between versions. The
  real v0.37 shape is `{ blocked_hosts: [...], allowed_hosts: [...] }`; other
  versions return a bare array or `entries` / `log` / `events`. The sandbox name
  is `vm_name` in v0.37 (elsewhere `sandbox` / `sandbox_name`). Entries under
  `blocked_hosts` carry **no** decision field — they're denials by definition, so
  filtering on `decision` drops all of them.
- **Fix:** tolerate every envelope and spelling, and remember which list is being
  read so the decision filter is skipped for `blocked_hosts`.
  `src/main/index.ts` → `parsePolicyLogJson()`.
- **Status:** worked around.

### A denial's `rule` is the raw engine verdict, not a rule name
- **Version:** v0.37.0
- **Symptom:** every blocked-request row in the Network panel read
  `no applicable policies for op=(action:net:connect:tcp, resource=net:domain:example.com:443)`
  — the same unreadable sentence on every row, wrapping over the Allow button.
- **Cause:** when nothing matched, sbx puts the engine's verdict string in the
  rule field instead of leaving it empty. There is no "default deny" marker to
  branch on.
- **Fix:** translate the known verdict shapes to plain language and only show the
  field verbatim when it looks like a real rule name.
  `src/renderer/src/components/NetworkPanel.tsx` → `blockReason()`.
- **Status:** fixed.

### A rule takes effect only on (re)start
- **Version:** v0.37.0
- **Symptom:** `sbx policy allow` succeeds and the agent stays blocked.
- **Cause:** policy is applied to the sandbox at start; editing it doesn't touch
  a running one.
- **Fix:** not a bug to route around — surface it. Every policy edit records a
  pending change and the Network panel docks a "restart to apply" bar until the
  sandbox is cycled. `src/renderer/src/store.ts` → `policyRestartPending`.
- **Status:** by design; surfaced in the UI.

### `sbx policy ls --wide` column names changed
- **Version:** v0.35 (renamed from v0.34)
- **Symptom:** the rules table parsed as empty.
- **Cause:** columns were renamed and reordered —
  `SOURCE  APPLIES TO  POLICY/RULE  RULE_ID  TYPE  DECISION  RESOURCES`
  (was `PROVENANCE / APPLIES_TO / POLICY/RULE / TYPE / DECISION / RESOURCES`).
  Note `SOURCE`↔`PROVENANCE`, the space in `APPLIES TO`, and the new `RULE_ID`.
  A rule's resources also span continuation rows that carry only that column.
- **Fix:** locate the header by a signature that survives renames (`DECISION` +
  `RESOURCES`) and read by column offset. `src/main/index.ts` → `parsePolicyLs()`.
- **Status:** worked around.

### Agent API streams cut mid-response (`ECONNRESET`, "connection closed mid-response")
- **Version:** v0.37.0, in-sandbox
- **Symptom:** an agent running inside a sandbox intermittently reports
  `API ERROR: Connection closed mid-response` or
  `API ERROR: Unable to connect to API (ECONNRESET)`.
- **Cause:** not den — den never sees that connection (the agent opens its own
  HTTPS connection inside the container; den reads a PTY, and has no HTTP client
  or idle timeout in that path). Every request goes container → the sbx
  TLS-intercepting proxy at `gateway.docker.internal:3128` → Docker Desktop's VM
  network → the API, and any of the three can reset a long-lived tunnel.
- **Measured (from inside a sandbox):** connect 1.5 ms / TLS 8 ms / round trip
  675 ms — so *not* the IP-stack-misdetection slow path. A CONNECT tunnel held
  through the proxy with zero traffic was still alive after 15 minutes (the
  probe's cap) — so *not* a proxy idle timeout either. Remaining candidates:
  either a hard connection-lifetime cap that only bites once a stream has been
  running a while, or a
  whole-path reset (host sleep, Wi-Fi/VPN change, daemon or Docker restart).
- **Fix:** no code fix — operator remedy. Retry, then restart the daemon; see
  [`errors.md`](errors.md) for the ladder.
- **Status:** open — cause narrowed, not pinned.

## Sandbox lifecycle

### A refused `sbx run` leaves no trace in the UI
- **Version:** v0.37.0
- **Symptom:** a sandbox silently wouldn't start; the reason was only in the log
  file.
- **Cause:** `sbx run` prints the failure on its own stderr and exits, e.g.
  `ERROR: failed to start sandbox: start runtime: request failed: 422 …:
  workspace directory "/Users/me/Proj" no longer exists on the host`. In a PTY
  that lands in the agent stream — but a launch that never reaches `running`
  swaps the terminal for the stopped placeholder, taking the message with it.
- **Fix:** scan the stream for the marker and forward it as a structured event
  the UI can act on (the workspace-gone case names a path, so it gets a button).
  `src/main/index.ts` → `scanOutputForStartError()`, `WORKSPACE_GONE_RE`.
- **Status:** fixed.

### A workspace's host path is not always its path inside the container
- **Version:** v0.37.0
- **Symptom:** `Error: no such directory in sandbox: /Users/me/Code/<project>` from
  the `list-files` handler, for a sandbox that is up and healthy.
- **Cause:** den stores the workspace as the **host** path (`workspaces[0]` from
  `sbx ls --json`) and uses it as an in-container path. That holds for a plain
  direct-mount sandbox and not otherwise — `--clone` puts the working copy
  somewhere else entirely (the host repo is read-only at `/run/sandbox/source`),
  and a moved folder or a different mount point breaks it too.
- **Fix:** ask the container instead of assuming — `workspace-root` probes
  `"$1"`, `$PWD`, `$HOME`, `/` inside the sandbox and roots the Files tree at the
  first that exists. When it can't reach the container it now returns nothing and
  the caller retries, rather than falling back to the unverified host path and
  guaranteeing a failed listing. `src/main/index.ts` → `minipit:workspace-root`,
  `src/renderer/src/components/FilesPanel.tsx`.
- **Status:** worked around. **Open:** whether `sbx inspect <name> --json`
  reports the container-side mount target — den passes that payload straight to
  the UI without parsing it. If it does, that beats probing. Needs checking on a
  host with the CLI.

### `-p` is honoured at creation only
- **Version:** v0.37.0
- **Symptom:** ports passed on a re-attach are ignored, with no error.
- **Cause:** `sbx create -p` publishes; re-attaching does not re-read it.
- **Fix:** pass `-p` at creation, route later changes through `sbx ports`.
  `src/main/index.ts` → sandbox create.
- **Status:** worked around.

### `--no-share-skills` is accepted but undocumented
- **Version:** v0.37.0
- **Symptom:** the flag is missing from `sbx create --help`.
- **Cause:** hidden, not removed — it works.
- **Fix:** passed only as an opt-out (the shared store is mounted by default).
- **Status:** worked around; recheck if a future version drops it.

## Kits

### `sbx kit pull` on a Git URL reports an allowlist error
- **Version:** v0.37.0
- **Symptom:** pulling a kit from a Git URL fails with a `kit.allowedSources`
  error naming an allowlist the publisher is usually already on — so it reads as
  a permissions problem.
- **Cause:** `kit pull` takes an OCI reference. It can't fetch a repo at all; the
  wrong-kind-of-reference case isn't distinguished from a denied source.
- **Fix:** detect a Git URL in the OCI field and clone it instead of pulling.
  `src/main/gitKitRef.ts`.
- **Status:** fixed.

### No "which kits are on this sandbox" query
- **Version:** v0.37.0
- **Cause:** sbx exposes no such query; `--kit` can only be passed at creation.
- **Fix:** den tracks the kit↔sandbox mapping locally. Same for live mounts
  (`sbx` has no `mount ls`).
- **Status:** worked around; local state can drift from reality.

## Secrets & skills

### `sbx secret ls` column layout isn't pinned
- **Version:** v0.35+
- **Cause:** v0.35 added annotations for entries that won't inject at runtime
  (env-only, OAuth-shadowed); the layout isn't stable across versions.
- **Fix:** parse defensively — first three fields as scope/type/name, the rest as
  a tail, annotations detected by keyword anywhere in the row.
  `src/main/index.ts` → `listSecrets()`.
- **Status:** worked around.

### `sbx skills import` real-run wording is unverified
- **Version:** v0.37.0
- **Symptom:** only the `--dry-run` output has been observed:
  `Would import skill "x"` / `Skipping ".DS_Store": not a directory` /
  `Dry run: 10 skill(s) would be imported into …`.
- **Fix:** the import verb is matched loosely (would import / importing /
  imported); a missed line only costs a name in the summary, and the raw output
  is always shown.
  `src/main/index.ts` → `parseSkillsImport()`.
- **Status:** unverified — confirm the real-run wording against a live import.

## Open / unverified

- **Governance support message key** (v0.37) — the field name in
  `sbx policy check network --json` couldn't be observed: it only appears when
  governance is *active*, which needs an org-managed policy.
  `governanceSupportMessage()` reads several plausible spellings
  (`support_message`, `supportMessage`, `contact`, …) and shows nothing if none
  match. Pin the key against a real governed host.

---

## Not sbx — but same class of problem

Third-party behaviour that cost the same kind of diagnosis is worth recording
here too when it has no better home.

### xterm clips the bottom row at a fractional devicePixelRatio
- **Symptom:** switching UI density to Comfortable sliced the agent's status line
  in half, permanently, until the window was resized.
- **Cause:** density zooms the window, which changes `devicePixelRatio`. xterm
  derives a row's height from it (`ceil(charHeight × dpr)` device px), so at a
  fractional dpr each row grows a fraction of a pixel — ~5px over a full screen.
  xterm re-measures on the dpr change but never changes the row count (that's the
  fit addon's job), and the only thing re-running the fit was the container's own
  resize, which fires *before* xterm re-measures.
- **Fix:** refit on a dpr change and on the density setting, and after every fit
  measure what was actually laid out, handing back a row if the grid overflows
  its box. `src/renderer/src/components/TerminalPanel.tsx` → `fitToBox()`.
- **Status:** fixed (typecheck/build only — needs a runtime confirmation).
