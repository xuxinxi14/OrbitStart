import { openObsidianNote, readPluginRuntime, recordPluginRuntimeEvent, searchObsidian, searchTrips } from "../lib/native";
import type { OrbitPluginManifest, SearchResult } from "../types";
import type { PluginContext, RegisteredCommand } from "./api";

type WorkerRuntimeMessage =
  | { type: "response"; requestId: string; ok: true; result?: unknown }
  | { type: "response"; requestId: string; ok: false; error: string }
  | { type: "host-request"; requestId: string; api: string; payload?: Record<string, unknown> }
  | { type: "register-command"; command: SerializableCommand }
  | { type: "unregister-command"; id: string }
  | { type: "register-search-provider"; id: string }
  | { type: "unregister-search-provider"; id: string }
  | { type: "ui-toast"; message: string }
  | { type: "runtime-log"; level: "info" | "warn" | "error"; message: string };

type SerializableCommand = Omit<RegisteredCommand, "run">;
type SerializableSearchResult = Omit<SearchResult, "run"> & { actionId?: string };

interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: number;
}

const WORKER_BOOTSTRAP = String.raw`
let pluginManifest = null;
let permissionSet = new Set();
let commandLimit = 0;
let searchProviderLimit = 0;
let commandCount = 0;
let searchProviderCount = 0;
let requestSeq = 0;
let actionSeq = 0;
let activePlugin = null;
const commandHandlers = new Map();
const searchProviders = new Map();
const searchActions = new Map();
const hostPending = new Map();

function toErrorMessage(error) {
  return error && error.message ? String(error.message) : String(error);
}

function hasPermission(permission) {
  return permissionSet.has(permission);
}

function postRuntimeLog(level, message) {
  self.postMessage({ type: "runtime-log", level, message });
}

function assertPermission(permission) {
  if (!hasPermission(permission)) {
    throw new Error("Permission denied: " + permission);
  }
}

function normalizeScopedId(id) {
  const raw = String(id || "").trim();
  if (!raw) throw new Error("Plugin registration id cannot be empty");
  const prefix = pluginManifest.id + ".";
  return raw.startsWith(prefix) ? raw : prefix + raw;
}

function sanitizeText(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function hostRequest(api, payload) {
  const requestId = "worker-" + (++requestSeq);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      hostPending.delete(requestId);
      reject(new Error("Host API timed out: " + api));
    }, 8000);
    hostPending.set(requestId, { resolve, reject, timer });
    self.postMessage({ type: "host-request", requestId, api, payload });
  });
}

function sendResponse(requestId, ok, result, error) {
  self.postMessage(ok
    ? { type: "response", requestId, ok: true, result }
    : { type: "response", requestId, ok: false, error });
}

function installRuntimeGuards() {
  if (!hasPermission("net:fetch") && !hasPermission("network:fetch")) {
    self.fetch = () => Promise.reject(new Error("Network access is not enabled for this plugin"));
    self.WebSocket = function WebSocketBlocked() {
      throw new Error("WebSocket access is not enabled for this plugin");
    };
  }
  self.importScripts = () => {
    throw new Error("importScripts is disabled in OrbitStart plugin workers");
  };
}

function createPluginContext() {
  return {
    commands: {
      registerCommand(command) {
        if (!command || typeof command.run !== "function") {
          throw new Error("ctx.commands.registerCommand requires a command with run()");
        }
        if (commandCount >= commandLimit) {
          throw new Error("Command contribution limit exceeded for " + pluginManifest.id);
        }
        const id = normalizeScopedId(command.id);
        commandCount += 1;
        commandHandlers.set(id, command.run);
        self.postMessage({
          type: "register-command",
          command: {
            id,
            title: sanitizeText(command.title, id),
            subtitle: sanitizeText(command.subtitle, pluginManifest.description || "OrbitStart plugin command"),
            pluginId: pluginManifest.id,
            icon: sanitizeText(command.icon, "Puzzle"),
            keywords: Array.isArray(command.keywords) ? command.keywords.map(String) : []
          }
        });
        return () => {
          if (commandHandlers.delete(id)) {
            commandCount = Math.max(0, commandCount - 1);
            self.postMessage({ type: "unregister-command", id });
          }
        };
      }
    },
    search: {
      registerProvider(id, provider) {
        if (typeof provider !== "function") {
          throw new Error("ctx.search.registerProvider requires a provider function");
        }
        if (searchProviderCount >= searchProviderLimit) {
          throw new Error("Search provider contribution limit exceeded for " + pluginManifest.id);
        }
        const providerId = normalizeScopedId(id);
        searchProviderCount += 1;
        searchProviders.set(providerId, provider);
        self.postMessage({ type: "register-search-provider", id: providerId });
        return () => {
          if (searchProviders.delete(providerId)) {
            searchProviderCount = Math.max(0, searchProviderCount - 1);
            self.postMessage({ type: "unregister-search-provider", id: providerId });
          }
        };
      }
    },
    ui: {
      toast(message) {
        assertPermission("ui:toast");
        self.postMessage({ type: "ui-toast", message: String(message ?? "") });
      }
    },
    settings: {
      get(key, fallbackValue) {
        return hostRequest("settings:get", { key, fallbackValue });
      },
      set(key, value) {
        return hostRequest("settings:set", { key, value });
      }
    },
    storage: {
      get(key, fallbackValue) {
        return hostRequest("storage:get", { key, fallbackValue });
      },
      set(key, value) {
        return hostRequest("storage:set", { key, value });
      },
      remove(key) {
        return hostRequest("storage:remove", { key });
      },
      list() {
        return hostRequest("storage:list", {});
      }
    },
    trips: {
      search(query) {
        return hostRequest("trips:search", { query });
      },
      open(itemId, tripId) {
        return hostRequest("trips:open", { itemId, tripId });
      }
    },
    obsidian: {
      search(query) {
        return hostRequest("obsidian:search", { query });
      },
      open(vaultId, relativePath, lineNumber) {
        return hostRequest("obsidian:open", { vaultId, relativePath, lineNumber });
      }
    }
  };
}

async function activatePlugin(payload) {
  pluginManifest = payload.plugin;
  permissionSet = new Set(payload.permissions || []);
  commandLimit = Number(pluginManifest.contributes && pluginManifest.contributes.commands) || 0;
  searchProviderLimit = Number(pluginManifest.contributes && pluginManifest.contributes.searchProviders) || 0;
  installRuntimeGuards();

  const ctx = createPluginContext();
  const exports = {};
  const factory = new Function("__orbit_exports", payload.source + "\nreturn __orbit_exports.default;");
  activePlugin = factory(exports);
  if (!activePlugin || typeof activePlugin.activate !== "function") {
    throw new Error("Plugin default export must provide activate(ctx)");
  }
  await activePlugin.activate(ctx);
}

async function queryProvider(payload) {
  const provider = searchProviders.get(payload.providerId);
  if (!provider) return [];
  const rawResults = await provider(String(payload.query || ""));
  const results = Array.isArray(rawResults) ? rawResults : [];
  return results.map((result, index) => {
    const source = result && typeof result === "object" ? result : {};
    const run = source.run;
    const actionId = typeof run === "function"
      ? pluginManifest.id + ":action:" + (++actionSeq)
      : undefined;
    if (actionId) searchActions.set(actionId, run);
    return {
      id: sanitizeText(source.id, payload.providerId + ":" + index),
      title: sanitizeText(source.title, pluginManifest.name),
      subtitle: sanitizeText(source.subtitle, pluginManifest.description || ""),
      icon: sanitizeText(source.icon, "Puzzle"),
      source: sanitizeText(source.source, pluginManifest.id),
      actionLabel: sanitizeText(source.actionLabel, "执行"),
      actionId
    };
  });
}

async function handleRequest(message) {
  try {
    let result;
    switch (message.action) {
      case "activate":
        await activatePlugin(message.payload);
        result = { activated: true };
        break;
      case "run-command": {
        const handler = commandHandlers.get(message.payload.commandId);
        if (!handler) throw new Error("Command not found: " + message.payload.commandId);
        result = await handler();
        break;
      }
      case "query-provider":
        result = await queryProvider(message.payload);
        break;
      case "run-search-action": {
        const action = searchActions.get(message.payload.actionId);
        if (!action) throw new Error("Search action not found: " + message.payload.actionId);
        result = await action();
        break;
      }
      case "deactivate":
        if (activePlugin && typeof activePlugin.deactivate === "function") {
          await activePlugin.deactivate();
        }
        result = { deactivated: true };
        break;
      default:
        throw new Error("Unknown worker action: " + message.action);
    }
    sendResponse(message.requestId, true, result);
  } catch (error) {
    const messageText = toErrorMessage(error);
    postRuntimeLog("error", messageText);
    sendResponse(message.requestId, false, undefined, messageText);
  }
}

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "host-response") {
    const pending = hostPending.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    hostPending.delete(message.requestId);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error || "Host API failed"));
    return;
  }
  if (message.type === "request") {
    void handleRequest(message);
  }
};
`;

let workerUrl: string | null = null;

function getWorkerUrl() {
  if (!workerUrl) {
    workerUrl = URL.createObjectURL(new Blob([WORKER_BOOTSTRAP], { type: "text/javascript" }));
  }
  return workerUrl;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function preparePluginSource(source: string, entry: string) {
  let next = source.replace(/^\s*import\s+type\s+[^;]+;\s*/gm, "");
  if (/^\s*import\s+(?!type\b)/m.test(next)) {
    throw new Error("Plugin runtime does not support static imports yet. Bundle the plugin or keep main.ts self-contained.");
  }
  next = next
    .replace(/^\s*export\s+\{\s*\};?\s*$/gm, "")
    .replace(/\s+satisfies\s+OrbitPlugin\b/g, "")
    .replace(/:\s*OrbitPlugin\b/g, "")
    .replace(/:\s*OrbitPluginContext\b/g, "")
    .replace(/export\s+default\s+/g, "__orbit_exports.default = ");
  return `${next}\n//# sourceURL=orbit-plugin://${entry}`;
}

function scopedStoragePrefix(pluginId: string, namespace: "settings" | "storage") {
  return `orbitstart.plugin.${pluginId}.${namespace}.`;
}

function encodeStorageKey(key: unknown) {
  const text = String(key ?? "").trim();
  if (!text) throw new Error("Storage key cannot be empty");
  if (text.length > 128) throw new Error("Storage key is too long");
  return encodeURIComponent(text);
}

function readJsonValue(raw: string | null, fallbackValue: unknown) {
  if (raw === null) return fallbackValue ?? null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallbackValue ?? null;
  }
}

export class WorkerPluginRuntime {
  private worker: Worker | null = null;
  private disposed = false;
  private requestSeq = 0;
  private commandDisposers = new Map<string, () => void>();
  private providerDisposers = new Map<string, () => void>();
  private pending = new Map<string, PendingRequest>();
  private permissionIds: Set<string>;

  constructor(
    private readonly plugin: OrbitPluginManifest,
    private readonly ctx: PluginContext
  ) {
    this.permissionIds = new Set(plugin.permissions.map((permission) => permission.id));
  }

  async start() {
    if (this.disposed || this.plugin.builtin || !this.plugin.enabled) return;
    try {
      const runtime = await readPluginRuntime(this.plugin.id);
      if (!runtime) {
        await this.log("warn", "Plugin has no main.js or main.ts runtime entry.");
        return;
      }

      const source = preparePluginSource(runtime.source, runtime.entry);
      this.worker = new Worker(getWorkerUrl(), { name: `OrbitStart:${this.plugin.id}` });
      this.worker.onmessage = (event) => void this.handleMessage(event.data as WorkerRuntimeMessage);
      this.worker.onerror = (event) => {
        void this.log("error", event.message || "Plugin worker crashed.");
      };
      await this.request(
        "activate",
        {
          plugin: this.plugin,
          permissions: runtime.permissions,
          source
        },
        8000
      );
      await this.log("info", `Worker runtime activated from ${runtime.entry}.`);
    } catch (error) {
      await this.log("error", `Worker activation failed: ${toErrorMessage(error)}`);
      this.terminate();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const dispose of this.commandDisposers.values()) dispose();
    for (const dispose of this.providerDisposers.values()) dispose();
    this.commandDisposers.clear();
    this.providerDisposers.clear();
    if (this.worker) {
      void this.request("deactivate", {}, 1000).finally(() => this.terminate());
      window.setTimeout(() => this.terminate(), 1200);
    }
  }

  private terminate() {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error("Plugin worker stopped."));
    }
    this.pending.clear();
  }

  private request<T = unknown>(action: string, payload: unknown, timeoutMs = 5000): Promise<T> {
    if (!this.worker) return Promise.reject(new Error("Plugin worker is not running."));
    const requestId = `${this.plugin.id}:${++this.requestSeq}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Plugin worker timed out during ${action}.`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timer });
      this.worker?.postMessage({ type: "request", requestId, action, payload });
    });
  }

  private async handleMessage(message: WorkerRuntimeMessage) {
    if (message.type === "response") {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      window.clearTimeout(pending.timer);
      this.pending.delete(message.requestId);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error));
      return;
    }

    if (message.type === "register-command") {
      this.registerCommand(message.command);
      return;
    }
    if (message.type === "unregister-command") {
      this.commandDisposers.get(message.id)?.();
      this.commandDisposers.delete(message.id);
      return;
    }
    if (message.type === "register-search-provider") {
      this.registerSearchProvider(message.id);
      return;
    }
    if (message.type === "unregister-search-provider") {
      this.providerDisposers.get(message.id)?.();
      this.providerDisposers.delete(message.id);
      return;
    }
    if (message.type === "ui-toast") {
      if (this.hasPermission("ui:toast")) {
        this.ctx.ui.toast(message.message);
      } else {
        await this.log("warn", "Blocked ui.toast because ui:toast permission is missing.");
      }
      return;
    }
    if (message.type === "runtime-log") {
      await this.log(message.level, message.message);
      return;
    }
    if (message.type === "host-request") {
      await this.handleHostRequest(message.requestId, message.api, message.payload ?? {});
    }
  }

  private registerCommand(command: SerializableCommand) {
    if (this.commandDisposers.has(command.id)) {
      this.commandDisposers.get(command.id)?.();
    }
    const dispose = this.ctx.commands.registerCommand({
      ...command,
      pluginId: this.plugin.id,
      run: async () => {
        await this.request("run-command", { commandId: command.id }, 10000);
      }
    });
    this.commandDisposers.set(command.id, dispose);
  }

  private registerSearchProvider(providerId: string) {
    if (this.providerDisposers.has(providerId)) {
      this.providerDisposers.get(providerId)?.();
    }
    const dispose = this.ctx.search.registerProvider(providerId, async (query) => {
      const results = await this.request<SerializableSearchResult[]>(
        "query-provider",
        { providerId, query },
        3500
      );
      return results.map((result) => ({
        ...result,
        run: async () => {
          if (result.actionId) {
            await this.request("run-search-action", { actionId: result.actionId }, 10000);
          } else {
            this.ctx.ui.toast(result.title);
          }
        }
      }));
    });
    this.providerDisposers.set(providerId, dispose);
  }

  private async handleHostRequest(requestId: string, api: string, payload: Record<string, unknown>) {
    try {
      const result = await this.resolveHostRequest(api, payload);
      this.worker?.postMessage({ type: "host-response", requestId, ok: true, result });
    } catch (error) {
      this.worker?.postMessage({
        type: "host-response",
        requestId,
        ok: false,
        error: toErrorMessage(error)
      });
      await this.log("warn", `Host API blocked or failed: ${api} (${toErrorMessage(error)})`);
    }
  }

  private resolveHostRequest(api: string, payload: Record<string, unknown>) {
    if (api.startsWith("storage:")) this.requirePermission("storage:plugin");
    if (api.startsWith("settings:")) this.requirePermission("settings:plugin");
    if (api.startsWith("trips:")) this.requirePermission("trips:read");
    if (api.startsWith("obsidian:")) this.requirePermission("obsidian:read");

    if (api === "storage:get") return this.readScopedValue("storage", payload.key, payload.fallbackValue);
    if (api === "storage:set") return this.writeScopedValue("storage", payload.key, payload.value);
    if (api === "storage:remove") return this.removeScopedValue("storage", payload.key);
    if (api === "storage:list") return this.listScopedValues("storage");
    if (api === "settings:get") return this.readScopedValue("settings", payload.key, payload.fallbackValue);
    if (api === "settings:set") return this.writeScopedValue("settings", payload.key, payload.value);
    if (api === "trips:search") return searchTrips(String(payload.query ?? ""));
    if (api === "trips:open") {
      window.dispatchEvent(new CustomEvent("orbit-open-trip", {
        detail: {
          itemId: String(payload.itemId ?? ""),
          tripId: String(payload.tripId ?? "")
        }
      }));
      return true;
    }
    if (api === "obsidian:search") return searchObsidian(String(payload.query ?? ""));
    if (api === "obsidian:open") {
      const vaultId = String(payload.vaultId ?? "");
      const relativePath = String(payload.relativePath ?? "");
      const rawLine = Number(payload.lineNumber);
      const lineNumber = Number.isFinite(rawLine) && rawLine > 0 ? rawLine : undefined;
      if (!vaultId || !relativePath) {
        window.dispatchEvent(new CustomEvent("orbit-open-obsidian"));
        return true;
      }
      return openObsidianNote(vaultId, relativePath, lineNumber);
    }
    throw new Error(`Unknown host API: ${api}`);
  }

  private readScopedValue(namespace: "settings" | "storage", key: unknown, fallbackValue: unknown) {
    const storageKey = scopedStoragePrefix(this.plugin.id, namespace) + encodeStorageKey(key);
    return readJsonValue(window.localStorage.getItem(storageKey), fallbackValue);
  }

  private writeScopedValue(namespace: "settings" | "storage", key: unknown, value: unknown) {
    const storageKey = scopedStoragePrefix(this.plugin.id, namespace) + encodeStorageKey(key);
    window.localStorage.setItem(storageKey, JSON.stringify(value));
    return true;
  }

  private removeScopedValue(namespace: "settings" | "storage", key: unknown) {
    const storageKey = scopedStoragePrefix(this.plugin.id, namespace) + encodeStorageKey(key);
    window.localStorage.removeItem(storageKey);
    return true;
  }

  private listScopedValues(namespace: "settings" | "storage") {
    const prefix = scopedStoragePrefix(this.plugin.id, namespace);
    const entries: Array<{ key: string; value: unknown }> = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index);
      if (!storageKey?.startsWith(prefix)) continue;
      const key = decodeURIComponent(storageKey.slice(prefix.length));
      entries.push({ key, value: readJsonValue(window.localStorage.getItem(storageKey), null) });
    }
    return entries;
  }

  private hasPermission(permission: string) {
    return this.permissionIds.has(permission);
  }

  private requirePermission(permission: string) {
    if (!this.hasPermission(permission)) throw new Error(`Permission denied: ${permission}`);
  }

  private async log(level: "info" | "warn" | "error", message: string) {
    await recordPluginRuntimeEvent(this.plugin.id, level, message);
  }
}
