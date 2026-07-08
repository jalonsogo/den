# sbx ports

**Description** — Manage sandbox port publishing
**Usage** — `sbx ports SANDBOX [flags]`

## Description

Manage sandbox port publishing.

List, publish, or unpublish ports for a running sandbox. Without --publish or --unpublish flags, lists all published ports.

Port spec format: [[HOST_IP:]HOST_PORT:]SANDBOX_PORT[/PROTOCOL] If HOST_PORT is omitted, an ephemeral port is allocated automatically. If HOST_IP is omitted, the port is bound on loopback, expanded based on PROTOCOL and the sandbox's address families: tcp/udp binds both 127.0.0.1 and ::1 (or only 127.0.0.1 if the sandbox is IPv4-only); tcp4/udp4 binds only 127.0.0.1; tcp6/udp6 binds only ::1. PROTOCOL defaults to tcp. Supported protocols: tcp, tcp4, tcp6, udp, udp4, udp6.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `--json` |  | Output in JSON format (for port listing) |
| `--publish` |  | Publish a port (can be repeated): [[HOST_IP:]HOST_PORT:]SANDBOX_PORT[/PROTOCOL] |
| `--unpublish` |  | Unpublish a port (can be repeated): [HOST_IP:]HOST_PORT:SANDBOX_PORT[/PROTOCOL] |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# List published ports
sbx ports my-sandbox

# Publish sandbox port 8080 to an ephemeral host port
sbx ports my-sandbox --publish 8080

# Publish with a specific host port
sbx ports my-sandbox --publish 3000:8080

# Unpublish a port
sbx ports my-sandbox --unpublish 3000:8080
```
