# sbx template save

**Description** — Save a snapshot of the sandbox as a template
**Usage** — `sbx template save SANDBOX TAG [flags]`

## Description

Save a snapshot of the sandbox as a template.

The saved image is stored in the sandbox runtime's image store and can be used as a template for new sandboxes with: sbx run -t TAG AGENT [WORKSPACE]

Use --output to also export the image to a tar file that can be shared and loaded on another host with: sbx template load FILE

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-o, --output` |  | Also export the image to a tar file |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# Save as a template for new sandboxes on this host
sbx template save my-sandbox myimage:v1.0

# Also export to a shareable tar file
sbx template save my-sandbox myimage:v1.0 --output /tmp/myimage.tar
```
