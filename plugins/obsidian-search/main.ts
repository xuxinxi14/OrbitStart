import type { OrbitPlugin } from "./orbitstart-plugin-api";

const plugin: OrbitPlugin = {
  activate(ctx) {
    ctx.commands.registerCommand({
      id: "open",
      title: "打开 Obsidian 待办",
      subtitle: "查看本地 vault 的只读待办聚合面板。",
      icon: "NotebookText",
      keywords: ["obsidian", "todo", "task", "待办", "笔记"],
      run: async () => {
        await ctx.obsidian.open("", "");
        ctx.ui.toast("已打开 Obsidian 待办面板");
      }
    });

    ctx.search.registerProvider("tasks", async (query) => {
      const q = query.trim();
      if (q.length < 2) return [];
      const results = await ctx.obsidian.search(q);
      return results.map((result) => {
        const task = result.task;
        const labels = [
          result.vaultName,
          result.relativePath,
          task?.dueDate ? `due ${task.dueDate}` : "",
          task?.tags?.length ? task.tags.join(" ") : ""
        ].filter(Boolean);
        return {
          id: `obsidian-search.${result.id}`,
          title: `[Obsidian] ${result.title}`,
          subtitle: labels.join(" · ") || result.subtitle,
          icon: "NotebookText",
          source: "obsidian-search",
          actionLabel: "打开笔记",
          run: () => ctx.obsidian.open(result.vaultId, result.relativePath, result.lineNumber ?? undefined)
        };
      });
    });
  }
};

export default plugin;
