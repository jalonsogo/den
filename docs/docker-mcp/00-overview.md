# Docker MCP Catalog and Toolkit — Overview

Source: https://docs.docker.com/ai/mcp-catalog-and-toolkit/

Model Context Protocol (MCP) is an open protocol that standardizes how AI applications access external tools and data sources, extending their capabilities beyond base training by connecting language models to local development tools, databases, APIs, and other resources.

## The Problem

Running MCP servers locally creates operational pain:
- Separate installation and configuration per application
- Managing untrusted code
- Manual updates
- Dependency conflicts

## The Solution

The **MCP Toolkit** and **MCP Gateway** provide centralized management: configure once and connect all your clients to it.

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Catalog** | 300+ verified MCP servers packaged as container images with versioning, security updates, and provenance tracking |
| **Profiles** | Named server collections organized by project; support both containerized and remote MCP servers |
| **Gateway** | Centralized proxy between clients and servers — manages configuration, credentials, and access control |
| **Clients** | AI applications (Claude Code, Cursor, Zed, VS Code, etc.) that connect through the MCP Gateway |

## Documentation Index

| Page | Description |
|------|-------------|
| [Get Started](./01-get-started.md) | Enable MCP Toolkit, create a profile, connect clients |
| [MCP Toolkit](./02-toolkit.md) | Features, security model, OAuth, usage with clients |
| [MCP Gateway](./03-mcp-gateway.md) | How the gateway works, manual install |
| [Catalog](./04-catalog.md) | Browsing, adding servers, custom catalogs |
| [Profiles](./05-profiles.md) | Create, manage, share profiles |
| [CLI Reference](./06-cli.md) | All `docker mcp` commands |
