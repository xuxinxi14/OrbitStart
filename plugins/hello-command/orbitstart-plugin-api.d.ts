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
