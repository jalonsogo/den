# sbx policy init

**Description** — Initialize the global network policy
**Usage** — `sbx policy init <allow-all|balanced|deny-all> [flags]`

## Description

Initialize the global network policy that applies to all sandboxes.

This sets the initial global network policy and must be run before adding custom allow/deny rules or starting a sandbox for the first time. It is a one-time setup: once initialized, use "sbx policy reset" to start over.

This is the initial global policy, not a per-sandbox default; you can change it later. Per-sandbox rules, including those added by kits such as the built-in agent kits, apply on top for individual sandboxes.

Available policies: allow-all All outbound network traffic is allowed balanced Typical development traffic is allowed, such as AI services and package registries deny-all All outbound network traffic is blocked

After initializing, use "sbx policy allow/deny/rm" to change the global policy. Use "sbx policy reset" to clear all policies and start over.

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# Initialize with the balanced policy — recommended
sbx policy init balanced

# Allow all traffic
sbx policy init allow-all

# Block everything, then allow specific sites
sbx policy init deny-all
sbx policy allow network api.example.com:443
```
