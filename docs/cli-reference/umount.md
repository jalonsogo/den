# sbx umount

Revoke a previously-exposed host path.

Remove `MOUNT_SPEC` from the sandbox. `MOUNT_SPEC` is `HOST[:CTR_TARGET]` — pass
`CTR_TARGET` to also unmount the bind that the matching `sbx mount` call created
inside the container.

- `HOST` may be absolute or relative; relative paths are resolved against the
  current working directory (with `./..` cleaned), so `HOST` resolves the same
  way it did at mount time as long as the cwd matches. **Existence is NOT
  required** (idempotent): the allowlist is the source of truth, so a path
  deleted after mounting can still be revoked.
- Revoking a path that was never mounted (or a target never bound) is a **no-op
  success**.
- Without `CTR_TARGET` the daemon **only drops the allowlist entry** — the
  original `docker run -v` contract has no host-path-only umount semantics, so a
  caller that bound with a target must pass it back here to unmount the
  container-side bind.

```
Usage:
  sbx umount SANDBOX MOUNT_SPEC [flags]

Examples:
  # Just revoke the allowlist entry
  sbx umount my-sandbox /Users/me/extra-data

  # Revoke and unmount the bind at /workspace/data
  sbx umount my-sandbox /Users/me/extra-data:/workspace/data

Flags:
  -h, --help   help for umount

Global Flags:
  -D, --debug   Enable debug logging
```
