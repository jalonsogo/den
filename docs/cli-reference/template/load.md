# sbx template load

**Description** — Load an image from a tar file into the sandbox runtime
**Usage** — `sbx template load FILE [flags]`

## Description

Load an image from a tar file into the sandbox runtime's image store.

The loaded image can be used as a template for new sandboxes. Tar files are typically created with: sbx template save SANDBOX TAG --output FILE

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# Load an image from a tar file
sbx template load /tmp/myimage.tar              # Linux/macOS
sbx template load C:\Users\me\myimage.tar       # Windows

# Use the loaded image as a template
sbx run -t myimage:v1.0 claude
```
