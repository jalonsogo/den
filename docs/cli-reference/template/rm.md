# sbx template rm

**Description** — Remove a template image
**Usage** — `sbx template rm TAG|ID [flags]`

## Description

Remove a template image from the sandbox runtime's image store.

The image can be identified by tag (e.g. "myimage:v1.0") or by image ID (full or prefix, e.g. "abc123"). Use "sbx template ls" to see available images and their IDs.

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# Remove by tag
sbx template rm myimage:v1.0

# Remove by image ID (prefix)
sbx template rm abc123
```
