# Customizing Sandboxes

Source: https://docs.docker.com/ai/sandboxes/customize/

Two customization primitives are available: **Templates** and **Kits**.

## Templates

Pre-built Docker images that extend a base agent environment with tools, packages, and configurations baked in. Templates are pulled when creating a sandbox.

Best for: system packages, language toolchains, large dependencies — anything you'd rather not reinstall every session.

See [Templates](./06a-customize-templates.md).

## Kits

YAML files applied at sandbox creation time. Kits can extend agents with tools, credentials, network rules, and files, or define entirely new agents from scratch.

Best for: things that vary per agent or per team — shared linter config, project-specific install steps, credential injection.

> **Note:** Kits are experimental; the format and CLI commands may change.

See [Kits](./06b-customize-kits.md).

## Choosing Between Templates and Kits

| Goal | Solution |
|------|----------|
| Pre-install reusable tools/packages | Template |
| Capture a configured sandbox for reuse | Saved template |
| Add tool/credential/config via YAML | Kit (mixin) |
| Define a new agent from scratch | Kit (sandbox) |

Templates and kits work together — kits can reference template images. Teams can maintain one template with multiple lightweight kits layered on top.
