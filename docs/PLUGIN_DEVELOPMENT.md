# OrbitStart Plugin Development

OrbitStart uses a manifest-first plugin model. The current runtime supports
safe local discovery, enable/disable state, permissions, logs, commands, and
search-provider registration. Arbitrary third-party code execution stays behind
the manifest permission model.

## Plugin layout

```text
my-command-plugin/
  plugin.json
  main.ts
  README.md
```

## Minimal manifest

```json
{
  "id": "my-command-plugin",
  "name": "My Command Plugin",
  "version": "0.1.0",
  "description": "Adds one command to OrbitStart.",
  "enabled": true,
  "builtin": false,
  "permissions": [
    { "id": "ui:toast", "label": "Show toast messages", "risk": "low" }
  ],
  "contributes": {
    "commands": 1,
    "searchProviders": 1,
    "themes": 0,
    "views": 0
  }
}
```

## Local install path

OrbitStart creates a user plugin directory at:

```text
%APPDATA%\OrbitStart\plugins
```

Each plugin is a folder containing `plugin.json`. The app reads manifests from
that directory and stores enable/disable state in SQLite.

## Package a plugin

From the repository root:

```powershell
npm.cmd run package:plugin -- -PluginPath .\plugins\hello-command
```

The package is written to:

```text
output\plugins\<plugin-id>-<version>.orbit-plugin.zip
```

## Runtime scope

Implemented now:

- manifest discovery
- enable/disable state
- permission display
- plugin logs
- manifest-driven local command/search examples
- safe mode for disabling local plugins

Planned next:

- isolated worker execution for `main.ts`
- signed package verification
- per-plugin settings UI
- network permission prompts
