# Gordon — Docker's AI Assistant

Source: https://docs.docker.com/ai/gordon/

Gordon is an AI-powered assistant that takes action on your Docker workflows. It analyzes environments, proposes solutions, and executes commands with user approval.

## Core Capabilities

- Explain Docker concepts and commands
- Search documentation and web resources
- Write and modify Dockerfiles following best practices
- Debug container failures via log analysis
- Manage containers, images, volumes, and networks

## Access Points

| Access Point | Notes |
|-------------|-------|
| Docker Desktop sidebar | Counts toward plan limits |
| Terminal (`docker ai`) | Counts toward plan limits |
| Docker Hub repository pages | Free, no Docker account required |
| Docker documentation site | Free, no Docker account required |

## Requirements

- Docker Desktop 4.74+
- Signed-in Docker account
- **Business subscriptions:** organizational activation and Settings Management configuration required

## Getting Started

**Docker Desktop:**
1. Open the sidebar
2. Select Gordon
3. Choose a project directory
4. Ask questions

**CLI:**

```bash
docker ai
```

Type your query and approve proposed actions before execution.

## Key Behaviors

- **Approval required by default** — Gordon proposes actions before executing
- **Session-based permissions** — permission grants reset each session
- **Customizable permissions** — adjustable in settings

## Sample Queries

```plaintext
"show me logs from my nginx container"
"review my Dockerfile for best practices"
"list my local images and their sizes"
```
