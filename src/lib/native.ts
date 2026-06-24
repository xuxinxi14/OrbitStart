import { phase0Snapshot } from "../data/catalog";
import type {
  ExportResult,
  ObsidianNoteIndex,
  ObsidianScanResult,
  ObsidianSearchResult,
  ObsidianTask,
  ObsidianVaultConfig,
  OrbitItem,
  OrbitItemInput,
  Phase0Snapshot,
  PluginRuntimeSource,
  Trip,
  TripInput,
  TripSearchResult,
  TripUpdateInput
} from "../types";

const storageKey = "orbitstart.browser.items";
const snapshotKey = "orbitstart.browser.snapshot";
const tripsKey = "orbitstart.browser.trips";
const obsidianVaultsKey = "orbitstart.browser.obsidian.vaults";
const obsidianNotesKey = "orbitstart.browser.obsidian.notes";
const obsidianTasksKey = "orbitstart.browser.obsidian.tasks";

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

function readBrowserTrips(): Trip[] {
  const raw = window.localStorage.getItem(tripsKey);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Trip[];
  } catch {
    return [];
  }
}

function writeBrowserTrips(trips: Trip[]) {
  window.localStorage.setItem(tripsKey, JSON.stringify(trips));
}

function readBrowserObsidianVaults(): ObsidianVaultConfig[] {
  const raw = window.localStorage.getItem(obsidianVaultsKey);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ObsidianVaultConfig[];
  } catch {
    return [];
  }
}

function writeBrowserObsidianVaults(vaults: ObsidianVaultConfig[]) {
  window.localStorage.setItem(obsidianVaultsKey, JSON.stringify(vaults));
}

function readBrowserObsidianNotes(): ObsidianNoteIndex[] {
  const raw = window.localStorage.getItem(obsidianNotesKey);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ObsidianNoteIndex[];
  } catch {
    return [];
  }
}

function writeBrowserObsidianNotes(notes: ObsidianNoteIndex[]) {
  window.localStorage.setItem(obsidianNotesKey, JSON.stringify(notes));
}

function readBrowserObsidianTasks(): ObsidianTask[] {
  const raw = window.localStorage.getItem(obsidianTasksKey);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ObsidianTask[];
  } catch {
    return [];
  }
}

function writeBrowserObsidianTasks(tasks: ObsidianTask[]) {
  window.localStorage.setItem(obsidianTasksKey, JSON.stringify(tasks));
}

function sortTrips(trips: Trip[]) {
  return trips.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

function sortObsidianTasks(tasks: ObsidianTask[]) {
  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return tasks.slice().sort((a, b) => {
    const dueA = a.dueDate ?? "9999-99-99";
    const dueB = b.dueDate ?? "9999-99-99";
    if (dueA !== dueB) return dueA.localeCompare(dueB);
    const rankA = priorityRank[a.priority ?? ""] ?? 3;
    const rankB = priorityRank[b.priority ?? ""] ?? 3;
    if (rankA !== rankB) return rankA - rankB;
    return String(b.modifiedAt).localeCompare(String(a.modifiedAt));
  });
}

function sortObsidianNotes(notes: ObsidianNoteIndex[]) {
  return notes.slice().sort((a, b) => {
    if (Number(a.favorite) !== Number(b.favorite)) return Number(b.favorite) - Number(a.favorite);
    const modified = String(b.modifiedAt).localeCompare(String(a.modifiedAt));
    if (modified !== 0) return modified;
    return a.title.localeCompare(b.title, "zh-Hans-CN");
  });
}

function normalizeTripInput(input: TripInput | (TripUpdateInput & { itemId?: string })) {
  const category = input.category;
  return {
    ...input,
    title: input.title.trim().slice(0, 50),
    content: input.content.slice(0, 4000),
    status: category === "status" ? (input.status ?? "todo") : null,
    tags: Array.from(new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 12),
    pinned: Boolean(input.pinned)
  };
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

export async function createCustomGroup(
  id: string,
  title: string,
  icon: string,
  description: string
): Promise<Phase0Snapshot["groups"]> {
  try {
    return await invokeNative<Phase0Snapshot["groups"]>("create_custom_group", {
      id,
      title,
      icon,
      description
    });
  } catch {
    const snapshot = readBrowserSnapshot();
    const nextGroups = [
      ...snapshot.groups.filter((g) => g.id !== id),
      {
        id,
        title,
        icon,
        description,
        custom: true
      }
    ];
    writeBrowserSnapshot({ ...snapshot, groups: nextGroups });
    return nextGroups;
  }
}

export async function deleteGroup(id: string): Promise<Phase0Snapshot["groups"]> {
  try {
    return await invokeNative<Phase0Snapshot["groups"]>("delete_group", { id });
  } catch {
    const snapshot = readBrowserSnapshot();
    const nextGroups = snapshot.groups.filter((group) => group.id !== id);
    const fallbackGroupForKind = (kind: string) => {
      if (kind === "app") return "apps";
      if (kind === "website") return "web";
      if (kind === "script") return "scripts";
      return "work";
    };
    const nextItems = snapshot.items.map((item) => {
      const currentGroups = item.group.split(",").map((group) => group.trim()).filter(Boolean);
      if (!currentGroups.includes(id)) return item;
      const nextItemGroups = currentGroups.filter((group) => group !== id);
      return {
        ...item,
        group: nextItemGroups.length ? Array.from(new Set(nextItemGroups)).join(",") : fallbackGroupForKind(item.kind)
      };
    });
    writeBrowserSnapshot({ ...snapshot, groups: nextGroups, items: nextItems });
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
    writeBrowserTrips(readBrowserTrips().filter((trip) => trip.itemId !== id));
  }
}

export async function listTrips(itemId: string): Promise<Trip[]> {
  try {
    return await invokeNative<Trip[]>("list_trips", { itemId });
  } catch {
    return sortTrips(readBrowserTrips().filter((trip) => trip.itemId === itemId));
  }
}

export async function createTrip(input: TripInput): Promise<Trip> {
  const normalized = normalizeTripInput(input);
  try {
    return await invokeNative<Trip>("create_trip", normalized);
  } catch {
    const now = Math.floor(Date.now() / 1000);
    const trip: Trip = {
      id: `trip-${input.itemId}-${Date.now()}`,
      itemId: input.itemId,
      title: normalized.title,
      content: normalized.content,
      category: normalized.category,
      status: normalized.status,
      tags: normalized.tags,
      pinned: normalized.pinned,
      createdAt: now,
      updatedAt: now,
      lastViewedAt: null
    };
    writeBrowserTrips([trip, ...readBrowserTrips()]);
    return trip;
  }
}

export async function updateTrip(id: string, updates: TripUpdateInput): Promise<Trip> {
  const normalized = normalizeTripInput(updates);
  try {
    return await invokeNative<Trip>("update_trip", { id, ...normalized });
  } catch {
    const trips = readBrowserTrips();
    const next = trips.map((trip) => (
      trip.id === id
        ? {
            ...trip,
            ...normalized,
            updatedAt: Math.floor(Date.now() / 1000)
          }
        : trip
    ));
    writeBrowserTrips(next);
    const updated = next.find((trip) => trip.id === id);
    if (!updated) throw new Error(`Trip not found: ${id}`);
    return updated;
  }
}

export async function markTripViewed(id: string): Promise<void> {
  try {
    await invokeNative<void>("mark_trip_viewed", { id });
  } catch {
    const now = Math.floor(Date.now() / 1000);
    writeBrowserTrips(readBrowserTrips().map((trip) => (trip.id === id ? { ...trip, lastViewedAt: now } : trip)));
  }
}

export async function deleteTrip(id: string): Promise<void> {
  try {
    await invokeNative<void>("delete_trip", { id });
  } catch {
    writeBrowserTrips(readBrowserTrips().filter((trip) => trip.id !== id));
  }
}

export async function searchTrips(query: string): Promise<TripSearchResult[]> {
  try {
    return await invokeNative<TripSearchResult[]>("search_trips", { query });
  } catch {
    const q = query.trim().toLowerCase();
    const items = readBrowserItems();
    const itemById = new Map(items.map((item) => [item.id, item]));
    return sortTrips(readBrowserTrips())
      .filter((trip) => {
        if (!q) return true;
        return `${trip.title} ${trip.content} ${trip.category} ${trip.status ?? ""} ${trip.tags.join(" ")}`.toLowerCase().includes(q);
      })
      .slice(0, 20)
      .map((trip) => {
        const item = itemById.get(trip.itemId);
        return {
          trip,
          itemId: trip.itemId,
          itemTitle: item?.title ?? "Unknown resource",
          itemIcon: item?.icon ?? "Lightbulb",
          itemKind: item?.kind ?? "file"
        };
      });
  }
}

export async function tripCountForItems(itemIds: string[]): Promise<Record<string, number>> {
  try {
    return await invokeNative<Record<string, number>>("trip_count_for_items", { itemIds });
  } catch {
    const counts: Record<string, number> = {};
    for (const itemId of itemIds) counts[itemId] = 0;
    for (const trip of readBrowserTrips()) {
      if (itemIds.includes(trip.itemId)) counts[trip.itemId] = (counts[trip.itemId] ?? 0) + 1;
    }
    return counts;
  }
}

export async function pickObsidianVaultPath(): Promise<string | null> {
  try {
    return await invokeNative<string | null>("pick_obsidian_vault_path");
  } catch {
    return null;
  }
}

export async function listObsidianVaults(): Promise<ObsidianVaultConfig[]> {
  try {
    return await invokeNative<ObsidianVaultConfig[]>("list_obsidian_vaults");
  } catch {
    return readBrowserObsidianVaults();
  }
}

export async function addObsidianVault(path: string, name?: string): Promise<ObsidianVaultConfig> {
  try {
    return await invokeNative<ObsidianVaultConfig>("add_obsidian_vault", { path, name });
  } catch {
    const now = `${Math.floor(Date.now() / 1000)}`;
    const cleanPath = path.trim();
    const vault: ObsidianVaultConfig = {
      id: `obsvault-${Date.now()}`,
      name: name?.trim() || cleanPath.split(/[\\/]/).filter(Boolean).pop() || "Obsidian Vault",
      path: cleanPath,
      enabled: true,
      lastIndexedAt: null,
      fileCount: 0,
      taskCount: 0,
      openInObsidian: true,
      createdAt: now
    };
    const vaults = readBrowserObsidianVaults().filter((candidate) => candidate.path !== cleanPath);
    writeBrowserObsidianVaults([vault, ...vaults]);
    return vault;
  }
}

export async function removeObsidianVault(id: string): Promise<void> {
  try {
    await invokeNative<void>("remove_obsidian_vault", { id });
  } catch {
    writeBrowserObsidianVaults(readBrowserObsidianVaults().filter((vault) => vault.id !== id));
    writeBrowserObsidianNotes(readBrowserObsidianNotes().filter((note) => note.vaultId !== id));
    writeBrowserObsidianTasks(readBrowserObsidianTasks().filter((task) => task.vaultId !== id));
  }
}

export async function scanObsidianVault(vaultId: string): Promise<ObsidianScanResult> {
  try {
    return await invokeNative<ObsidianScanResult>("scan_obsidian_vault", { vaultId });
  } catch {
    const vaults = readBrowserObsidianVaults();
    const vault = vaults.find((candidate) => candidate.id === vaultId);
    if (!vault) throw new Error(`Obsidian vault not found: ${vaultId}`);
    const tasks = readBrowserObsidianTasks().filter((task) => task.vaultId === vaultId);
    const scannedVault = {
      ...vault,
      lastIndexedAt: `${Math.floor(Date.now() / 1000)}`,
      fileCount: vault.fileCount,
      taskCount: tasks.length
    };
    writeBrowserObsidianVaults(vaults.map((candidate) => (candidate.id === vaultId ? scannedVault : candidate)));
    return { vault: scannedVault, noteCount: scannedVault.fileCount, taskCount: tasks.length };
  }
}

export async function listObsidianTasks(options: { includeCompleted?: boolean; query?: string } = {}): Promise<ObsidianTask[]> {
  try {
    return await invokeNative<ObsidianTask[]>("list_obsidian_tasks", {
      includeCompleted: options.includeCompleted ?? false,
      query: options.query ?? ""
    });
  } catch {
    const q = (options.query ?? "").trim().toLowerCase();
    return sortObsidianTasks(
      readBrowserObsidianTasks()
        .filter((task) => options.includeCompleted || !task.completed)
        .filter((task) => {
          if (!q) return true;
          return `${task.text} ${task.noteTitle} ${task.relativePath} ${task.vaultName} ${task.tags.join(" ")}`.toLowerCase().includes(q);
        })
    );
  }
}

export async function listObsidianNotes(options: { vaultId?: string; query?: string } = {}): Promise<ObsidianNoteIndex[]> {
  try {
    return await invokeNative<ObsidianNoteIndex[]>("list_obsidian_notes", {
      vaultId: options.vaultId ?? null,
      query: options.query ?? ""
    });
  } catch {
    const q = (options.query ?? "").trim().toLowerCase();
    const vaultId = options.vaultId && options.vaultId !== "all" ? options.vaultId : "";
    return sortObsidianNotes(
      readBrowserObsidianNotes()
        .filter((note) => !vaultId || note.vaultId === vaultId)
        .filter((note) => {
          if (!q) return true;
          return `${note.title} ${note.relativePath} ${note.vaultName} ${note.tags.join(" ")}`.toLowerCase().includes(q);
        })
    );
  }
}

export async function toggleObsidianNoteFavorite(id: string, favorite: boolean): Promise<void> {
  try {
    await invokeNative<void>("toggle_obsidian_note_favorite", { id, favorite });
  } catch {
    writeBrowserObsidianNotes(
      readBrowserObsidianNotes().map((note) => (note.id === id ? { ...note, favorite } : note))
    );
  }
}

export async function listObsidianNoteTasks(noteId: string): Promise<ObsidianTask[]> {
  try {
    return await invokeNative<ObsidianTask[]>("list_obsidian_note_tasks", { noteId });
  } catch {
    return readBrowserObsidianTasks()
      .filter((task) => task.noteId === noteId)
      .sort((a, b) => a.lineNumber - b.lineNumber);
  }
}

export async function openObsidianTodoWindow(noteId: string): Promise<void> {
  try {
    await invokeNative<void>("open_obsidian_todo_window", { noteId });
  } catch {
    window.open(`?panel=todo&noteId=${encodeURIComponent(noteId)}`, "orbitstart-todo-panel", "width=520,height=720,resizable=yes");
  }
}

export async function setTodoWindowAlwaysOnTop(enabled: boolean): Promise<void> {
  try {
    await invokeNative<void>("set_todo_window_always_on_top", { enabled });
  } catch {
    void enabled;
  }
}

export async function toggleObsidianTaskCompletion(taskId: string): Promise<ObsidianTask> {
  return await invokeNative<ObsidianTask>("toggle_obsidian_task_completion", { taskId });
}

export async function searchObsidian(query: string): Promise<ObsidianSearchResult[]> {
  try {
    return await invokeNative<ObsidianSearchResult[]>("search_obsidian", { query });
  } catch {
    return (await listObsidianTasks({ query })).slice(0, 25).map((task) => ({
      kind: "task",
      id: task.id,
      title: task.text,
      subtitle: `${task.vaultName} · ${task.relativePath}`,
      icon: "NotebookText",
      vaultId: task.vaultId,
      vaultName: task.vaultName,
      relativePath: task.relativePath,
      lineNumber: task.lineNumber,
      task
    }));
  }
}

export async function openObsidianNote(vaultId: string, relativePath: string, lineNumber?: number | null): Promise<string> {
  try {
    return await invokeNative<string>("open_obsidian_note", { vaultId, relativePath, lineNumber });
  } catch {
    return `本地预览模式：已模拟打开 Obsidian 笔记 ${relativePath}${lineNumber ? `:${lineNumber}` : ""}`;
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

export async function readPluginRuntime(id: string): Promise<PluginRuntimeSource | null> {
  try {
    return await invokeNative<PluginRuntimeSource | null>("read_plugin_runtime", { id });
  } catch {
    return null;
  }
}

export async function recordPluginRuntimeEvent(pluginId: string, level: "info" | "warn" | "error", message: string): Promise<void> {
  try {
    await invokeNative<void>("record_plugin_runtime_event", { pluginId, level, message });
  } catch {
    const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
    logger(`[${pluginId}] ${message}`);
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

export async function setAutoPinnedMode(enabled: boolean): Promise<Phase0Snapshot> {
  try {
    return await invokeNative<Phase0Snapshot>("set_auto_pinned_mode", { enabled });
  } catch {
    const snapshot = readBrowserSnapshot();
    const next = {
      ...snapshot,
      settings: { ...snapshot.settings, autoPinnedMode: enabled }
    };
    writeBrowserSnapshot(next);
    return next;
  }
}

export async function setDisplayMode(mode: "simple" | "detailed"): Promise<Phase0Snapshot> {
  try {
    return await invokeNative<Phase0Snapshot>("set_display_mode", { mode });
  } catch {
    const snapshot = readBrowserSnapshot();
    const next = {
      ...snapshot,
      settings: { ...snapshot.settings, displayMode: mode }
    };
    writeBrowserSnapshot(next);
    return next;
  }
}

export async function setHotkeyBehavior(behavior: "command_bar" | "open_only"): Promise<Phase0Snapshot> {
  try {
    return await invokeNative<Phase0Snapshot>("set_hotkey_behavior", { behavior });
  } catch {
    const snapshot = readBrowserSnapshot();
    const next = {
      ...snapshot,
      settings: { ...snapshot.settings, hotkeyBehavior: behavior }
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

export async function getAutostartEnabled(): Promise<boolean> {
  try {
    return await invokeNative<boolean>("get_autostart_enabled");
  } catch {
    return false;
  }
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  try {
    await invokeNative<void>("set_autostart_enabled", { enabled });
  } catch {
    // 浏览器预览静默失败
  }
}

export async function updateGlobalHotkey(oldHotkey: string, newHotkey: string): Promise<void> {
  try {
    await invokeNative<void>("update_global_hotkey", { newHotkey });
  } catch (e) {
    console.warn("Failed to update global hotkey natively, fallback to browser state update", e);
    const snapshot = readBrowserSnapshot();
    const next = {
      ...snapshot,
      settings: { ...snapshot.settings, globalHotkey: newHotkey }
    };
    writeBrowserSnapshot(next);
  }
}

export async function previewScanShortcuts(): Promise<OrbitItemInput[]> {
  try {
    return await invokeNative<OrbitItemInput[]>("preview_scan_shortcuts");
  } catch {
    return [
      {
        title: "示例本地程序 (Uninstall)",
        subtitle: "C:\\Program Files\\Example\\uninstall.exe",
        kind: "app",
        group: "apps",
        target: "C:\\Program Files\\Example\\uninstall.exe",
        aliases: ["uninstall"],
        tags: ["shortcut", "scan"],
        icon: "AppWindow",
        accent: "#5cc8ff",
        favorite: false
      },
      {
        title: "谷歌浏览器",
        subtitle: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        kind: "app",
        group: "apps",
        target: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        aliases: ["chrome"],
        tags: ["shortcut", "scan"],
        icon: "AppWindow",
        accent: "#5cc8ff",
        favorite: false
      }
    ];
  }
}

export async function previewScanBrowserBookmarks(): Promise<OrbitItemInput[]> {
  try {
    return await invokeNative<OrbitItemInput[]>("preview_scan_browser_bookmarks");
  } catch {
    return [
      {
        title: "Baidu",
        subtitle: "https://www.baidu.com",
        kind: "website",
        group: "web",
        target: "https://www.baidu.com",
        aliases: ["baidu"],
        tags: ["bookmark", "browser"],
        icon: "Globe",
        accent: "#37d6bf",
        favorite: false
      },
      {
        title: "GitHub",
        subtitle: "https://github.com",
        kind: "website",
        group: "web",
        target: "https://github.com",
        aliases: ["github"],
        tags: ["bookmark", "browser"],
        icon: "Globe",
        accent: "#37d6bf",
        favorite: false
      }
    ];
  }
}

export async function importScannedItems(items: OrbitItemInput[]): Promise<OrbitItem[]> {
  try {
    return await invokeNative<OrbitItem[]>("import_scanned_items", { items });
  } catch {
    const current = readBrowserItems();
    const created = items.map((input) => {
      return {
        ...input,
        id: `${input.kind}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        launchCount: 0
      };
    });
    const nextItems = [...created, ...current];
    writeBrowserItems(nextItems);
    return nextItems;
  }
}

export async function reorderItems(orderedIds: string[]): Promise<void> {
  try {
    await invokeNative<void>("reorder_items", { orderedIds });
  } catch {
    const items = readBrowserItems();
    const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
    const reordered = [...items].sort((a, b) => {
      const aIdx = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bIdx = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aIdx - bIdx;
    });
    writeBrowserItems(reordered);
  }
}

export async function reorderGroups(orderedIds: string[]): Promise<Phase0Snapshot["groups"]> {
  try {
    return await invokeNative<Phase0Snapshot["groups"]>("reorder_groups", { orderedIds });
  } catch {
    const snapshot = readBrowserSnapshot();
    const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
    const reordered = [...snapshot.groups].sort((a, b) => {
      const aIdx = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bIdx = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aIdx - bIdx;
    });
    writeBrowserSnapshot({ ...snapshot, groups: reordered });
    return reordered;
  }
}

export async function getGroupHotkeys(): Promise<Record<string, string>> {
  try {
    return await invokeNative<Record<string, string>>("get_group_hotkeys");
  } catch {
    const raw = window.localStorage.getItem("orbitstart.browser.group_hotkeys");
    return raw ? JSON.parse(raw) : {};
  }
}

export async function updateGroupHotkey(groupId: string, hotkey: string | null): Promise<void> {
  try {
    await invokeNative<void>("update_group_hotkey", { groupId, newHotkey: hotkey });
  } catch {
    const raw = window.localStorage.getItem("orbitstart.browser.group_hotkeys");
    const map = raw ? JSON.parse(raw) : {};
    if (hotkey) {
      map[groupId] = hotkey;
    } else {
      delete map[groupId];
    }
    window.localStorage.setItem("orbitstart.browser.group_hotkeys", JSON.stringify(map));
  }
}
