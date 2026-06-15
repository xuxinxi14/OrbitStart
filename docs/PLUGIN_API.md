# OrbitStart Plugin API

Status: manifest-first local plugin API.

OrbitStart uses an Obsidian-inspired architecture: the app core owns stable
local data, while plugins contribute commands, search providers, views, themes,
and importers through a manifest and a constrained runtime API.

## Manifest fields

- `id`: stable plugin id.
- `name`: display name.
- `version`: plugin version.
- `description`: short description.
- `enabled`: default enabled state.
- `builtin`: whether the plugin ships with OrbitStart.
- `permissions`: declared capabilities with `low`, `medium`, or `high` risk.
- `contributes`: counts for commands, search providers, themes, and views.

## Runtime context

```ts
export interface OrbitPlugin {
  activate(ctx: OrbitPluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface OrbitPluginContext {
  commands: {
    registerCommand(command: RegisteredCommand): () => void;
  };
  search: {
    registerProvider(id: string, provider: SearchProvider): () => void;
  };
  ui: {
    toast(message: string): void;
  };
  settings: unknown;
  storage: unknown;
}
```

## Current runtime

- Local manifest discovery under `%APPDATA%\OrbitStart\plugins`.
- Enable/disable state stored in SQLite.
- Permission display in the plugin manager.
- Safe mode, which disables local third-party plugins.
- Plugin event logs.
- Manifest-driven local command and search examples.
- Built-in plugins routed through the same command/search surface.

## Security model

Plugins must declare permissions before they can receive access to native
capabilities. Third-party code execution should run in an isolated worker or
sidecar process before unrestricted plugin code is enabled by default. The
current implementation keeps local arbitrary code execution behind the
manifest/runtime boundary.
