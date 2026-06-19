# Sign-in Enforcement

Source: https://docs.docker.com/ai/sandboxes/governance/sign-in-enforcement/

Sign-in enforcement restricts Docker Sandboxes to users who are members of specific Docker organizations. This prevents developers from bypassing organizational governance policies by using personal accounts at the endpoint level.

## How It Works

1. Administrators deploy enforcement configurations specifying allowed Docker organization slugs
2. Users authenticate via `sbx login` — credentials are stored temporarily
3. The Docker API verifies organization membership
4. Credentials are either retained or immediately revoked based on membership status

Users can always run `sbx login` and `sbx logout`, but all other sandbox operations require a valid authenticated session from an approved organization.

## Configuration Schema

```json
{
  "allowedOrgs": ["my-org-slug"],
  "adminName": "IT Helpdesk",
  "adminEmail": "it@example.com",
  "adminURL": "https://it.example.com/access"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `allowedOrgs` | Yes | Docker organization slugs where users must hold membership |
| `adminName` | No | Contact person or team name shown to denied users |
| `adminEmail` | No | Support contact email shown to denied users |
| `adminURL` | No | Help desk or access request URL shown to denied users |

When `allowedOrgs` is empty or missing, enforcement becomes inactive.

## Platform-Specific Deployment

### macOS

Deploy through MDM as managed preferences domain `com.docker.sbx`.

### Windows

Registry-based deployment:

```
HKLM:\SOFTWARE\Policies\Docker\SBX
```

Use MultiString and String value types.

### Linux

Root-owned JSON file with strict permissions:

```
/etc/docker-sbx/config.json
```

File must be owned by root with `0700` directory permissions.

## Access Denial

Users denied access receive a message listing the required organizations and displaying configured contact details (admin name, email, URL) when available.
