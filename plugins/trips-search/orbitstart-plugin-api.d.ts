export interface OrbitPlugin {
  activate(ctx: OrbitPluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface OrbitPluginContext {
  commands: {
    registerCommand(command: RegisteredCommand): () => void;
  };
  search: {
    registerProvider(id: string, provider: SearchProvider): () => void;
  };
  ui: {
    toast(message: string): void;
  };
  settings: PluginSettings;
  storage: PluginStorage;
  trips: TripsApi;
  obsidian: ObsidianApi;
  catalog: CatalogApi;
  launcher: LauncherApi;
}

export interface RegisteredCommand {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  keywords: string[];
  run(): void | Promise<void>;
}

export type SearchProvider = (query: string) => SearchResult[] | Promise<SearchResult[]>;

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  source: string;
  actionLabel: string;
  run?(): void | Promise<void>;
}

export interface PluginSettings {
  get<T = unknown>(key: string, fallbackValue?: T): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<boolean>;
}

export interface PluginStorage {
  get<T = unknown>(key: string, fallbackValue?: T): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<boolean>;
  remove(key: string): Promise<boolean>;
  list(): Promise<Array<{ key: string; value: unknown }>>;
}

export interface TripsApi {
  search(query: string): Promise<TripSearchResult[]>;
  open(itemId: string, tripId?: string): Promise<boolean>;
}

export interface ObsidianApi {
  search(query: string): Promise<ObsidianSearchResult[]>;
  open(vaultId: string, relativePath: string, lineNumber?: number): Promise<boolean | string>;
}

export interface CatalogApi {
  getSnapshot(): Promise<CatalogSnapshot>;
}

export interface LauncherApi {
  launchItem(id: string): Promise<boolean>;
  launchTarget(target: string, arguments?: string): Promise<boolean>;
}

export interface CatalogSnapshot {
  items: Array<{
    id: string;
    title: string;
    subtitle: string;
    kind: string;
    group: string;
    target: string;
    arguments?: string;
    aliases: string[];
    tags: string[];
    icon: string;
    accent: string;
    favorite: boolean;
    launchCount: number;
    lastLaunchedAt?: string | null;
    sortOrder: number;
  }>;
  groups: Array<{
    id: string;
    title: string;
    icon: string;
    description: string;
    custom: boolean;
    sortOrder: number;
  }>;
}

export interface TripSearchResult {
  trip: {
    id: string;
    itemId: string;
    title: string;
    content: string;
    category: string;
    status?: string | null;
    tags: string[];
    pinned: boolean;
    createdAt: number;
    updatedAt: number;
    lastViewedAt?: number | null;
  };
  itemId: string;
  itemTitle: string;
  itemIcon: string;
  itemKind: string;
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
  priority?: "low" | "medium" | "high" | null;
  completedAt?: string | null;
  modifiedAt: string;
}

export interface ObsidianSearchResult {
  kind: string;
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
