# sbx CLI reference

Per-command reference for the `sbx` CLI (Docker Sandboxes), one Markdown page per
command (subcommands under a folder of the same name).

> **How this was built:** the canonical reference at
> <https://docs.docker.com/reference/cli/sbx/> is client-side rendered — its
> `.md` and `llms.txt` variants are stubs — but the HTML pages are
> server-rendered, so each page here was scraped from the page HTML and converted
> to Markdown. `mount` / `umount` have no published page yet, so they're captured
> from `sbx <command> --help`. Re-generate with `sbx <command> --help` if a page
> drifts from your installed version.

## Commands

| Command | Description | Reference |
|---------|-------------|-----------|
| `completion` | Generate the autocompletion script for the specified shell | [completion.md](completion.md) (+ [subcommands](completion/)) |
| `cp` | Copy files or directories between a sandbox and the host | [cp.md](cp.md) |
| `create` | Create a sandbox for an agent | [create.md](create.md) (+ [per-agent](create/)) |
| `diagnose` | Diagnose common issues with your sbx installation | [diagnose.md](diagnose.md) |
| `exec` | Execute a command inside a sandbox | [exec.md](exec.md) |
| `kit` | (Experimental) Manage kit artifacts | [kit.md](kit.md) (+ [subcommands](kit/)) |
| `login` | Sign in to Docker | [login.md](login.md) |
| `logout` | Stop all running sandboxes and sign out of Docker | [logout.md](logout.md) |
| `ls` | List sandboxes | [ls.md](ls.md) |
| `mount` | Expose a host path into a running sandbox at runtime | [mount.md](mount.md) † |
| `policy` | Manage sandbox policies | [policy.md](policy.md) (+ [subcommands](policy/)) |
| `ports` | Manage sandbox port publishing | [ports.md](ports.md) |
| `reset` | Reset all sandboxes and clean up state | [reset.md](reset.md) |
| `rm` | Remove one or more sandboxes | [rm.md](rm.md) |
| `run` | Run an agent in a sandbox | [run.md](run.md) |
| `secret` | Manage stored secrets | [secret.md](secret.md) (+ [subcommands](secret/)) |
| `setup` | (Experimental) Detect host configuration and prepare Docker Sandboxes | [setup.md](setup.md) |
| `ssh` | Configure SSH access to sandboxes (experimental) | _no published page — run `sbx ssh --help`_ |
| `stop` | Stop one or more sandboxes without removing them | [stop.md](stop.md) |
| `template` | Manage sandbox templates | [template.md](template.md) (+ [subcommands](template/)) |
| `tui` | Open the interactive TUI dashboard | [tui.md](tui.md) |
| `umount` | Revoke a previously-exposed host path | [umount.md](umount.md) † |
| `version` | Show Docker Sandboxes version information | [version.md](version.md) |

† Captured from `sbx <command> --help` (no published web page).

## Global flags

```
-D, --debug   Enable debug logging
```
