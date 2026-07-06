# den — Docker Sandboxes (VSCode extension)

A minimal companion to the [den](https://den.studio) desktop app: manage your
Docker Sandboxes (`sbx`) from within VSCode and open one in a Remote-SSH window.

## Features

- **Sandboxes view** in the Activity Bar — lists sandboxes from `sbx ls --json`
  with their agent and status.
- Per-sandbox actions:
  - **Open in VSCode** — attaches this VSCode over the sbx SSH endpoint (Remote-SSH).
  - **Start** / **Stop**.
  - **Open Shell** — an integrated terminal running `sbx exec -it <name> bash`.

## Requirements

- The **`sbx`** CLI installed and signed in.
- The **Remote - SSH** extension (`ms-vscode-remote.remote-ssh`).
- The experimental sbx SSH endpoint. The extension offers to enable it on first
  "Open in VSCode"; you can also enable it manually:
  ```
  sbx settings set platform.allowExperimentalFeatures true
  sbx settings set feature.ssh true
  sbx daemon stop && sbx daemon start
  ```

## Settings

- `den.sbxPath` — absolute path to the `sbx` CLI (auto-detected if empty).

## Develop

```bash
cd extension
npm install
npm run compile      # or: npm run watch
```

Press **F5** in VSCode to launch an Extension Development Host.

> Note: connection goes through `sbx ssh setup` (idempotent — writes a wildcard
> `Host *.sbx` block + managed key), after which VSCode opens
> `vscode-remote://ssh-remote+<name>.sbx<workspace>` (the sandbox name is the SSH
> hostname). `sbx ssh` is experimental, so watch the release notes as it evolves.
