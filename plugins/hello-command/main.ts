import type { OrbitPlugin } from "./orbitstart-plugin-api";

const plugin: OrbitPlugin = {
  activate(ctx) {
    ctx.commands.registerCommand({
      id: "hello-command.sayHello",
      title: "Hello from local plugin",
      subtitle: "This is the smallest useful OrbitStart plugin.",
      icon: "Sparkles",
      keywords: ["hello", "demo"],
      run: () => ctx.ui.toast("Hello from a local plugin")
    });

    ctx.search.registerProvider("hello-command.search", async (query) => {
      if (!query.toLowerCase().includes("hello")) return [];
      return [
        {
          id: "hello-command.searchResult",
          title: "Hello plugin search result",
          subtitle: "This result is produced by main.ts inside an isolated worker.",
          icon: "Sparkles",
          source: "hello-command",
          actionLabel: "Show toast",
          run: () => ctx.ui.toast(`Hello search matched: ${query}`)
        }
      ];
    });
  }
};

export default plugin;
