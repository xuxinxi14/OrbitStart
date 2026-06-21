# OrbitStart Plugin API

Status: manifest-first local plugin API with isolated Worker execution for local
third-party plugin runtime code.

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
  settings: {
    get<T = unknown>(key: string, fallbackValue?: T): Promise<T | null>;
    set<T = unknown>(key: string, value: T): Promise<boolean>;
  };
  storage: {
    get<T = unknown>(key: string, fallbackValue?: T): Promise<T | null>;
    set<T = unknown>(key: string, value: T): Promise<boolean>;
    remove(key: string): Promise<boolean>;
    list(): Promise<Array<{ key: string; value: unknown }>>;
  };
  trips: {
    search(query: string): Promise<TripSearchResult[]>;
    open(itemId: string, tripId?: string): Promise<boolean>;
  };
}
```

`settings` and `storage` are host-mediated, plugin-scoped async APIs in the
Worker runtime:

```ts
ctx.settings.get<T>(key, fallbackValue?)
ctx.settings.set<T>(key, value)

ctx.storage.get<T>(key, fallbackValue?)
ctx.storage.set<T>(key, value)
ctx.storage.remove(key)
ctx.storage.list()

ctx.trips.search(query)
ctx.trips.open(itemId, tripId?)
```

## Current runtime

- Local manifest discovery under `%APPDATA%\OrbitStart\plugins`.
- Enable/disable state stored in SQLite.
- Permission display in the plugin manager.
- Safe mode, which disables local third-party plugins.
- Plugin event logs.
- Isolated Web Worker execution for local plugin `main.js` or `main.ts`.
- Worker bridge for command registration, search providers, toast feedback,
  plugin-scoped settings, plugin-scoped storage, and Trips search/open actions.
- Built-in plugins routed through the same command/search surface.

## Worker runtime boundaries

- OrbitStart loads `main.js` first, then `main.ts` if `main.js` is absent.
- Runtime code runs in a Web Worker, not in the main DOM window.
- Static runtime imports are not supported yet. Keep `main.ts` self-contained or
  ship a bundled `main.js`.
- `import type` is allowed in `main.ts` for local editor typings.
- Command and search provider ids are scoped to the plugin id by the host.
- Search result `run()` callbacks are proxied through the Worker bridge.
- `fetch`, `WebSocket`, and `importScripts` are blocked unless a future network
  permission enables them.

## Permissions currently enforced by the Worker bridge

- `ui:toast`: required for `ctx.ui.toast`.
- `storage:plugin`: required for `ctx.storage.*`.
- `settings:plugin`: required for `ctx.settings.*`.
- `trips:read`: required for `ctx.trips.search` and `ctx.trips.open`.
- `contributes.commands`: limits how many commands the plugin can register.
- `contributes.searchProviders`: limits how many search providers the plugin can
  register.

## Security model

Plugins must declare permissions before they can receive access to host
capabilities. Third-party code now runs behind the isolated Worker bridge by
default; native filesystem, shell, window, and network capabilities remain
unavailable until explicit host-mediated APIs are added.
