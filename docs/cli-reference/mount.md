# sbx mount

Expose a host path into a running sandbox at runtime.

Allow `MOUNT_SPEC` to be visible inside the running sandbox. This is a real
kernel bind mount (`setns + open_tree + move_mount`, not a symlink), applied
**live to a running sandbox with no restart**.

`MOUNT_SPEC` is `HOST[:CTR_TARGET[:ro|rw]]` in docker `-v` style:

| Form | Effect |
|------|--------|
| `HOST` | Expose `HOST` under `/mnt/host/<HOST>` in the sandbox. |
| `HOST:CTR_TARGET` | Additionally bind-mount the host path at `CTR_TARGET` inside the running container. |
| `HOST:CTR_TARGET:ro\|rw` | `:rw` is the default. `:ro` is enforced at the kernel mount layer via `MOUNT_ATTR_RDONLY` — writes return `EROFS`. |

- `HOST` may be absolute or relative; relative paths are resolved against the
  current working directory (with `./..` segments cleaned). **`HOST` must exist
  on the host.**
- `CTR_TARGET` must be **absolute**.
- Mount operations are **idempotent**: re-running the same `MOUNT_SPEC` is a
  no-op success.
- Mount **policy (governance)** is enforced before the call reaches the daemon,
  mirroring the create-time check, using the effective read-only intent.

```
Usage:
  sbx mount SANDBOX MOUNT_SPEC [flags]

Examples:
  # Allowlist only — visible at /mnt/host/Users/me/extra-data
  sbx mount my-sandbox /Users/me/extra-data

  # Bind-mount inside the container at /workspace/data (read-write)
  sbx mount my-sandbox /Users/me/extra-data:/workspace/data

  # Bind-mount read-only (writes inside the container return EROFS)
  sbx mount my-sandbox /Users/me/extra-data:/workspace/data:ro

Flags:
  -h, --help   help for mount

Global Flags:
  -D, --debug   Enable debug logging
```
