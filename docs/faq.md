# den — FAQ & Troubleshooting

Frequently asked questions and fixes for common problems. den is a GUI over the
`sbx` CLI (Docker Sandboxes), so most issues are really about the `sbx` daemon,
Docker, or the runtime underneath — this doc points you at the right layer.

See also: [`spec.md`](spec.md) for architecture, [`todo.md`](todo.md) for what's
planned, [`README.md`](../README.md) for what den does.

---

## Known problems

Issues we've hit and their fixes, most recent first.

### `ECONNREFUSED` / `ECONNRESET` / connection errors talking to the daemon

**Symptom.** den shows errors like `connect ECONNREFUSED …/sandboxd.sock`,
`ECONNRESET`, or `socket hang up`, and the sandbox list stops updating. Commands
that worked a moment ago start failing at the connection layer.

**What it means.** den talks to the `sbx` daemon (`sandboxd`) over a local
socket. An `ECONN*` error means the client couldn't reach that daemon — usually
because the daemon crashed, hung, or is in a bad state (often after the Mac
wakes from sleep or Docker Desktop restarts). This is the daemon, not den.

**Fix: restart the daemon.**

```bash
# 1. Stop the daemon (no-op if it's already down)
sbx daemon stop

# 2. Start it back up, detached
sbx daemon start -d

# 3. Verify it's answering
sbx ls
```

If `sbx ls` returns your sandboxes, you're back. If `sbx daemon stop` reports
nothing to stop but connections still fail, the pid file may be stale — see the
next entry for clearing `sandboxd.pid` and the socket.

### `sbx ls failed: … another daemon is already running (PID: …)`

**Symptom.** den shows an error (or the sandbox list stops updating) with text like:

```
sbx ls failed: Error: Starting sandboxd daemon...
Daemon started (PID: 62284, socket: …/sandboxd/sandboxd.sock)
ERROR: ensure daemon: daemon exited unexpectedly: exit status 1
stderr: ERROR: write pid file: another daemon is already running (PID: 62255)
```

**What it means.** This is almost always a **race, not corruption.** Two `sbx`
invocations tried to start the daemon at nearly the same time. One is the real,
healthy daemon (the PID in the `another daemon is already running` message); the
other raced to start a backup, couldn't grab the pid-file lock, and exited 1.
`sbx ls` then surfaced that failed second attempt as an error even though the
first daemon was fine.

It tends to happen right after the Mac wakes from sleep, or during heavy
startup, when the daemon is briefly slow to answer a health check and the client
races to spawn its own.

**First: check whether anything is actually broken.** Usually it isn't — just
retry. To confirm the daemon is healthy:

```bash
sbx ls
```

If that returns your sandboxes, you're done — it was transient. den itself keeps
the *last good* sandbox list and reconciles on the next poll (see
`listSandboxes()` in `src/main/index.ts`), so a single failed tick shouldn't
wipe your UI.

**If it stays stuck**, the cause is a **stale pid file** — `sandboxd.pid` names a
PID that's no longer running, so every start attempt fails with that same
message. Verify:

```bash
DIR="$HOME/Library/Application Support/com.docker.sandboxes/sandboxes/sandboxd"
ps -p "$(cat "$DIR/sandboxd.pid")"
```

- If that PID **is** alive → the daemon is healthy; just retry `sbx ls`.
- If that PID is **dead** → the pid file is stale. Clear it and restart:

```bash
DIR="$HOME/Library/Application Support/com.docker.sandboxes/sandboxes/sandboxd"

# 1. Stop the daemon gracefully (no-op if already dead)
sbx daemon stop

# 2. If it won't die, kill it and clear the stale lock + socket
pkill -f 'sbx daemon start'
rm -f "$DIR/sandboxd.pid" "$DIR/sandboxd.sock"

# 3. Restart and verify
sbx daemon start -d
sbx ls
```

**Logs.** The daemon writes to
`~/Library/Application Support/com.docker.sandboxes/sandboxes/sandboxd/daemon.log`.
A healthy daemon logs a steady stream of `GET /daemon/health → 200` and
`GET /sandbox → 200`. You can also live-tail these from **den → Logs**.

---

## General troubleshooting

### The sandbox list is empty or won't refresh

den polls `sbx ls --json` every ~5s. If a poll fails transiently it keeps
showing the last good list rather than blanking out. If it's *persistently*
empty:

1. Run `sbx ls` in a terminal — does the CLI see your sandboxes?
2. If the CLI is empty too, the daemon or Docker is the problem, not den. See
   the daemon section above and confirm Docker Desktop is running.
3. If the CLI works but den doesn't, restart den.

### "Reveal in Finder" / opening the workspace does nothing

Fixed in a recent release (make sure you're up to date). If it still fails, the
workspace path may point somewhere that no longer exists — check the
**WORKSPACE** column in `sbx ls`.

### Files / Changes panel is empty for a running sandbox

The Files tree and inline `git status` badges read the sandbox's **container
workspace**, and the git-status side depends on the sandbox's git daemon, which
is live **only while the sandbox is running**. If the panel is empty, confirm the
sandbox is started, then reopen the panel.

### "Bring work home" / clone-mode fetch-back fails

Clone-mode fetch-back talks to the sandbox's git daemon over a remote, and that
daemon runs **only while the sandbox is active**. If you see
`No "<remote>" remote — clone-mode fetch-back needs the sandbox running`, start
the sandbox first, then retry.

### A secret won't resolve from 1Password

den resolves `op://Vault/Item/field` references via the `op` CLI. Make sure:

- The `op` CLI is installed and you're signed in (`op whoami`).
- The reference is exact — `op://Vault/Item/field`, case-sensitive.

### `sbx` version / updating the runtime

Check your runtime version from **den → Templates & Runtime**, or:

```bash
sbx version
```

If behavior differs from these docs, a version mismatch between den's
expectations and your `sbx` build is a likely cause — update `sbx` and restart
den.

---

## Where things live

| What | Path |
| --- | --- |
| Daemon socket | `~/Library/Application Support/com.docker.sandboxes/sandboxes/sandboxd/sandboxd.sock` |
| Daemon pid file | `…/sandboxd/sandboxd.pid` |
| Daemon log | `…/sandboxd/daemon.log` |
| SSH key | `…/sandboxd/docker_sandboxes_ssh_ed25519` |

---

_Have a fix worth recording? Add it to **Known problems** at the top, newest
first, with a Symptom / What it means / Fix structure so the next person can
self-serve._
