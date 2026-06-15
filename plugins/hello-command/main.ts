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
  }
};

export default plugin;
