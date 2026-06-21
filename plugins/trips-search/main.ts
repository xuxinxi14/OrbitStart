import type { OrbitPlugin } from "./orbitstart-plugin-api";

const plugin: OrbitPlugin = {
  activate(ctx) {
    ctx.commands.registerCommand({
      id: "open",
      title: "打开 Trips",
      subtitle: "查看资源提示笔记、快捷键、流程和状态记录。",
      icon: "Lightbulb",
      keywords: ["trips", "notes", "usage", "提示", "笔记"],
      run: async () => {
        await ctx.trips.open("", "");
        ctx.ui.toast("已打开 Trips 页面");
      }
    });

    ctx.search.registerProvider("content", async (query) => {
      const q = query.trim();
      if (q.length < 2) return [];
      const results = await ctx.trips.search(q);
      return results.map((result) => {
        const preview = result.trip.content.replace(/[#*_`|>-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 88);
        return {
          id: `trips-search.${result.trip.id}`,
          title: `[Trip] ${result.itemTitle} · ${result.trip.title}`,
          subtitle: preview || result.trip.tags.join(", ") || "资源提示笔记",
          icon: "Lightbulb",
          source: "trips-search",
          actionLabel: "查看 Trip",
          run: () => ctx.trips.open(result.itemId, result.trip.id)
        };
      });
    });
  }
};

export default plugin;
