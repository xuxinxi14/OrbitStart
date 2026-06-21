import type { OrbitCommand, OrbitPluginManifest, SearchResult } from "../types";
import { WorkerPluginRuntime } from "./workerRuntime";

type CommandHandler = () => void | Promise<void>;
type SearchProvider = (query: string) => SearchResult[] | Promise<SearchResult[]>;

export interface RegisteredCommand extends OrbitCommand {
  run: CommandHandler;
}

interface DisposableRuntime {
  start?(): void | Promise<void>;
  dispose(): void;
}

export class PluginContext {
  private readonly commandRegistry = new Map<string, RegisteredCommand>();
  private readonly searchProviders = new Map<string, SearchProvider>();
  private readonly runtimes = new Set<DisposableRuntime>();
  private readonly listeners = new Set<() => void>();
  private started = false;
  private disposed = false;

  commands = {
    registerCommand: (command: RegisteredCommand) => {
      if (this.disposed) return () => undefined;
      this.commandRegistry.set(command.id, command);
      this.notify();
      return () => {
        this.commandRegistry.delete(command.id);
        this.notify();
      };
    },
    list: () => Array.from(this.commandRegistry.values()),
    run: async (id: string) => {
      const command = this.commandRegistry.get(id);
      if (!command) {
        throw new Error(`Command not found: ${id}`);
      }
      await command.run();
    }
  };

  search = {
    registerProvider: (id: string, provider: SearchProvider) => {
      if (this.disposed) return () => undefined;
      this.searchProviders.set(id, provider);
      this.notify();
      return () => {
        this.searchProviders.delete(id);
        this.notify();
      };
    },
    query: async (text: string) => {
      const providers = Array.from(this.searchProviders.entries());
      const settled = await Promise.all(
        providers.map(async ([id, provider]) => {
          try {
            return await provider(text);
          } catch (error) {
            console.error(`Search provider failed: ${id}`, error);
            return [];
          }
        })
      );
      return settled.flat();
    }
  };

  ui = {
    toast: (message: string) => {
      window.dispatchEvent(new CustomEvent("orbit-toast", { detail: message }));
    }
  };

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  addRuntime(runtime: DisposableRuntime) {
    if (this.disposed) {
      runtime.dispose();
      return;
    }
    this.runtimes.add(runtime);
    if (this.started) void runtime.start?.();
  }

  start() {
    if (this.disposed || this.started) return;
    this.started = true;
    for (const runtime of this.runtimes) void runtime.start?.();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const runtime of this.runtimes) runtime.dispose();
    this.runtimes.clear();
    this.commandRegistry.clear();
    this.searchProviders.clear();
    this.notify();
    this.listeners.clear();
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

function enabled(plugins: OrbitPluginManifest[], id: string) {
  return plugins.some((plugin) => plugin.id === id && plugin.enabled);
}

function activateLocalPluginRuntime(ctx: PluginContext, plugin: OrbitPluginManifest) {
  const runtime = new WorkerPluginRuntime(plugin, ctx);
  ctx.addRuntime(runtime);
}

export function createOrbitPluginHost(plugins: OrbitPluginManifest[] = []) {
  const ctx = new PluginContext();

  for (const plugin of plugins.filter((candidate) => candidate.enabled && !candidate.builtin)) {
    activateLocalPluginRuntime(ctx, plugin);
  }

  if (enabled(plugins, "core-clipboard")) {
    ctx.commands.registerCommand({
      id: "core-clipboard.readText",
      title: "读取剪贴板文本",
      subtitle: "把当前剪贴板文本显示为临时结果",
      pluginId: "core-clipboard",
      icon: "Copy",
      keywords: ["clipboard", "copy", "paste", "剪贴板"],
      run: async () => {
        try {
          const text = await navigator.clipboard.readText();
          ctx.ui.toast(text ? `剪贴板：${text.slice(0, 80)}` : "剪贴板为空");
        } catch (error) {
          ctx.ui.toast(`读取剪贴板失败：${String(error)}`);
        }
      }
    });
  }

  if (enabled(plugins, "core-everything")) {
    ctx.search.registerProvider("core-everything.local-search", async (query) => {
      if (!query.trim()) return [];
      return [
        {
          id: `everything-${query}`,
          title: `Everything 搜索：${query}`,
          subtitle: "提供统一的本地文件搜索入口，可连接 Everything 服务扩展索引范围",
          icon: "Search",
          source: "core-everything",
          actionLabel: "打开数据目录",
          run: () => ctx.ui.toast("Everything 插件接口已就绪")
        }
      ];
    });
  }

  if (enabled(plugins, "core-window-switcher")) {
    ctx.search.registerProvider("core-window-switcher.window-query", async (query) => {
      if (!query.toLowerCase().includes("window") && !query.includes("窗口")) return [];
      return [
        {
          id: "window-switcher-status",
          title: "窗口切换插件",
          subtitle: "集中管理桌面窗口导航入口",
          icon: "PanelsTopLeft",
          source: "core-window-switcher",
          actionLabel: "查看状态",
          run: () => ctx.ui.toast("窗口切换插件已准备桌面导航入口")
        }
      ];
    });
  }

  return ctx;
}

export const createPhase0PluginHost = createOrbitPluginHost;
