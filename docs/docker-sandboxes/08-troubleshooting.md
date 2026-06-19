# Troubleshooting

Source: https://docs.docker.com/ai/sandboxes/troubleshooting/

## Diagnostics

Run the built-in diagnostic tool first:

```console
$ sbx diagnose
$ sbx diagnose --output json
$ sbx diagnose --output github-issue   # formats output for filing a bug
$ sbx diagnose --upload                # uploads a diagnostics bundle
```

## Reset Procedures

Full reset (stops all VMs, deletes sandbox data):

```console
$ sbx reset
```

Preserve secrets during reset:

```console
$ sbx reset --preserve-secrets
```

> Use `--preserve-secrets` when recovering from a version mismatch — downgrading can cause database errors that require a reset.

## Network & API Access Issues

### Check Blocked Requests

```console
$ sbx policy log
```

### Allow Specific Domains

```console
$ sbx policy allow network "*.npmjs.org,*.pypi.org,files.pythonhosted.org"
```

### Allow All Outbound Traffic (Debugging Only)

```console
$ sbx policy allow network "**"
```

### Non-HTTP Connections (e.g., SSH)

Hostname-based rules don't work for non-HTTP connections — use IP addresses:

```console
$ sbx policy allow network "10.1.2.3:22"
```

Alternative for Git: use HTTPS instead of SSH:

```console
$ git clone https://github.com/owner/repo.git
```

## Authentication Issues

### Docker Login Expired

```console
$ sbx login
```

### SSH Agent Empty

```console
$ ssh-add -L         # should list keys
$ ssh-add ~/.ssh/id_ed25519   # load signing key if empty
```

### Git SSH Signing Configuration

```console
$ git config --global gpg.format ssh
$ git config --global user.signingkey "key::$(ssh-add -L | head -n 1)"
```

## Certificate & Proxy Issues

### Install an Internal CA

```console
$ sbx cp ./internal-ca.crt <sandbox-name>:/tmp/internal-ca.crt
$ sbx exec <sandbox-name> -- sudo install -m 0644 /tmp/internal-ca.crt /usr/local/share/ca-certificates/internal-ca.crt
$ sbx exec <sandbox-name> -- sudo update-ca-certificates
```

Or inject via a Kit:

```console
$ sbx run claude --kit ./internal-ca/
```

> **Important:** Install the CA into the system trust store. Overriding TLS environment variables breaks the credential proxy functionality.

## Docker Build Issues

Fix ownership errors in Docker build output:

```console
$ mkdir -p ./result
$ docker build --output type=tar,dest=- . | tar xf - -C ./result
```

## Performance Optimization

### Enable Virtiofs Caching (Windows)

```console
$ DOCKER_SANDBOXES_ENABLE_VIRTIOFS_CACHE=1 sbx run <template>
```

### Disable Caching if Corrupted

```console
$ DOCKER_SANDBOXES_ENABLE_VIRTIOFS_CACHE=0 sbx run <template>
```

## WSL Git Repository Issues

```powershell
> git config --global --add safe.directory '%(prefix)///wsl.localhost/Ubuntu/home/you/repo'
> sbx run --clone claude \\wsl.localhost\Ubuntu\home\you\repo
```

## Complete State Removal

### macOS

```console
$ rm -rf ~/Library/Application\ Support/com.docker.sandboxes/
```

### Windows

```powershell
> Remove-Item -Recurse -Force "$env:LOCALAPPDATA\DockerSandboxes"
```

### Linux

```console
$ rm -rf ~/.local/state/sandboxes/
$ rm -rf ~/.cache/sandboxes/
$ rm -rf ~/.config/sandboxes/
```

## Filing Issues

Generate and upload a diagnostics bundle:

```console
$ sbx diagnose --upload
```

File at: [github.com/docker/sbx-releases/issues](https://github.com/docker/sbx-releases/issues)
