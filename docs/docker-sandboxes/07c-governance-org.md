# Organization Policy

Source: https://docs.docker.com/ai/sandboxes/governance/org/

> Organization sandbox governance requires a separate paid subscription.

Rules defined in the Admin Console apply across the organization to either all members or specific teams. When organization governance is active, it **completely replaces** local `sbx policy` rules.

## Access Control

By default, only organization owners can view and manage AI Governance policies. Custom roles with Governance permissions can be assigned to other users.

## Create a Policy

**Location:** Admin Console → AI governance

1. Sign in to Docker Home and select your organization
2. Navigate to Admin Console → AI governance
3. Select **Network access** or **Filesystem access**, then **Create policy**
4. Enter a Policy name
5. Set Scope to **Organization** or **Teams**
6. Select **Add rule** for each rule

Existing policies are listed with their name, scope, rule count, and last update.

## Network Policies

Network rules take a network target and an action (`allow` or `deny`).

When organization governance is active, local network rules are not evaluated.

## Filesystem Policies

Filesystem policies control which host paths a sandbox can mount as workspaces.

Path patterns support `*` (single level) and `**` (multi-level) wildcards.

> **Tip:** Use `**` rather than `*` for workspace allow rules to match nested paths.

## Scope Policies to Teams

A user is governed by **all** of their effective policies simultaneously: every org-wide policy plus the team-scoped policies for all teams they belong to.

> **Key principle:** Deny always wins — a team-scoped policy can grant access on top of org-wide policies but cannot loosen a restriction imposed by them.

## Precedence

When organization governance is active, local rules are not evaluated. Organization rules take full precedence.

## Troubleshooting

### Policy Changes Not Taking Effect

Changes take up to **5 minutes** to propagate. Force immediate update:

```console
$ sbx policy reset
```

> **Warning:** `sbx policy reset` deletes all locally configured policy rules.

### Sandbox Cannot Mount Workspace

Ensure filesystem allow rules use `**` rather than `*` to match subdirectories.
