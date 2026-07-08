# sbx policy allow

**Description** — Add an allow rule for sandboxes
**Usage** — `sbx policy allow COMMAND`

## Description

Add a rule that permits sandboxes to access specified resources.

Allowed resources are accessible within the selected policy scope. If a resource matches both an allow and a deny rule, the deny rule takes precedence.

## Commands

| Command | Description |
| --- | --- |
| `sbx policy allow network` | Allow network access to specified hosts |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |
