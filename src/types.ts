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
  plugins?: OrbitPluginManifest[];
  activeThemeId?: string;
}

export interface ExportResult {
  path: string;
  json: string;
}
