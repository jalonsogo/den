# Proposal: In-app release channels for sbx (Stable / Nightly)

**Status:** Draft for discussion
**Owner:** Javier
**Surface:** minipit (sbx desktop GUI) + sbx packaging

---

## Problem

sbx ships stable and nightly as **two mutually-exclusive Homebrew casks** (`conflicts with`).
That packaging decision leaks an internal concern to users:

- "Which version / channel am I on?" → requires `brew list` / `sbx version` archaeology.
- "How do I switch to nightly?" → uninstall one cask, install the other, sometimes with
  `--force` to escape the conflict state.
- A failed/interrupted switch can leave **neither** cask cleanly installed.

The Homebrew conflict isn't the bug — it's a *symptom*. Switching channels is a product
feature (cf. VS Code Insiders, Chrome's update channel), and right now we've pushed it onto
the user as a CLI chore. It should be owned in the app.

> Non-goal: this is **not** something to solve by handing the user an agent prompt or a list
> of brew incantations. Those remain available for power users / CI, but must not be the
> primary way to change channels.

## Proposed UX

1. **Release channel selector** in Settings → Runtime: a single segmented control
   `Stable · Nightly` (room for `Beta` later). Picking a channel *is* the whole interaction;
   the app performs the swap underneath.
2. **Current channel + version always visible** (Runtime tab header + an About/footer line),
   so "which am I on?" never needs `brew list`.
3. **Atomic, safe switch.** On channel change the app:
   - downloads/installs the target channel,
   - removes the other channel,
   - preserves config/state across the switch,
   - and on any failure rolls back to the previously-working channel — never the broken
     "conflicts with / neither installed" state. No `--force`, no guessing.
4. **Update-in-place per channel.** "You're on Nightly — update available → <build>", not a
   reinstall dance. (Stable already reads GitHub releases; Nightly needs an equivalent feed.)

Mock flow:

```
Release channel   ( Stable ) ( Nightly )         ← segmented control
Installed         Nightly · v0.34.0-231-gabc123  ← always visible
                  [ Update available → newer build ]  (status chip)
```

## Open decisions (with recommendations)

**1. Migrate data/config on switch, or warn about downgrade incompatibility?**
Recommend: **shared config dir across channels by default** (a channel is the same product,
not a different app). Switching *up* (stable → nightly) is silent. Switching *down*
(nightly → stable) shows a one-time warning that newer on-disk state may not be readable, and
offers a backup of the state dir before proceeding. Never silently destroy state.

**2. One install that switches, or both side-by-side?**
Recommend: **single active channel** — keep the current "one at a time" model. It matches the
existing cask packaging, the user's mental model ("I'm on X"), and avoids double disk/daemon
footprint. True side-by-side is a developer need; defer it, and if it lands later give nightly
a distinct app id + data dir so the two can coexist without the swap dance. So: yes, the
"conflicts with" packaging is intentional for the default product.

**3. Where does the channel preference live so a reinstall remembers it?**
Recommend: persist channel in a **stable user-config location that survives app/cask
reinstall** (e.g. `~/Library/Application Support/sbx/channel` / XDG equivalent), not only in
electron-store (which a reinstall may wipe). On launch, the app reconciles: read preference →
verify the matching channel is installed → offer to re-apply if drifted.

## Packaging changes needed

- **A machine-readable "latest per channel" feed** (stable / nightly / beta) the app can poll
  for update-in-place. Stable can keep using GitHub releases; nightly needs an equivalent
  (release feed or a `channels.json` manifest with version + download URL + checksum).
- **An atomic swap path** the app can drive without `--force`. Either:
  - (a) keep two casks but expose a clean install/uninstall ordering the app orchestrates and
    can roll back, or
  - (b) collapse to **one cask with a channel variable** so Homebrew itself models the channel
    rather than two conflicting formulae.
  Option (b) removes the conflict class entirely and is the cleaner long-term shape.
- Keep the CLI/brew path documented for power users and CI — secondary, not primary.

## Why this is worth it

Channel switching is a recurring "how do I…" with a sharp failure mode (broken install). Owning
it in the app turns a multi-step, occasionally-destructive CLI ritual into one safe click, and
makes "which version am I running" answerable at a glance — exactly the kind of rough edge a
first-party GUI exists to smooth.
