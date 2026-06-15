import type { OrbitCommand, OrbitPluginManifest, SearchResult } from "../types";

type CommandHandler = () => void | Promise<void>;
type SearchProvider = (query: string) => SearchResult[] | Promise<SearchResult[]>;

export interface RegisteredCommand extends OrbitCommand {
  run: CommandHandler;
}

export class PluginContext {
  private readonly commandRegistry = new Map<string, RegisteredCommand>();
  private readonly searchProviders = new Map<string, SearchProvider>();

  commands = {
    registerCommand: (command: RegisteredCommand) => {
      this.commandRegistry.set(command.id, command);
      return () => this.commandRegistry.delete(command.id);
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
      this.searchProviders.set(id, provider);
      return () => this.searchProviders.delete(id);
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
}

function enabled(plugins: OrbitPluginManifest[], id: string) {
  return plugins.some((plugin) => plugin.id === id && plugin.enabled);
}

export function createOrbitPluginHost(plugins: OrbitPluginManifest[] = []) {
  const ctx = new PluginContext();

  for (const plugin of plugins.filter((candidate) => candidate.enabled && !candidate.builtin)) {
    ctx.commands.registerCommand({
      id: `${plugin.id}.hello`,
      title: `${plugin.name}: Hello`,
      subtitle: "本地插件 manifest 注册的命令",
      pluginId: plugin.id,
      icon: "Sparkles",
      keywords: [plugin.id, plugin.name, "local", "plugin"],
      run: () => ctx.ui.toast(`${plugin.name} 已响应命令`)
    });

    ctx.search.registerProvider(`${plugin.id}.manifest-search`, async (query) => {
      if (!query.trim()) return [];
      const haystack = `${plugin.id} ${plugin.name} ${plugin.description}`.toLowerCase();
      if (!haystack.includes(query.toLowerCase()) && query.length < 2) return [];
      return [
        {
          id: `${plugin.id}.manifest-result`,
          title: plugin.name,
          subtitle: plugin.description,
          icon: "Puzzle",
          source: plugin.id,
          actionLabel: "运行插件命令",
          run: () => ctx.ui.toast(`${plugin.name} 搜索结果已执行`)
        }
      ];
    });
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
