export type ItemKind = "app" | "file" | "folder" | "website" | "script" | "action_chain";

export interface OrbitItem {
  id: string;
  title: string;
  subtitle: string;
  kind: ItemKind;
  group: string;
  target: string;
  aliases: string[];
  tags: string[];
  icon: string;
  accent: string;
  favorite?: boolean;
  launchCount: number;
  lastLaunchedAt?: string;
  sortOrder?: number;
}

export interface OrbitItemInput {
  title: string;
  subtitle: string;
  kind: ItemKind;
  group: string;
  target: string;
  aliases: string[];
  tags: string[];
  icon: string;
  accent: string;
  favorite: boolean;
}

export type TripCategory = "shortcut" | "workflow" | "note" | "status" | "reference";
export type TripStatus = "todo" | "in-progress" | "done" | "needs-update";

export interface Trip {
  id: string;
  itemId: string;
  title: string;
  content: string;
  category: TripCategory;
  status?: TripStatus | null;
  tags: string[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  lastViewedAt?: number | null;
}

export interface TripInput {
  itemId: string;
  title: string;
  content: string;
  category: TripCategory;
  status?: TripStatus | null;
  tags: string[];
  pinned?: boolean;
}

export interface TripUpdateInput {
  title: string;
  content: string;
  category: TripCategory;
  status?: TripStatus | null;
  tags: string[];
  pinned: boolean;
}

export interface TripSearchResult {
  trip: Trip;
  itemId: string;
  itemTitle: string;
  itemIcon: string;
  itemKind: ItemKind | string;
}

export type ObsidianTaskPriority = "low" | "medium" | "high";

export interface ObsidianVaultConfig {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  lastIndexedAt?: string | null;
  fileCount: number;
  taskCount: number;
  openInObsidian: boolean;
  createdAt: string;
}

export interface ObsidianNoteIndex {
  id: string;
  vaultId: string;
  vaultName: string;
  title: string;
  filePath: string;
  relativePath: string;
  tags: string[];
  frontmatter?: Record<string, string> | null;
  modifiedAt: string;
  indexedAt: string;
  taskCount: number;
  favorite: boolean;
}

export interface ObsidianTask {
  id: string;
  vaultId: string;
  vaultName: string;
  noteId: string;
  noteTitle: string;
  filePath: string;
  relativePath: string;
  lineNumber: number;
  rawText: string;
  text: string;
  completed: boolean;
  tags: string[];
  dueDate?: string | null;
  priority?: ObsidianTaskPriority | null;
  completedAt?: string | null;
  modifiedAt: string;
}

export interface ObsidianSearchResult {
  kind: "task" | "note" | string;
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  vaultId: string;
  vaultName: string;
  relativePath: string;
  lineNumber?: number | null;
  task?: ObsidianTask | null;
}

export interface ObsidianScanResult {
  vault: ObsidianVaultConfig;
  noteCount: number;
  taskCount: number;
}

export interface OrbitGroup {
  id: string;
  title: string;
  icon: string;
  description: string;
  custom?: boolean;
}

export interface OrbitCommand {
  id: string;
  title: string;
  subtitle: string;
  pluginId: string;
  icon: string;
  keywords: string[];
}

export interface PluginPermission {
  id: string;
  label: string;
  risk: "low" | "medium" | "high";
}

export interface OrbitPluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  builtin?: boolean;
  permissions: PluginPermission[];
  contributes: {
    commands: number;
    searchProviders: number;
    themes: number;
    views: number;
  };
}

export interface PluginRuntimeSource {
  id: string;
  entry: "main.js" | "main.ts";
  source: string;
  permissions: string[];
}

export interface PluginStorageEntry {
  key: string;
  value: unknown;
}

export interface ThemeManifest {
  id: string;
  name: string;
  author: string;
  description: string;
  builtin?: boolean;
  tokens: Record<string, string>;
}

export interface PluginLog {
  id: string;
  pluginId: string;
  level: "info" | "warn" | "error" | string;
  message: string;
  createdAt: string;
}

export interface AppSettings {
  activeThemeId: string;
  safeMode: boolean;
  density: "comfortable" | "compact" | string;
  globalHotkey: string;
  closeBehavior?: "tray" | "exit" | string;
  dataDir: string;
  autoPinnedMode: boolean;
  displayMode: "simple" | "detailed" | string;
  hotkeyBehavior: "command_bar" | "open_only" | string;
}

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  source: string;
  actionLabel: string;
  run: () => void | Promise<void>;
}

export interface Phase0Snapshot {
  items: OrbitItem[];
  groups: OrbitGroup[];
  commands: OrbitCommand[];
  plugins: OrbitPluginManifest[];
  themes: ThemeManifest[];
  settings: AppSettings;
  logs: PluginLog[];
}

export interface CatalogExport {
  version: number;
  exportedAt: string;
  items: OrbitItem[];
  trips?: Trip[];
  plugins?: OrbitPluginManifest[];
  activeThemeId?: string;
}

export interface ExportResult {
  path: string;
  json: string;
}
