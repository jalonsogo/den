# sbx cp

**Description** — Copy files or directories between a sandbox and the host
**Usage** — `sbx cp [flags] SRC DST`

## Description

Either SRC or DST must be a sandbox path, written as SANDBOX:PATH. The other must be a local path. Copying between two sandboxes is not supported.

When copying a directory, the directory itself is placed at the destination. If the destination path does not exist it is created; if it already exists as a directory, the source is placed inside it.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-L, --follow-link` |  | Follow symbolic links in the source path |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |

## Examples

```
# Copy a file from host to sandbox
sbx cp ./config.json my-sandbox:/home/user/

# Copy a file from sandbox to host
sbx cp my-sandbox:/home/user/output.log ./

# Copy a directory
sbx cp ./src/ my-sandbox:/home/user/src
```
