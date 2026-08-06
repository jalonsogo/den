# Errors — what they mean and what to do

Operator-facing runbook: an error you can *see* → what it actually means → the
fix. Written for whoever is looking at the message right now, in den or in an
agent terminal.

Sibling doc: [`sbx-quirks.md`](sbx-quirks.md) records sbx CLI/API behaviours den
works around **in code** (symptom → cause → the patch and where it lives). If
you're debugging den's own handling of sbx, start there. If something is broken
in front of you, start here.

---

## The remedy ladder

Work down it. Each step is more disruptive than the last, and most problems stop
at step 2.

| # | Remedy | How | Costs you |
|---|---|---|---|
| 1 | **Retry** | Send the message again | Nothing |
| 2 | **Restart the sandbox** | den: the sandbox's **Restart**, or the **Restart to apply** bar in the Network panel · Host: `sbx stop <name>` then `sbx run <name>` | The agent's session; the workspace is untouched |
| 3 | **Restart the runtime daemon** | den: Settings → Runtime → **Restart daemon**, or the menu-bar **Runtime** menu · Host: `sbx daemon stop` then `sbx daemon start -d` | Every running sandbox is interrupted |
| 4 | **Relaunch den** | Quit and reopen | Nothing on the sbx side — den is only a GUI |
| 5 | **Recreate the sandbox** | den: New Sandbox on the same workspace · Host: `sbx rm <name>` then recreate | Anything living only inside the container |

`<name>` is the sandbox name — inside a sandbox it's `$SANDBOX_VM_ID` (also
`hostname`). Don't infer it from the branch or folder: a wrong name silently
acts on a sandbox that doesn't exist.

**Restarting the sandbox is the answer more often than it looks**, because
several sbx settings — network policy above all — are only read at start. A rule
you added a second ago is inert until the sandbox is cycled.

---

## Agent can't reach the API

### `API ERROR: Connection closed mid-response. The response above may be incomplete.`
### `API ERROR: Unable to connect to API (ECONNRESET)`

**What it means.** The first: the response stream ended without its terminating
event, so the answer is cut off mid-sentence. The second: the connection was
already dead when it was used.

**Not den.** den never sees that connection. The agent runs inside the container
and opens its own HTTPS connection; den only reads bytes off a PTY. There is no
HTTP or socket client in that path, and no idle timeout on the agent process —
den's only `AbortController` is a 6s cap on Docker Hub kit lookups
(`fetchTimeout`, `src/main/index.ts`).

**Where it can break.** Inside a sandbox, everything is forced through a
TLS-intercepting proxy:

```
HTTPS_PROXY=http://gateway.docker.internal:3128
PROXY_CA_CERT_B64=…      # Docker Sandboxes Proxy CA — traffic is decrypted and re-encrypted
```

So the path is: container → sbx proxy (host) → Docker Desktop's VM network →
the API. Any of the three can reset a long-lived TLS tunnel.

**Ruled out by measurement** (from inside `den-evolution`, sbx v0.37):

- *Wrong IP stack / dual-stack happy-eyeballs* (the slow-connection case in the
  root `CLAUDE.md`) — connect 1.5 ms, TLS handshake 8 ms, round trip 675 ms.
  Nothing is waiting on a dead protocol.
- *Proxy idle timeout* — a CONNECT tunnel to the API, held open through the proxy
  with zero traffic, was still alive after **15 minutes** (the probe's cap, not a
  failure) and never dropped. A quiet stretch mid-stream is not by itself what
  kills it. (The API also sends periodic SSE `ping` events on streaming responses
  specifically to keep tunnels alive.)

**Still open.** That leaves a hard connection-lifetime cap, or a reset of the
whole path. The usual triggers for the latter, all of which drop every in-flight
connection at once:

- the Mac sleeping or the lid closing
- switching Wi-Fi networks, or toggling a VPN
- Docker Desktop or sandboxd restarting

**Debug traces.** den records one automatically every time an agent reports a
dropped connection — you don't have to be watching. Settings → Runtime → **API
failure traces** shows the count and reveals the file
(`<userData>/traces/api-errors.jsonl`, one JSON object per line, rolled at 1 MB).

| Field | Reading it |
|---|---|
| `streamMs` | How long the request had been running when it died. **The key number**: if it clusters around the same value across several traces, that's a connection-lifetime cap |
| `quietMs` | How long the stream had been silent beforehand. Large ⇒ the failure followed a quiet stretch; small ⇒ it died mid-flow |
| `sinceResumeMs` | ms since this Mac last woke. A small value ⇒ the wake killed the connection, not the proxy |
| `sinceNetChangeMs` | ms since the host's interfaces changed (Wi-Fi hop, VPN toggle). Same reading |
| `probe.daemon` | `failed` ⇒ the sbx daemon was down or unresponsive when it happened — that's your cause, restart it (ladder step 3) |
| `kind` | `closed-mid-response` / `econnreset` / `timeout` / `other` |
| `sandboxUptimeMs`, `agent`, `net` | Context for comparing traces |

Two traces are usually enough to tell the story:

- **`streamMs` similar, `sinceResumeMs` large or null** → a lifetime cap. Report
  it upstream with the numbers.
- **`sinceResumeMs` or `sinceNetChangeMs` small** → the Mac woke or switched
  network. Nothing is broken; retry.
- **`probe.daemon: failed`** → the runtime went away. Restart the daemon.

**What to do.**

1. Retry — a fresh connection normally succeeds immediately.
2. If it repeats, restart the daemon (ladder step 3) — that rebuilds the proxy.
3. Check whether it correlates with sleep or a network change. That's the
   cheapest signal available and it settles the diagnosis.
4. Run the same agent **on the host** rather than in a sandbox. Clean there and
   lossy here is the decisive result: it's the sandbox proxy path, and worth
   reporting upstream with the timings above.

If connections are *slow* rather than reset, that's the IP-stack case instead —
ask the host to set `DOCKER_SANDBOXES_IP_STACK` to whichever protocol actually
works (`ipv4only` / `ipv6only` / `dual-stack`).

---

## Network policy

### `Blocked by network policy: domain <host>` (HTTP 403)

**What it means.** The request never left the sandbox. Read the response body —
it names the rule and the origin.

| `detail` / `origin` | What to do |
|---|---|
| `no matching allow rule — blocked by default deny policy` | Allow it: den's Network panel → the blocked host's **Allow**, or on the host `sbx policy allow network <domain>` |
| `origin: local policy` with an explicit deny rule | A local rule is actively blocking it. Override with `sbx policy allow network <domain>` if that's appropriate |
| `origin: corporate policy` / `system policy` | Enforced by your organisation. `sbx policy allow` won't help — contact IT |

Inspect with `sbx policy log` (recent connections and why they were blocked) and
`sbx policy ls` (active rules).

### The rule exists but the agent is still blocked

**Not a bug.** Policy is applied when the sandbox starts; editing it doesn't
touch a running one. Restart the sandbox (ladder step 2). den's Network panel
docks a **Restart to apply** bar until you do, listing what's pending.

---

## Sandbox won't start

### `ERROR: failed to start sandbox: … 422 … workspace directory "<path>" no longer exists on the host`

The folder behind the workspace mount was moved, renamed, or deleted. Restore it
at that exact path, or remove the workspace and point the sandbox at the new
location. den surfaces this as a banner on the sandbox with the path and a
removal button, rather than leaving the sandbox silently refusing to start.

### Any other refused launch

`sbx run` prints the reason on stderr and exits — den lifts it out of the stream
and shows it, because a launch that never reaches `running` loses the terminal
that would have displayed it. Read the message first; if it names no cause, try
the ladder from step 3.

---

## Git and GitHub

### `fatal: could not read Username for 'https://github.com'`

No GitHub token is configured as a sandbox secret. On the **host**:

```bash
sbx secret set <sandbox-name> github -t "$(gh auth token)"   # this sandbox, immediate
sbx secret set -g github -t "$(gh auth token)"               # all future sandboxes (recreate needed)
```

Push from **inside** the sandbox — that's the supported path. The proxy injects
credentials at the network level.

### `gh auth status` says you're not logged in

Expected, and not a problem. The proxy injects credentials for HTTPS Git
operations independently of the `gh` CLI's own auth state. Don't run
`gh auth login` inside a sandbox to "fix" it.

### `kit.allowedSources` error when pulling a kit from a Git URL

Misleading message: `sbx kit pull` takes an OCI reference and can't fetch a repo
at all, so the wrong-kind-of-reference case is reported as a denied source. den
detects a Git URL and clones instead. See [`sbx-quirks.md`](sbx-quirks.md).

---

## den itself

### `<something> isn't available in the running app yet — quit and reopen den to load the update.`

A stale bridge: the preload and main bundles are from different builds, so an
IPC handler the UI expects doesn't exist yet (raw form: `… is not a function`,
or `no handler registered`). Relaunch den (ladder step 4). Nothing sbx-side is
wrong, and no sandbox is affected.

### A panel reads empty or an action does nothing

Check the sandbox is actually running, then relaunch den. If it persists it's a
bug — capture what the panel shows and file it.

---

## Publishing a port

Services in a sandbox aren't reachable from the host until a port is published,
and this can only be run on the **host**:

```bash
sbx ports <sandbox-name> --publish 8080:8080/tcp   # publish
sbx ports <sandbox-name>                           # list
sbx ports <sandbox-name> --unpublish 8080:8080/tcp # remove
```

The service must listen on `0.0.0.0` or `::` — bound to `127.0.0.1` only, it
isn't reachable on `eth0` and publishing won't help. To reach a service on the
host from inside a sandbox, use `host.docker.internal`, not `localhost`.

---

## Reporting something not listed here

Include: the exact error text, the sbx version (`sbx version`), whether it
reproduces after a daemon restart, and whether it reproduces outside a sandbox.
If it turns out to be an sbx CLI/API behaviour den has to work around, it also
gets an entry in [`sbx-quirks.md`](sbx-quirks.md) with the fix.
