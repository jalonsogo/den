# ACP — Editor Integration

Source: https://docs.docker.com/ai/docker-agent/integrations/acp/

The Agent Client Protocol (ACP) enables running agents directly within code editors. Docker Agent provides AI capabilities while the editor manages file operations, keeping the agent synchronized with your project's filesystem context.

When running with ACP, the agent becomes part of your editor's environment rather than operating as a separate terminal process. File requests route through the editor instead of direct filesystem access.

## Prerequisites

- Docker Agent installed
- A YAML agent configuration file
- A supported editor: Neovim, Zed, or IntelliJ
- Model provider API keys set in your shell environment

## Editor Setup

### Zed

Add to `settings.json`:

```json
{
  "agent_servers": {
    "my-agent-team": {
      "command": "docker",
      "args": ["agent", "serve", "acp", "agent.yml"]
    }
  }
}
```

### Neovim

Install the CodeCompanion plugin and extend the dockeragent adapter:

```lua
require("codecompanion").setup({
  adapters = {
    acp = {
      dockeragent = function()
        return require("codecompanion.adapters").extend("dockeragent", {
          commands = {
            default = {"docker", "agent", "serve", "acp", "agent.yml"}
          }
        })
      end
    }
  }
})
```

Launch with `:CodeCompanion`.

## Specifying the Agent Configuration

```console
# Local file
docker agent serve acp ./agent.yml

# OCI registry reference
docker agent serve acp agentcatalog/pirate
docker agent serve acp dockereng/myagent:v1.0.0
```

## Testing & Troubleshooting

- Verify the working directory matches what the editor expects
- Confirm the configuration file path is correct
- Check that the editor has ACP protocol support enabled
