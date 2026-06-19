# Tutorial: Building a Coding Agent

Source: https://docs.docker.com/ai/docker-agent/tutorial/

This tutorial teaches you how to build a coding agent that can help with software development tasks.

## What You'll Build

An agent that can:
- Read and modify files in your project
- Run commands like tests and linters
- Follow structured development workflows
- Look up documentation when needed
- Track progress through multi-step tasks

## Prerequisites

- Docker Agent installed
- API key configured: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
- A project to work with

## Step 1: Creating Your First Agent

Create `agents.yml`:

```yaml
agents:
  root:
    model: openai/gpt-5
    description: A basic coding assistant
    instruction: |
      You are a helpful coding assistant.
      Help me write and understand code.
```

Run it:

```bash
docker agent run agents.yml
```

## Step 2: Adding Tools

Tools give the agent capabilities. Add filesystem and shell access:

```yaml
agents:
  root:
    model: openai/gpt-5
    description: A coding assistant with filesystem access
    instruction: |
      You are a helpful coding assistant.
      You can read and write files to help me develop software.
      Always check if code works before finishing a task.
    toolsets:
      - type: filesystem
      - type: shell
```

> **Note:** By default, filesystem access is restricted to the current working directory. The agent will request permission if it needs to access other directories.

**Available tool types:**
- `filesystem` — read/write files
- `shell` — execute commands
- `todo` — task progress tracking
- `think` — structured reasoning
- `mcp` — external MCP servers
- `fetch` — retrieve web pages

## Step 3: Structuring Agent Instructions

Use detailed instructions with workflow steps and constraints:

```yaml
agents:
  root:
    model: anthropic/claude-sonnet-4-5
    description: Expert Go developer
    instruction: |
      Your goal is to help with code-related tasks by examining, modifying,
      and validating code changes.

      <TASK>
          # Workflow:
          # 1. Analyze: Understand requirements and identify relevant code.
          # 2. Examine: Search for files, analyze structure and dependencies.
          # 3. Modify: Make changes following best practices.
          # 4. Validate: Run linters/tests. If issues found, return to Modify.
      </TASK>

      Constraints:
      - Be thorough in examination before making changes
      - Always validate changes before considering the task complete
      - Write code to files, don't show it in chat

      ## Development Workflow
      - `go build ./...` - Build the application
      - `go test ./...` - Run tests
      - `golangci-lint run` - Check code quality

    add_date: true
    add_environment_info: true
    toolsets:
      - type: filesystem
      - type: shell
      - type: todo
```

**For other project types, adapt the workflow section:**

```yaml
## Development Workflow
- `npm test` - Run tests
- `npm run lint` - Check code quality
- `npm run build` - Build the application
```

**Add project-specific constraints:**

```yaml
Constraints:
  - Always run tests before considering a task complete
  - Follow the existing code style in src/ directories
  - Never modify files in the generated/ directory
  - Use TypeScript strict mode for new files
```

## Step 4: Composing Multiple Agents

Add specialized sub-agents. The root agent delegates; sub-agents focus on specific tasks:

```yaml
agents:
  root:
    model: anthropic/claude-sonnet-4-5
    description: Expert Go developer
    instruction: |
      Your goal is to help with code-related tasks by examining, modifying,
      and validating code changes.

      When you need to look up documentation or research how something works,
      ask the librarian agent.

      # Workflow:
      # 1. Analyze: Understand requirements.
      # 2. Examine: Search for files, analyze structure.
      # 3. Modify: Make changes following best practices.
      # 4. Validate: Run linters/tests. If issues, return to Modify.

      ## Development Workflow
      - `go build ./...` - Build
      - `go test ./...` - Test
      - `golangci-lint run` - Lint

      Constraints:
      - Be thorough before making changes
      - Always validate before finishing
      - Write code to files, don't show in chat

    toolsets:
      - type: filesystem
      - type: shell
      - type: todo
    sub_agents:
      - librarian

  librarian:
    model: anthropic/claude-haiku-4-5
    description: Documentation researcher
    instruction: |
      You are the librarian. Your job is to find relevant documentation,
      articles, or resources to help the developer agent.

      Search the internet and fetch web pages as needed.
    toolsets:
      - type: mcp
        ref: docker:duckduckgo
      - type: fetch
```

## Suggested Prompts to Try

```
"How do I read a file in Python?"
"Read the README.md file and summarize it."
"Add error handling to the parseConfig function in main.go"
"How do I use context.Context in Go? Then add it to my server code."
```

## Model Selection Recommendations

| Role | Recommended Model | Reason |
|------|-----------------|--------|
| Root/coding agent | `anthropic/claude-sonnet-4-5`, `openai/gpt-5` | Complex reasoning |
| Documentation lookup | `anthropic/claude-haiku-4-5`, `openai/gpt-5-mini` | Fast, cost-effective |

## Iterative Improvement

When you notice issues:
1. Add specific instructions preventing the problem
2. Update constraints guiding behavior
3. Add relevant commands to the development workflow
4. Consider specialized sub-agents for complex areas
