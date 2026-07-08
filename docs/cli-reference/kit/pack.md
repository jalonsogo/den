# sbx kit pack

**Description** — Package a directory as a kit artifact
**Usage** — `sbx kit pack DIRECTORY [flags]`

**Experimental**

**This command is experimental.**

Experimental features are intended for testing and feedback as their functionality or design may change between releases without warning or can be removed entirely in a future release.

## Description

Validate and package a kit artifact directory as a ZIP file.

The directory must contain a valid spec.yaml and an optional files/ directory.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-o, --output` |  | Output ZIP file path (default: <name>.zip) |

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-D, --debug` |  | Enable debug logging |
