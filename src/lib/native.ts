import { phase0Snapshot } from "../data/catalog";
import type { ExportResult, OrbitItem, OrbitItemInput, Phase0Snapshot } from "../types";

const storageKey = "orbitstart.browser.items";
const snapshotKey = "orbitstart.browser.snapshot";

async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function readBrowserItems(): OrbitItem[] {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return phase0Snapshot.items;
  try {
    return JSON.parse(raw) as OrbitItem[];
  } catch {
    return phase0Snapshot.items;
  }
}

function writeBrowserItems(items: OrbitItem[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(items));
}

function readBrowserSnapshot(): Phase0Snapshot {
  const raw = window.localStorage.getItem(snapshotKey);
  if (!raw) {
    return {
      ...phase0Snapshot,
      items: readBrowserItems()
    };
  }
  try {
    return {
      ...phase0Snapshot,
      ...JSON.parse(raw),
      items: readBrowserItems()
    } as Phase0Snapshot;
  } catch {
    return {
      ...phase0Snapshot,
      items: readBrowserItems()
    };
  }
}

function writeBrowserSnapshot(snapshot: Phase0Snapshot) {
  window.localStorage.setItem(snapshotKey, JSON.stringify(snapshot));
  writeBrowserItems(snapshot.items);
}

function createBrowserItem(input: OrbitItemInput): OrbitItem {
  return {
    ...input,
    id: `${input.kind}-${Date.now()}`,
    launchCount: 0
  };
}

export async function loadSnapshot(): Promise<Phase0Snapshot> {
  try {
    return await invokeNative<Phase0Snapshot>("catalog_snapshot");
  } catch {
    return readBrowserSnapshot();
  }
}

export async function createItem(input: OrbitItemInput): Promise<OrbitItem> {
  try {
    return await invokeNative<OrbitItem>("create_item", { input });
  } catch {
    const items = readBrowserItems();
    const item = createBrowserItem(input);
    writeBrowserItems([item, ...items]);
    return item;
  }
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function extensionFromPath(path: string) {
  const name = fileNameFromPath(path);
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function fallbackInputFromPath(path: string): OrbitItemInput {
  const name = fileNameFromPath(path);
  const title = name.replace(/\.[^.]+$/, "") || name;
  const extension = extensionFromPath(path);
  const scriptExtensions = new Set(["ps1", "bat", "cmd", "sh", "py", "js", "ts", "vbs", "ahk"]);
  const appExtensions = new Set(["exe", "lnk", "appref-ms", "msi"]);
  if (scriptExtensions.has(extension)) {
    return {
      ...makeDroppedInputBase(title, path),
      kind: "script",
      group: "scripts",
      icon: "TerminalSquare",
      accent: "#41e0a8",
      tags: ["drag-drop", "script", extension].filter(Boolean)
    };
  }
  if (appExtensions.has(extension)) {
    return {
      ...makeDroppedInputBase(title, path),
      kind: "app",
      group: "apps",
      icon: "AppWindow",
      accent: "#5cc8ff",
      tags: ["drag-drop", "app", extension].filter(Boolean)
    };
  }
  return {
    ...makeDroppedInputBase(title, path),
    kind: "file",
    group: "work",
    icon: "FileText",
    accent: "#f6b95b",
    tags: ["drag-drop", "file", extension].filter(Boolean)
  };
}

function makeDroppedInputBase(title: string, path: string): OrbitItemInput {
  return {
    title,
    subtitle: path,
    kind: "file",
    group: "work",
    target: path,
    aliases: [title, path],
    tags: ["drag-drop"],
    icon: "FileText",
    accent: "#f6b95b",
    favorite: false
  };
}

export async function createItemsFromPaths(paths: string[]): Promise<OrbitItem[]> {
  try {
    return await invokeNative<OrbitItem[]>("create_items_from_paths", { paths });
  } catch {
    const current = readBrowserItems();
    const created = paths.map((path) => createBrowserItem(fallbackInputFromPath(path)));
    writeBrowserItems([...created, ...current]);
    return created;
  }
}

export async function pickResourceInput(mode: "file" | "folder"): Promise<OrbitItemInput | null> {
  try {
    return await invokeNative<OrbitItemInput | null>("pick_resource_input", { mode });
  } catch {
    return null;
  }
}

export async function pickIconImage(): Promise<string | null> {
  try {
    return await invokeNative<string | null>("pick_icon_image");
  } catch {
    return null;
  }
}

export async function createGroup(title: string): Promise<Phase0Snapshot["groups"]> {
  try {
    return await invokeNative<Phase0Snapshot["groups"]>("create_group", { title });
  } catch {
    const snapshot = readBrowserSnapshot();
    const id = `group-${Date.now()}`;
    const nextGroups = [
      ...snapshot.groups,
      {
        id,
        title,
        icon: "Bookmark",
        description: `自定义标签：${title}`,
        custom: true
      }
    ];
    writeBrowserSnapshot({ ...snapshot, groups: nextGroups });
    return nextGroups;
  }
}

export async function updateItem(item: OrbitItem): Promise<OrbitItem> {
  try {
    return await invokeNative<OrbitItem>("update_item", { item });
  } catch {
    const items = readBrowserItems().map((candidate) => (candidate.id === item.id ? item : candidate));
    writeBrowserItems(items);
    return item;
  }
}

export async function deleteItem(id: string): Promise<void> {
  try {
    await invokeNative<void>("delete_item", { id });
  } catch {
    writeBrowserItems(readBrowserItems().filter((item) => item.id !== id));
  }
}

export async function launchItem(id: string, target: string): Promise<string> {
  try {
    return await invokeNative<string>("launch_item", { id });
  } catch {
    return `本地预览模式：已模拟启动 ${target}`;
  }
}

export async function launchTarget(target: string): Promise<string> {
  try {
    return await invokeNative<string>("launch_target", { target });
  } catch {
    return `本地预览模式：已模拟启动 ${target}`;
  }
}

export async function revealTarget(target: string): Promise<string> {
  try {
    return await invokeNative<string>("reveal_target", { target });
  } catch {
    return `本地预览模式：已模拟打开所在位置 ${target}`;
  }
}

export async function scanShortcuts(): Promise<OrbitItem[]> {
  try {
    return await invokeNative<OrbitItem[]>("scan_shortcuts");
  } catch {
    return readBrowserItems();
  }
}

export async function scanBrowserBookmarks(): Promise<OrbitItem[]> {
  try {
    return await invokeNative<OrbitItem[]>("scan_browser_bookmarks");
  } catch {
    return readBrowserItems();
  }
}

export async function setPluginEnabled(id: string, enabled: boolean): Promise<Phase0Snapshot> {
  try {
    return await invokeNative<Phase0Snapshot>("set_plugin_enabled", { id, enabled });
  } catch {
    const snapshot = readBrowserSnapshot();
    const next = {
      ...snapshot,
      plugins: snapshot.plugins.map((plugin) => (plugin.id === id ? { ...plugin, enabled } : plugin))
    };
    writeBrowserSnapshot(next);
    return next;
  }
}

export async function setActiveTheme(themeId: string): Promise<Phase0Snapshot> {
  try {
    return await invokeNative<Phase0Snapshot>("set_active_theme", { themeId });
  } catch {
    const snapshot = readBrowserSnapshot();
    const next = {
      ...snapshot,
      settings: { ...snapshot.settings, activeThemeId: themeId }
    };
    writeBrowserSnapshot(next);
    return next;
  }
}

export async function setDensity(density: string): Promise<Phase0Snapshot> {
  try {
    return await invokeNative<Phase0Snapshot>("set_density", { density });
  } catch {
    const snapshot = readBrowserSnapshot();
    const next = {
      ...snapshot,
      settings: { ...snapshot.settings, density }
    };
    writeBrowserSnapshot(next);
    return next;
  }
}

export async function setCloseBehavior(closeBehavior: "tray" | "exit"): Promise<Phase0Snapshot> {
  try {
    return await invokeNative<Phase0Snapshot>("set_close_behavior", { behavior: closeBehavior });
  } catch {
    const snapshot = readBrowserSnapshot();
    const next = {
      ...snapshot,
      settings: { ...snapshot.settings, closeBehavior }
    };
    writeBrowserSnapshot(next);
    return next;
  }
}

export async function setSafeMode(enabled: boolean): Promise<Phase0Snapshot> {
  try {
    return await invokeNative<Phase0Snapshot>("set_safe_mode", { enabled });
  } catch {
    const snapshot = readBrowserSnapshot();
    const next = {
      ...snapshot,
      settings: { ...snapshot.settings, safeMode: enabled }
    };
    writeBrowserSnapshot(next);
    return next;
  }
}

export async function exportCatalogJson(): Promise<ExportResult> {
  try {
    return await invokeNative<ExportResult>("export_catalog_json");
  } catch {
    const exportedAt = `${Date.now()}`;
    const snapshot = readBrowserSnapshot();
    const json = JSON.stringify({ version: 2, exportedAt, items: snapshot.items, plugins: snapshot.plugins, activeThemeId: snapshot.settings.activeThemeId }, null, 2);
    return { path: "local-preview", json };
  }
}

export async function importCatalogJson(json: string): Promise<OrbitItem[]> {
  try {
    return await invokeNative<OrbitItem[]>("import_catalog_json", { json });
  } catch {
    const parsed = JSON.parse(json) as { items?: OrbitItem[] };
    const items = parsed.items ?? [];
    writeBrowserItems(items);
    return items;
  }
}

export async function createPluginTemplate(name: string): Promise<string> {
  try {
    return await invokeNative<string>("create_plugin_template", { name });
  } catch {
    return `local-preview/plugins/${name}`;
  }
}

export async function openDataDirectory(): Promise<string> {
  try {
    return await invokeNative<string>("open_data_directory");
  } catch {
    return "local-preview";
  }
}

export async function openAuxWindow(panel: "settings" | "plugins" | "themes" | "about"): Promise<void> {
  try {
    await invokeNative<void>("open_aux_window", { panel });
  } catch {
    window.location.hash = panel === "settings" ? "settings" : `settings-${panel}`;
  }
}
