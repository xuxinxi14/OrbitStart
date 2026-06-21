# OrbitStart Plugin Development

OrbitStart uses a manifest-first plugin model. The current runtime supports
safe local discovery, enable/disable state, permissions, logs, isolated Worker
execution, command registration, search-provider registration, toast feedback,
and plugin-scoped settings/storage.

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

Add these permissions only when the plugin uses the matching API:

- `ui:toast`: `ctx.ui.toast`
- `storage:plugin`: `ctx.storage.*`
- `settings:plugin`: `ctx.settings.*`
- `trips:read`: `ctx.trips.search` and `ctx.trips.open`

`contributes.commands` and `contributes.searchProviders` are enforced by the
Worker bridge as registration limits.

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
- isolated Worker execution for `main.js` or `main.ts`
- command registration through `ctx.commands.registerCommand`
- search-provider registration through `ctx.search.registerProvider`
- proxied search result actions
- toast feedback through `ctx.ui.toast`
- plugin-scoped async settings and storage
- Trips host bridge for searching and opening resource hint notes
- safe mode for disabling local plugins

Runtime boundaries:

- OrbitStart loads `main.js` first, then `main.ts`.
- Keep runtime code self-contained. Static runtime imports are not supported yet.
- `import type` is allowed in `main.ts` for local typings.
- The supported TypeScript subset is JavaScript-compatible code plus simple
  `import type` and `OrbitPlugin` annotations. For complex TypeScript, bundle to
  `main.js` before packaging.
- Worker code has no DOM access. Host APIs must go through `ctx`.
- Network APIs are blocked until a dedicated network permission is implemented.

Planned next:

- signed package verification
- per-plugin settings UI
- network permission prompts
