# Audit Logs

Source: https://docs.docker.com/ai/sandboxes/governance/audit/

> Audit logging requires a Docker AI Governance subscription and an active organization policy. Without an enforced governance policy, the daemon writes no audit logs.

The sandbox daemon generates structured audit events documenting every policy decision. Records are stored locally as JSON Lines files and integrate with existing SIEM tools. Docker itself does not collect this data.

## Record Types

| Type | Content |
|------|---------|
| Evaluation records | Policy decisions: resource, action, verdict, denial reasoning |
| Session lifecycle records | Daemon start/end events with shared `audit_session_id` for correlation |

## Storage Locations

| OS | Default Path |
|----|-------------|
| macOS | `~/Library/Logs/com.docker.sandboxes/sandboxes/auditkit/` |
| Linux | `${XDG_STATE_HOME:-~/.local/state}/sandboxes/sandboxes/auditkit/` |
| Windows | `%LOCALAPPDATA%\DockerSandboxes\sandboxes\logs\auditkit\` |

## File Naming Convention

```
audit-<utc-timestamp>-<process-uuid>-<seq>.jsonl
```

Active files use a `.tmp` extension. Only sealed `.jsonl` files contain complete records.

## SIEM Integration

Configure log shippers (Splunk Universal Forwarder, Filebeat, etc.) to collect only sealed `.jsonl` files — avoid `.tmp` files which may be incomplete.

Retention is the responsibility of the log shipper; Docker Sandboxes does not manage log lifecycle.
