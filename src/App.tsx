import {
  AppWindow,
  Blocks,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Command,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  FolderKanban,
  FolderOpen,
  FolderSearch,
  Gem,
  Globe,
  Grid3X3,
  Hammer,
  Import,
  Info,
  Image,
  LayoutDashboard,
  Lightbulb,
  NotebookText,
  Palette,
  PanelsTopLeft,
  Pencil,
  PlusCircle,
  Power,
  Puzzle,
  RefreshCcw,
  Save,
  ScanSearch,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  TerminalSquare,
  Trash2,
  Upload,
  Workflow,
  X
} from "lucide-react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LocalGalaxyBackdrop } from "./components/LocalGalaxyBackdrop";
import { TripPanel } from "./components/TripPanel";
import {
  contextMenuFromEvent,
  copyText,
  editableElementFrom,
  type ContextMenuState,
  runEditMenuCommand,
  type EditMenuCommand
} from "./desktop/contextMenu";
import { installDesktopShell } from "./desktop/desktopShell";
import { closeWindow, getAppWindow, minimizeWindow, startWindowDrag, toggleMaximizeWindow } from "./desktop/windowControls";
import { buildSortedResults, matchesItemEnhanced as scoreMatchesItem, matchesCommandEnhanced as scoreMatchesCommand, scoreItem } from "./lib/searchEngine";
import { tripCategoryLabels } from "./lib/tripTemplates";
import {
  shouldShowOnboarding,
  completeOnboarding,
  skipOnboarding,
  type ScenarioTag
} from "./lib/onboarding";
import { OnboardingWizard } from "./components/OnboardingWizard";
import {
  createItem,
  createItemsFromPaths,
  createGroup,
  createPluginTemplate,
  deleteItem,
  exportCatalogJson,
  importCatalogJson,
  loadSnapshot,
  openAuxWindow,
  openDataDirectory,
  pickIconImage,
  pickResourceInput,
  revealTarget,
  scanBrowserBookmarks,
  scanShortcuts,
  updateGlobalHotkey,
  previewScanShortcuts,
  previewScanBrowserBookmarks,
  importScannedItems,
  searchTrips,
  tripCountForItems,
  setActiveTheme,
  setCloseBehavior,
  setDensity,
  setPluginEnabled,
  setSafeMode,
  updateItem,
  launchItem,
  getAutostartEnabled,
  setAutostartEnabled
} from "./lib/native";
import { createOrbitPluginHost } from "./plugin/api";
import { localGalaxyAssets } from "./theme/localGalaxyAssets";
import type {
  AppSettings,
  ItemKind,
  OrbitCommand,
  OrbitGroup,
  OrbitItem,
  OrbitItemInput,
  OrbitPluginManifest,
  PluginLog,
  SearchResult,
  ThemeManifest,
  TripSearchResult
} from "./types";

const appIconSrc = new URL("../design/app-icons/orbitstart-first-icon-ui.png", import.meta.url).href;

const tripStatusLabels: Record<string, string> = {
  todo: "待处理",
  "in-progress": "进行中",
  done: "已完成",
  "needs-update": "需更新"
};

type ViewId = "dashboard" | "trips" | "settings" | "logs";
type SettingsSection = "general" | "plugins" | "themes" | "dev" | "data" | "about";
type AuxPanel = "settings" | "plugins" | "themes" | "about";
type AppDialogState =
  | { type: "group"; value: string }
  | { type: "delete-item"; item: OrbitItem }
  | { type: "batch-delete" }
  | { type: "batch-move"; groupId: string }
  | { type: "template"; value: string };

function getInitialView(): ViewId {
  if (typeof window === "undefined") return "dashboard";
  const requestedView = new URLSearchParams(window.location.search).get("view") ?? window.location.hash.replace("#", "");
  return requestedView === "settings" || requestedView === "logs" || requestedView === "trips" ? requestedView : "dashboard";
}

function getAuxPanel(): AuxPanel | null {
  if (typeof window === "undefined") return null;
  const panel = new URLSearchParams(window.location.search).get("panel");
  if (panel === "settings" || panel === "plugins" || panel === "themes" || panel === "about") return panel;
  const label = getAppWindow()?.label;
  return label === "settings" || label === "plugins" || label === "themes" || label === "about" ? label : null;
}

function sectionFromPanel(panel: AuxPanel | null): SettingsSection {
  if (panel === "plugins" || panel === "themes" || panel === "about") return panel;
  return "general";
}

const iconMap = {
  AppWindow,
  Blocks,
  Bookmark,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  FolderKanban,
  FolderOpen,
  FolderSearch,
  Gem,
  Globe,
  Grid3X3,
  Hammer,
  Import,
  NotebookText,
  Palette,
  PanelsTopLeft,
  PlusCircle,
  Puzzle,
  RefreshCcw,
  Save,
  ScanSearch,
  Search,
  Sparkles,
  TerminalSquare,
  Upload,
  Workflow
};

const baseKindOptions: Array<{ value: ItemKind; label: string; icon: string; group: string; accent: string; pluginId?: string }> = [
  { value: "app", label: "应用", icon: "AppWindow", group: "apps", accent: "#5cc8ff" },
  { value: "file", label: "文件", icon: "FileText", group: "work", accent: "#f6b95b" },
  { value: "folder", label: "文件夹", icon: "FolderOpen", group: "work", accent: "#8bd450" },
  { value: "website", label: "网址", icon: "Globe", group: "web", accent: "#37d6bf", pluginId: "core-websites" },
  { value: "script", label: "脚本", icon: "TerminalSquare", group: "scripts", accent: "#41e0a8" },
  { value: "action_chain", label: "动作链", icon: "Workflow", group: "work", accent: "#ff7a90", pluginId: "core-actions" }
];

type EditorState =
  | {
      mode: "create";
      input: OrbitItemInput;
    }
  | {
      mode: "edit";
      item: OrbitItem;
      input: OrbitItemInput;
    };

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  if (name.startsWith("data:image/")) {
    return <img src={name} alt="" width={size} height={size} />;
  }
  const Component = iconMap[name as keyof typeof iconMap] ?? CircleDot;
  return <Component size={size} strokeWidth={1.8} />;
}

function makeEmptyInput(kind: ItemKind = "app"): OrbitItemInput {
  const option = baseKindOptions.find((candidate) => candidate.value === kind) ?? baseKindOptions[0];
  return {
    title: "",
    subtitle: "",
    kind,
    group: option.group,
    target: "",
    aliases: [],
    tags: [],
    icon: option.icon,
    accent: option.accent,
    favorite: false
  };
}

function normalizeList(value: string) {
  return value
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function listToText(value: string[]) {
  return value.join(", ");
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function splitGroupIds(value: string) {
  return uniqueList(value.split(","));
}

function joinGroupIds(values: string[]) {
  return uniqueList(values).join(",");
}

function mergeGroupValues(...values: string[]) {
  return joinGroupIds(values.flatMap(splitGroupIds));
}

function normalizeGroupValue(value: string, fallback = "") {
  const normalized = joinGroupIds(splitGroupIds(value));
  return normalized || fallback;
}

function itemHasGroup(item: Pick<OrbitItem, "group">, groupId: string) {
  return splitGroupIds(item.group).includes(groupId);
}

function groupLabelsForItem(item: Pick<OrbitItem, "group">, groups: OrbitGroup[]) {
  const titleById = new Map(groups.map((group) => [group.id, group.title]));
  return splitGroupIds(item.group).map((id) => ({ id, title: titleById.get(id) ?? id }));
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function matchesItem(item: OrbitItem, query: string) {
  return scoreMatchesItem(item, query);
}

function matchesCommand(command: OrbitCommand, query: string) {
  return scoreMatchesCommand(command, query);
}

function inputFromItem(item: OrbitItem): OrbitItemInput {
  return {
    title: item.title,
    subtitle: item.subtitle,
    kind: item.kind,
    group: item.group,
    target: item.target,
    aliases: item.aliases,
    tags: item.tags,
    icon: item.icon,
    accent: item.accent,
    favorite: item.favorite ?? false
  };
}

function lastLaunchedText(item: OrbitItem) {
  if (!item.lastLaunchedAt) return "未启动";
  const seconds = Number(item.lastLaunchedAt);
  if (!Number.isFinite(seconds)) return item.lastLaunchedAt;
  const delta = Math.max(0, Math.floor(Date.now() / 1000 - seconds));
  if (delta < 60) return "刚刚";
  if (delta < 3600) return `${Math.floor(delta / 60)} 分钟前`;
  if (delta < 86400) return `${Math.floor(delta / 3600)} 小时前`;
  return `${Math.floor(delta / 86400)} 天前`;
}

function pluginDetail(plugin: OrbitPluginManifest) {
  const samples: Record<string, { author: string; features: string[]; demo: string }> = {
    "core-shortcuts": {
      author: "OrbitStart Core",
      features: ["扫描桌面和开始菜单", "解析 .lnk 目标", "提取应用图标", "保留快捷方式启动路径"],
      demo: "扫描后首页会出现带真实图标的软件卡片。"
    },
    "core-themes": {
      author: "OrbitStart Core",
      features: ["主题 token", "实时切换", "本地主题包", "主题 JSON 复制"],
      demo: "选择任意主题后，界面会即时应用对应的颜色、层级和密度变量。"
    },
    "core-plugin-dev": {
      author: "OrbitStart Core",
      features: ["插件模板", "manifest 校验", "本地打包", "开发文档"],
      demo: "创建 Hello Command 后会在插件目录生成 plugin.json 和 main.ts。"
    },
    "hello-command": {
      author: "Local Plugin Template",
      features: ["命令注册", "搜索结果展示", "通知反馈"],
      demo: "在命令面板搜索 hello，可看到本地插件命令。"
    },
    "trips-search": {
      author: "OrbitStart Local Plugin",
      features: ["Trip 内容搜索", "命令面板入口", "打开资源 TripPanel"],
      demo: "在命令面板输入 Trip 内容关键词，可直接跳到对应资源提示。"
    }
  };

  return samples[plugin.id] ?? {
    author: plugin.builtin ? "OrbitStart Core" : "Local plugin author",
    features: [
      `${plugin.contributes.commands} commands`,
      `${plugin.contributes.searchProviders} search providers`,
      `${plugin.contributes.themes} themes`,
      `${plugin.contributes.views} views`
    ],
    demo: plugin.description
  };
}

export default function App() {
  const auxPanel = useMemo(getAuxPanel, []);
  const isAuxWindow = Boolean(auxPanel);
  const [items, setItems] = useState<OrbitItem[]>([]);
  const [groups, setGroups] = useState<OrbitGroup[]>([]);
  const [commands, setCommands] = useState<OrbitCommand[]>([]);
  const [plugins, setPlugins] = useState<OrbitPluginManifest[]>([]);
  const [themes, setThemes] = useState<ThemeManifest[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [logs, setLogs] = useState<PluginLog[]>([]);
  const [activeView, setActiveView] = useState<ViewId>(getInitialView);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(() => sectionFromPanel(auxPanel));
  const [activeGroup, setActiveGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [pluginResults, setPluginResults] = useState<SearchResult[]>([]);
  const [paletteSelectedIndex, setPaletteSelectedIndex] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(() => shouldShowOnboarding());
  const [toast, setToast] = useState("OrbitStart：正在加载本地工作台状态");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupJson, setBackupJson] = useState("");
  const [backupPath, setBackupPath] = useState("");
  const [dialog, setDialog] = useState<AppDialogState | null>(null);
  const [localAuxPanel, setLocalAuxPanel] = useState<AuxPanel | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchGroup, setBatchGroup] = useState("apps");
  const [selectedPlugin, setSelectedPlugin] = useState<OrbitPluginManifest | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
  const [tripCounts, setTripCounts] = useState<Record<string, number>>({});
  const [tripPanelItem, setTripPanelItem] = useState<OrbitItem | null>(null);
  const [tripPanelHighlightId, setTripPanelHighlightId] = useState<string | null>(null);
  const [tripsQuery, setTripsQuery] = useState("");
  const [tripSearchResults, setTripSearchResults] = useState<TripSearchResult[]>([]);
  const hotkeyInputRef = useRef<HTMLInputElement>(null);

  const [importPreview, setImportPreview] = useState<{
    kind: "shortcuts" | "bookmarks";
    items: OrbitItemInput[];
    selectedIndices: Set<number>;
    searchQuery: string;
  } | null>(null);
  const pluginHost = useMemo(() => createOrbitPluginHost(plugins), [plugins]);
  const [pluginHostRevision, setPluginHostRevision] = useState(0);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLElement>(null);
  const contextEditTargetRef = useRef<HTMLElement | null>(null);
  const lastPointerRef = useRef({ x: 24, y: 24 });
  const dropInProgressRef = useRef(false);

  useEffect(() => {
    if (isTauriRuntime()) {
      void getAutostartEnabled().then(setAutostartEnabled);
    }
  }, []);

  function applySnapshot(snapshot: Awaited<ReturnType<typeof loadSnapshot>>) {
    setItems(snapshot.items);
    setGroups(snapshot.groups);
    setCommands(snapshot.commands);
    setPlugins(snapshot.plugins);
    setThemes(snapshot.themes);
    setSettings(snapshot.settings);
    setLogs(snapshot.logs);
  }

  async function reload() {
    const snapshot = await loadSnapshot();
    applySnapshot(snapshot);
  }

  async function refreshTripCounts(scopeItems = items) {
    if (scopeItems.length === 0) {
      setTripCounts({});
      return;
    }
    const counts = await tripCountForItems(scopeItems.map((item) => item.id));
    setTripCounts(counts);
  }

  async function refreshTripSearch(queryText = tripsQuery) {
    const results = await searchTrips(queryText);
    setTripSearchResults(results);
  }

  async function handleTripsChanged() {
    await refreshTripCounts();
    await refreshTripSearch();
  }

  useEffect(() => {
    reload().catch((error) => setToast(`加载失败：${String(error)}`));
  }, []);

  useEffect(() => {
    refreshTripCounts(items).catch((error) => console.warn("Failed to load trip counts", error));
  }, [items]);

  useEffect(() => {
    refreshTripSearch(tripsQuery).catch((error) => console.warn("Failed to search trips", error));
  }, [tripsQuery]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      setToast(message);
    };
    window.addEventListener("orbit-toast", onToast);
    return () => window.removeEventListener("orbit-toast", onToast);
  }, []);

  useEffect(() => {
    const onOpenTrip = (event: Event) => {
      const detail = (event as CustomEvent<{ itemId: string; tripId?: string }>).detail;
      if (!detail.itemId) {
        setActiveView("trips");
        return;
      }
      const item = items.find((candidate) => candidate.id === detail.itemId);
      if (!item) {
        setToast("未找到关联资源");
        return;
      }
      setActiveView("trips");
      setTripPanelItem(item);
      setTripPanelHighlightId(detail.tripId ?? null);
    };
    window.addEventListener("orbit-open-trip", onOpenTrip);
    return () => window.removeEventListener("orbit-open-trip", onOpenTrip);
  }, [items]);

  function focusSearch() {
    setActiveView("dashboard");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function closeTransientUi() {
    setPaletteOpen(false);
    setEditor(null);
    setBackupOpen(false);
    setDialog(null);
    setSelectedPlugin(null);
    setContextMenu(null);
  }

  useEffect(() => {
    return installDesktopShell({
      closeTransientUi,
      focusSearch,
      openCommandPalette: () => setPaletteOpen(true),
      openSettings: () => {
        setLocalAuxPanel("settings");
        setSettingsSection("general");
      },
      openPanel: (panel) => {
        setLocalAuxPanel(panel as AuxPanel);
        setSettingsSection(sectionFromPanel(panel as AuxPanel));
      },
      refreshResources: reload,
      toggleSafeMode
    });
  }, [settings?.safeMode]);

  useEffect(() => {
    if (paletteOpen) {
      requestAnimationFrame(() => paletteInputRef.current?.focus());
    }
  }, [paletteOpen]);

  useEffect(() => {
    const trackPointer = (event: globalThis.PointerEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", trackPointer, { passive: true });
    window.addEventListener("pointerdown", trackPointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", trackPointer);
      window.removeEventListener("pointerdown", trackPointer);
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const rect = contextMenuRef.current.getBoundingClientRect();
    const margin = 10;
    const nextX = Math.min(Math.max(margin, contextMenu.x), Math.max(margin, window.innerWidth - rect.width - margin));
    const nextY = Math.min(Math.max(margin, contextMenu.y), Math.max(margin, window.innerHeight - rect.height - margin));
    if (Math.abs(nextX - contextMenu.x) > 0.5 || Math.abs(nextY - contextMenu.y) > 0.5) {
      setContextMenu((current) => (current ? { ...current, x: nextX, y: nextY } : current));
    }
  }, [contextMenu]);

  useEffect(() => {
    const currentWindow = getAppWindow();
    const unlisteners: (() => void)[] = [];
    if (currentWindow) {
      Promise.all([
        currentWindow.listen<any>("tauri://drag-enter", () => {
          setDragActive(true);
        }),
        currentWindow.listen<any>("tauri://drag-leave", () => {
          setDragActive(false);
        }),
        currentWindow.listen<any>("tauri://drag-drop", (event) => {
          setDragActive(false);
          const paths = event.payload?.paths;
          if (Array.isArray(paths)) {
            void createDroppedResources(paths);
          }
        })
      ]).then((fns) => {
        unlisteners.push(...fns);
      }).catch(() => undefined);
    }

    const droppedPathsFromBrowserEvent = (event: DragEvent) => {
      return Array.from(event.dataTransfer?.files ?? [])
        .map((file) => {
          const fileWithPath = file as File & { path?: string };
          return fileWithPath.path ?? file.webkitRelativePath ?? "";
        })
        .filter(Boolean);
    };
    const handleBrowserDrag = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      setDragActive(true);
    };
    const handleBrowserLeave = (event: DragEvent) => {
      event.preventDefault();
      if (event.target === document.body || event.target === document.documentElement) {
        setDragActive(false);
      }
    };
    const handleBrowserDrop = (event: DragEvent) => {
      event.preventDefault();
      setDragActive(false);
      const paths = droppedPathsFromBrowserEvent(event);
      if (paths.length > 0) {
        void createDroppedResources(paths);
      } else if (!isTauriRuntime()) {
        setToast("浏览器预览无法读取本地路径，请在桌面版中拖拽文件");
      }
    };
    window.addEventListener("dragenter", handleBrowserDrag);
    window.addEventListener("dragover", handleBrowserDrag);
    window.addEventListener("dragleave", handleBrowserLeave);
    window.addEventListener("drop", handleBrowserDrop);

    return () => {
      unlisteners.forEach((fn) => fn());
      window.removeEventListener("dragenter", handleBrowserDrag);
      window.removeEventListener("dragover", handleBrowserDrag);
      window.removeEventListener("dragleave", handleBrowserLeave);
      window.removeEventListener("drop", handleBrowserDrop);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = pluginHost.subscribe(() => setPluginHostRevision((revision) => revision + 1));
    pluginHost.start();
    return () => {
      unsubscribe();
      pluginHost.dispose();
    };
  }, [pluginHost]);

  useEffect(() => {
    let cancelled = false;
    pluginHost.search.query(paletteQuery).then((results) => {
      if (!cancelled) setPluginResults(results);
    });
    return () => {
      cancelled = true;
    };
  }, [paletteQuery, pluginHost, pluginHostRevision]);

  const activeTheme = useMemo(() => {
    return themes.find((theme) => theme.id === settings?.activeThemeId) ?? themes[0];
  }, [settings?.activeThemeId, themes]);

  useEffect(() => {
    if (!activeTheme) return;
    const root = document.documentElement;
    root.dataset.theme = activeTheme.id;
    if (activeTheme.id.startsWith("atelier-")) {
      root.dataset.themeStyle = "atelier";
    } else {
      delete root.dataset.themeStyle;
    }
    root.removeAttribute("style");
    Object.entries(activeTheme.tokens).forEach(([key, value]) => root.style.setProperty(key, value));
  }, [activeTheme]);

  const pluginEnabled = (id: string) => plugins.some((plugin) => plugin.id === id && plugin.enabled);

  const visibleKindOptions = baseKindOptions.filter((option) => !option.pluginId || pluginEnabled(option.pluginId));

  function itemKindAllowed(item: OrbitItem) {
    if (item.kind === "website") return pluginEnabled("core-websites");
    if (item.kind === "action_chain") return pluginEnabled("core-actions");
    return true;
  }

  const visibleGroups = groups.filter((group) => {
    if (group.id === "web") return pluginEnabled("core-websites");
    return true;
  });

  const filteredItems = useMemo(() => {
    const matched = items
      .filter(itemKindAllowed)
      .filter((item) => {
        if (activeGroup === "all") return true;
        return itemHasGroup(item, activeGroup);
      })
      .filter((item) => matchesItem(item, query));

    const q = query.trim().toLowerCase();
    if (!q) {
      return matched;
    }

    return matched.slice().sort((a, b) => {
      const scoreA = scoreItem(a, query);
      const scoreB = scoreItem(b, query);
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      // Tie breaker: database order (favorite, launchCount, etc.)
      const aFav = a.favorite ? 1 : 0;
      const bFav = b.favorite ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      const aLaunch = a.launchCount ?? 0;
      const bLaunch = b.launchCount ?? 0;
      if (aLaunch !== bLaunch) return bLaunch - aLaunch;
      return a.title.localeCompare(b.title, "zh-Hans-CN");
    });
  }, [activeGroup, items, plugins, query]);

  const favoriteItems = filteredItems.filter((item) => item.favorite);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const enabledPlugins = plugins.filter((plugin) => plugin.enabled).length;
  const density = settings?.density === "compact" ? "compact" : "comfortable";
  const isLocalGalaxyTheme = activeTheme?.id === "local-galaxy";
  const themeLabel = activeTheme?.name ? activeTheme.name.toUpperCase() : "ORBITSTART";
  const galaxyAssetVars = {
    "--asset-divider-glow": `url("${localGalaxyAssets.effects.dividerGlow.src}")`,
    "--asset-search-edge": `url("${localGalaxyAssets.effects.searchEdge.src}")`,
    "--asset-active-tab-glow": `url("${localGalaxyAssets.effects.activeTabGlow.src}")`,
    "--asset-cyan-glow": `url("${localGalaxyAssets.effects.cyanGlow.src}")`,
    "--asset-gold-glow": `url("${localGalaxyAssets.effects.goldGlow.src}")`,
    "--asset-radar": `url("${localGalaxyAssets.ornaments.radar.src}")`,
    "--asset-compass-star": `url("${localGalaxyAssets.ornaments.compass.src}")`,
    "--asset-log-texture": `url("${localGalaxyAssets.textures.logs.src}")`,
    "--asset-settings-star-map": `url("${localGalaxyAssets.ornaments.settingsStarMap.src}")`,
    "--asset-scan-orbit": `url("${localGalaxyAssets.ornaments.scanOrbit.src}")`,
    "--asset-astrolabe": `url("${localGalaxyAssets.ornaments.astrolabe.src}")`,
    "--asset-panel-corner": `url("${localGalaxyAssets.frames.corner.src}")`
  } as CSSProperties;
  const appShellStyle = isLocalGalaxyTheme ? galaxyAssetVars : undefined;
  const activeViewMeta: Record<ViewId, { title: string; subtitle: string }> = {
    dashboard: { title: "资源中心", subtitle: "统一管理本地应用、文件、网址与自动化入口" },
    trips: { title: "Trips", subtitle: "为资源记录快捷键、流程、参数和状态提示" },
    settings: { title: "设置中心", subtitle: "系统偏好、引擎、主题与数据维护" },
    logs: { title: "运行日志", subtitle: "查看最近的引擎事件、扫描结果与系统反馈" }
  };

  function iconBaseFor(item: OrbitItem) {
    return item.kind === "website" || item.kind === "script" || item.kind === "action_chain"
      ? localGalaxyAssets.icons.shellViolet64.src
      : localGalaxyAssets.icons.shellTeal64.src;
  }

  function resourceIconStyle(item: OrbitItem) {
    return {
      "--accent": item.accent,
      "--asset-icon-base": isLocalGalaxyTheme ? `url("${iconBaseFor(item)}")` : "none"
    } as CSSProperties;
  }

  function renderBrandIcon(size = 24) {
    return <img src={appIconSrc} alt="" width={size} height={size} />;
  }

  function inputWithKind(input: OrbitItemInput, kind: ItemKind): OrbitItemInput {
    const option = baseKindOptions.find((candidate) => candidate.value === kind) ?? baseKindOptions[0];
    return {
      ...input,
      kind,
      group: normalizeGroupValue(mergeGroupValues(option.group, input.group), option.group),
      icon: option.icon,
      accent: option.accent
    };
  }

  async function openItem(item: OrbitItem) {
    setBusy(true);
    try {
      const result = await launchItem(item.id, item.target);
      setToast(result);
      await reload();
    } catch (error) {
      setToast(`启动失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveEditor() {
    if (!editor) return;
    const option = baseKindOptions.find((candidate) => candidate.value === editor.input.kind) ?? baseKindOptions[0];
    const normalizedInput = {
      ...editor.input,
      group: normalizeGroupValue(editor.input.group, option.group),
      aliases: uniqueList(editor.input.aliases),
      tags: uniqueList(editor.input.tags)
    };

    if (!normalizedInput.title.trim() || !normalizedInput.target.trim()) {
      setToast("标题和目标路径/网址不能为空");
      return;
    }

    setBusy(true);
    try {
      if (editor.mode === "create") {
        await createItem(normalizedInput);
        setToast(`已添加：${normalizedInput.title}`);
      } else {
        await updateItem({
          ...editor.item,
          ...normalizedInput
        });
        setToast(`已更新：${normalizedInput.title}`);
      }
      setEditor(null);
      await reload();
    } catch (error) {
      setToast(`保存失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function createDroppedResources(paths: string[]) {
    const cleanPaths = paths.map((path) => path.trim()).filter(Boolean);
    if (cleanPaths.length === 0 || dropInProgressRef.current) return;

    dropInProgressRef.current = true;
    setBusy(true);
    try {
      const created = await createItemsFromPaths(cleanPaths);
      await reload();
      setActiveView("dashboard");
      setToast(`已通过拖拽创建 ${created.length} 个资源`);
    } catch (error) {
      setToast(`拖拽创建失败：${String(error)}`);
    } finally {
      dropInProgressRef.current = false;
      setBusy(false);
    }
  }

  function mergePickedResourceInput(current: OrbitItemInput, picked: OrbitItemInput): OrbitItemInput {
    return {
      ...current,
      kind: picked.kind,
      group: normalizeGroupValue(mergeGroupValues(current.group, picked.group), picked.group),
      target: picked.target,
      title: current.title.trim() ? current.title : picked.title,
      subtitle: current.subtitle.trim() ? current.subtitle : picked.subtitle,
      aliases: Array.from(new Set([...current.aliases, ...picked.aliases])),
      tags: Array.from(new Set([...current.tags, ...picked.tags])),
      icon: picked.icon,
      accent: picked.accent
    };
  }

  async function chooseResourceTarget(mode: "file" | "folder") {
    if (!editor) return;
    setBusy(true);
    try {
      const picked = await pickResourceInput(mode);
      if (!picked) return;
      setEditor((current) => (current ? { ...current, input: mergePickedResourceInput(current.input, picked) } : current));
      setToast(mode === "folder" ? "已选择文件夹" : "已选择本地资源");
    } catch (error) {
      setToast(`选择资源失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function chooseCustomIcon() {
    if (!editor) return;
    setBusy(true);
    try {
      const icon = await pickIconImage();
      if (!icon) return;
      setEditor((current) => (current ? { ...current, input: { ...current.input, icon } } : current));
      setToast("已应用自定义图标");
    } catch (error) {
      setToast(`选择图标失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function resetEditorIcon() {
    setEditor((current) => {
      if (!current) return current;
      const option = baseKindOptions.find((candidate) => candidate.value === current.input.kind) ?? baseKindOptions[0];
      return { ...current, input: { ...current.input, icon: option.icon } };
    });
  }

  async function removeItem(item: OrbitItem) {
    setDialog({ type: "delete-item", item });
  }

  async function confirmRemoveItem(item: OrbitItem) {
    setBusy(true);
    try {
      await deleteItem(item.id);
      setToast(`已删除：${item.title}`);
      setDialog(null);
      await reload();
    } catch (error) {
      setToast(`删除失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(item: OrbitItem) {
    setBusy(true);
    try {
      await updateItem({
        ...item,
        favorite: !item.favorite
      });
      await reload();
    } catch (error) {
      setToast(`更新收藏失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function addCustomGroup() {
    setDialog({ type: "group", value: "" });
  }

  async function confirmCustomGroup(title: string) {
    if (!title.trim()) {
      setToast("标签名称不能为空");
      return;
    }
    setBusy(true);
    try {
      const nextGroups = await createGroup(title.trim());
      setGroups(nextGroups);
      const created = nextGroups.find((group) => group.title === title.trim());
      if (created) setActiveGroup(created.id);
      setToast(`已创建标签：${title.trim()}`);
      setDialog(null);
    } catch (error) {
      setToast(`创建标签失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]));
  }

  function exitBatchMode() {
    setBatchMode(false);
    setSelectedIds([]);
  }

  async function batchDeleteSelected() {
    if (selectedIds.length === 0) return;
    setDialog({ type: "batch-delete" });
  }

  async function confirmBatchDeleteSelected() {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      for (const id of selectedIds) {
        await deleteItem(id);
      }
      exitBatchMode();
      setDialog(null);
      await reload();
      setToast("批量删除完成");
    } catch (error) {
      setToast(`批量删除失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function batchMoveSelected() {
    if (selectedIds.length === 0) return;
    setDialog({ type: "batch-move", groupId: batchGroup });
  }

  async function confirmBatchMoveSelected(groupId: string) {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      const selected = items.filter((item) => selectedIds.includes(item.id));
      for (const item of selected) {
        await updateItem({ ...item, group: normalizeGroupValue(mergeGroupValues(item.group, groupId), groupId) });
      }
      setBatchGroup(groupId);
      exitBatchMode();
      setDialog(null);
      await reload();
      const group = groups.find((candidate) => candidate.id === groupId);
      setToast(`已添加标签：${group?.title ?? groupId}`);
    } catch (error) {
      setToast(`批量移动失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  const handleHotkeyKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isRecordingHotkey) return;
    event.preventDefault();
    event.stopPropagation();

    // 如果按下 Escape 键，退出录制并取消
    if (event.key === "Escape") {
      setIsRecordingHotkey(false);
      setRecordedKeys([]);
      return;
    }

    // 如果按下 Backspace，清空录制
    if (event.key === "Backspace") {
      setRecordedKeys([]);
      return;
    }

    const keys: string[] = [];

    // 检测修饰键
    if (event.ctrlKey) keys.push("Ctrl");
    if (event.altKey) keys.push("Alt");
    if (event.shiftKey) keys.push("Shift");
    if (event.metaKey) keys.push("Win");
    
    // 排除修饰键本身的名称
    const key = event.key;
    const isModifierOnly = ["Control", "Alt", "Shift", "Meta", "OS"].includes(key);

    if (!isModifierOnly) {
      let keyName = key;
      if (keyName === " ") keyName = "Space";
      
      // 规范化名称
      if (keyName.length === 1) {
        keyName = keyName.toUpperCase();
      } else {
        // 首字母大写
        keyName = keyName.charAt(0).toUpperCase() + keyName.slice(1);
      }
      keys.push(keyName);
    }

    // 限制最多四个键
    const finalKeys = keys.slice(0, 4);
    setRecordedKeys(finalKeys);
  };

  async function saveHotkey() {
    const hasMainKey = recordedKeys.length > 0 && !["Ctrl", "Alt", "Shift", "Win"].includes(recordedKeys[recordedKeys.length - 1]);
    if (!hasMainKey) {
      setToast("快捷键必须包含一个主键（例如字母、数字或空格）");
      return;
    }
    const newHotkey = recordedKeys.join("+");
    const oldHotkey = settings?.globalHotkey ?? "Ctrl+Alt+Space";
    if (newHotkey === oldHotkey) {
      setIsRecordingHotkey(false);
      return;
    }
    
    setBusy(true);
    try {
      await updateGlobalHotkey(oldHotkey, newHotkey);
      if (settings) {
        setSettings({ ...settings, globalHotkey: newHotkey });
      }
      setToast(`全局热键已更新为：${newHotkey}`);
      setIsRecordingHotkey(false);
    } catch (error) {
      setToast(`注册热键失败，可能被占用：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runNativeItemScan(kind: "shortcuts" | "bookmarks") {
    setBusy(true);
    setToast(kind === "shortcuts" ? "正在扫描本地程序..." : "正在读取浏览器书签...");
    try {
      const scanned = kind === "shortcuts" 
        ? await previewScanShortcuts() 
        : await previewScanBrowserBookmarks();
      
      if (scanned.length === 0) {
        setToast("未扫描到任何可用资源");
        return;
      }

      // 默认选中所有项，但自动过滤包含 "uninstall" 或 "卸载" 字样的项
      const selectedIndices = new Set<number>();
      scanned.forEach((item, index) => {
        const titleLower = item.title.toLowerCase();
        const subtitleLower = item.subtitle.toLowerCase();
        const targetLower = item.target.toLowerCase();
        const isUninstall = titleLower.includes("uninstall") || titleLower.includes("卸载") 
          || subtitleLower.includes("uninstall") || subtitleLower.includes("卸载")
          || targetLower.includes("uninstall") || targetLower.includes("卸载");
        
        if (!isUninstall) {
          selectedIndices.add(index);
        }
      });

      setImportPreview({
        kind,
        items: scanned,
        selectedIndices,
        searchQuery: ""
      });
      setToast(kind === "shortcuts" ? "本地程序扫描已就绪，请选择导入" : "浏览器书签扫描已就绪，请选择导入");
    } catch (error) {
      setToast(`扫描失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runExport() {
    setBusy(true);
    try {
      const result = await exportCatalogJson();
      setBackupJson(result.json);
      setBackupPath(result.path);
      setBackupOpen(true);
      setToast("数据备份已导出");
    } catch (error) {
      setToast(`导出失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!backupJson.trim()) {
      setToast("请先粘贴 JSON");
      return;
    }
    setBusy(true);
    try {
      const nextItems = await importCatalogJson(backupJson);
      setItems(nextItems);
      setBackupOpen(false);
      await reload();
      setToast(`导入完成：当前 ${nextItems.length} 个资源`);
    } catch (error) {
      setToast(`导入失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function togglePlugin(plugin: OrbitPluginManifest) {
    setBusy(true);
    try {
      const snapshot = await setPluginEnabled(plugin.id, !plugin.enabled);
      applySnapshot(snapshot);
      setToast(`${plugin.name} 已${plugin.enabled ? "停用" : "启用"}`);
      if (plugin.id === "core-websites" && plugin.enabled && activeGroup === "web") {
        setActiveGroup("all");
      }
    } catch (error) {
      setToast(`插件状态更新失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function changeTheme(themeId: string) {
    setBusy(true);
    try {
      const snapshot = await setActiveTheme(themeId);
      applySnapshot(snapshot);
      setToast(`已应用主题：${themeId}`);
    } catch (error) {
      setToast(`主题切换失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function changeDensity(next: "comfortable" | "compact") {
    setBusy(true);
    try {
      const snapshot = await setDensity(next);
      applySnapshot(snapshot);
      setToast(`密度已切换：${next}`);
    } catch (error) {
      setToast(`密度切换失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function changeCloseBehavior(next: "tray" | "exit") {
    setBusy(true);
    try {
      const snapshot = await setCloseBehavior(next);
      applySnapshot(snapshot);
      setToast(next === "tray" ? "关闭按钮已设置为隐藏到托盘" : "关闭按钮已设置为直接退出");
    } catch (error) {
      setToast(`关闭行为更新失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function openPanelWindow(panel: AuxPanel) {
    // 设置页面直接在主窗口中央本地渲染，不再打开独立的 Tauri 子窗口以保证跟随和关闭生命周期一致
    setLocalAuxPanel(panel);
    setSettingsSection(sectionFromPanel(panel));
  }

  async function toggleSafeMode() {
    setBusy(true);
    try {
      const snapshot = await setSafeMode(!settings?.safeMode);
      applySnapshot(snapshot);
      setToast(snapshot.settings.safeMode ? "安全模式已启用：第三方插件暂时停用" : "安全模式已关闭");
    } catch (error) {
      setToast(`安全模式更新失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleAutostart() {
    const next = !autostartEnabled;
    setBusy(true);
    try {
      await setAutostartEnabled(next);
      setAutostartEnabled(next);
      setToast(next ? "开机自启动已启用" : "开机自启动已禁用");
    } catch (error) {
      setToast(`设置自启动失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function createTemplate() {
    setDialog({ type: "template", value: "My Command Plugin" });
  }

  async function confirmCreateTemplate(name: string) {
    if (!name.trim()) {
      setToast("插件名称不能为空");
      return;
    }
    setBusy(true);
    try {
      const path = await createPluginTemplate(name.trim());
      await reload();
      setActiveView("settings");
      setSettingsSection("dev");
      setToast(`插件模板已创建：${path}`);
      setDialog(null);
    } catch (error) {
      setToast(`创建插件模板失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function openDataDir() {
    try {
      const path = await openDataDirectory();
      setToast(`数据目录：${path}`);
    } catch (error) {
      setToast(`打开数据目录失败：${String(error)}`);
    }
  }

  async function copyToast(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast("已复制到剪贴板");
    } catch {
      setToast(text);
    }
  }

  async function handleCommand(command: OrbitCommand) {
    if (command.id === "core.addItem") {
      setEditor({ mode: "create", input: makeEmptyInput() });
      return;
    }
    if (command.id === "core.addActionChain") {
      setEditor({ mode: "create", input: makeEmptyInput("action_chain") });
      return;
    }
    if (command.id === "core.scanShortcuts") {
      await runNativeItemScan("shortcuts");
      return;
    }
    if (command.id === "core.scanBookmarks") {
      await runNativeItemScan("bookmarks");
      return;
    }
    if (command.id === "core.exportJson") {
      await runExport();
      return;
    }
    if (command.id === "core.themeStudio") {
      await openPanelWindow("themes");
      return;
    }
    if (command.id === "core.createPluginTemplate") {
      await createTemplate();
      return;
    }
    if (command.id === "core.openDataDir") {
      await openDataDir();
      return;
    }
    if (command.id === "core.commandPalette") {
      setPaletteOpen(true);
      return;
    }
    setToast(`命令已触发：${command.title}`);
  }

  const paletteCommands = useMemo(() => {
    const raw = buildSortedResults({
      items,
      commands,
      paletteQuery,
      itemFilter: itemKindAllowed,
      toItemResult: (item) => ({
        id: `item:${item.id}`,
        title: item.title,
        subtitle: item.subtitle,
        icon: item.icon,
        source: item.kind,
        actionLabel: "打开",
        run: () => openItem(item)
      }),
      toCommandResult: (command) => ({
        id: command.id,
        title: command.title,
        subtitle: command.subtitle,
        icon: command.icon,
        source: command.pluginId,
        actionLabel: "执行命令",
        run: () => handleCommand(command)
      }),
      extraPluginResults: [
        ...pluginHost.commands.list().map((command) => ({
          id: command.id,
          title: command.title,
          subtitle: command.subtitle,
          icon: command.icon,
          source: command.pluginId,
          actionLabel: "执行插件命令",
          run: command.run
        })),
        ...pluginResults
      ]
    });

    // Auto-reset selection when results change, keep in bounds
    setPaletteSelectedIndex((prev) => Math.min(prev, Math.max(0, raw.length - 1)));
    return raw;
  }, [commands, items, paletteQuery, pluginHost, pluginHostRevision, pluginResults, plugins]);

  /** Keyboard navigation handler for command palette. */
  const handlePaletteKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const total = paletteCommands.length;
    if (total === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setPaletteSelectedIndex((prev) => (prev + 1) % total);
        break;
      case "ArrowUp":
        event.preventDefault();
        setPaletteSelectedIndex((prev) => (prev - 1 + total) % total);
        break;
      case "Enter":
        event.preventDefault();
        const selected = paletteCommands[paletteSelectedIndex];
        if (selected) { selected.run(); setPaletteOpen(false); }
        break;
      case "Escape":
        event.preventDefault();
        setPaletteOpen(false);
        break;
    }
  };

  const navItems: Array<{ id: ViewId; title: string; icon: JSX.Element }> = [
    { id: "dashboard", title: "工作台", icon: <LayoutDashboard size={21} /> },
    { id: "trips", title: "Trips", icon: <Lightbulb size={21} /> },
    { id: "settings", title: "设置", icon: <Settings size={21} /> },
    { id: "logs", title: "日志", icon: <Database size={21} /> }
  ];

  const handleTitlebarPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".window-controls")) return;
    startWindowDrag();
  };

  const handleTitlebarDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest(".window-controls")) return;
    toggleMaximizeWindow();
  };

  function handleAppContextMenu(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const nativeEvent = event.nativeEvent;
    const fallbackPoint = lastPointerRef.current;
    const clientX =
      Number.isFinite(nativeEvent.clientX) && nativeEvent.clientX > 0 && nativeEvent.clientX <= window.innerWidth
        ? nativeEvent.clientX
        : fallbackPoint.x;
    const clientY =
      Number.isFinite(nativeEvent.clientY) && nativeEvent.clientY > 0 && nativeEvent.clientY <= window.innerHeight
        ? nativeEvent.clientY
        : fallbackPoint.y;
    const nextMenu = contextMenuFromEvent({ clientX, clientY, target: nativeEvent.target });
    contextEditTargetRef.current = nextMenu.kind === "edit" ? editableElementFrom(event.nativeEvent.target) : null;
    setContextMenu(nextMenu);
  }

  async function runResourceContextAction(action: "launch" | "reveal" | "copy" | "edit" | "favorite" | "delete", item: OrbitItem) {
    setContextMenu(null);
    if (action === "launch") {
      await openItem(item);
      return;
    }
    if (action === "reveal") {
      try {
        const result = await revealTarget(item.target);
        setToast(result);
      } catch (error) {
        setToast(`打开所在位置失败：${String(error)}`);
      }
      return;
    }
    if (action === "copy") {
      await copyText(item.target);
      setToast("已复制路径 / URL");
      return;
    }
    if (action === "edit") {
      setEditor({ mode: "edit", item, input: inputFromItem(item) });
      return;
    }
    if (action === "favorite") {
      await toggleFavorite(item);
      return;
    }
    removeItem(item);
  }

  async function runBlankContextAction(action: "add" | "scan" | "bookmarks" | "refresh" | "settings") {
    setContextMenu(null);
    if (action === "add") {
      setEditor({ mode: "create", input: makeEmptyInput() });
      return;
    }
    if (action === "scan") {
      await runNativeItemScan("shortcuts");
      return;
    }
    if (action === "bookmarks") {
      await runNativeItemScan("bookmarks");
      return;
    }
    if (action === "refresh") {
      await reload();
      setToast("资源索引已刷新");
      return;
    }
    await openPanelWindow("settings");
  }

  async function runEditContextAction(command: EditMenuCommand) {
    const target = contextEditTargetRef.current;
    setContextMenu(null);
    await runEditMenuCommand(command, target);
  }

  const renderDashboard = () => (
    <section className="page-layout dashboard-page">
      <section className="kpi-grid" aria-label="工作台概览">
        <article className="kpi-card">
          <span>资源总数</span>
          <strong>{items.length}</strong>
          <em>本地入口与链接</em>
        </article>
        <article className="kpi-card">
          <span>启用引擎</span>
          <strong>{enabledPlugins}</strong>
          <em>{plugins.length} 个可用模块</em>
        </article>
        <article className="kpi-card">
          <span>主题方案</span>
          <strong>{themes.length}</strong>
          <em>{activeTheme?.name ?? "默认主题"}</em>
        </article>
        <article className="kpi-card">
          <span>安全模式</span>
          <strong>{settings?.safeMode ? "启用" : "关闭"}</strong>
          <em>第三方扩展控制</em>
        </article>
      </section>

      <section className="group-tabs" aria-label="资源分组">
        {visibleGroups.map((group) => (
          <button key={group.id} className={activeGroup === group.id ? "selected" : ""} onClick={() => setActiveGroup(group.id)}>
            <Icon name={group.icon} size={16} />
            <span>{group.title}</span>
          </button>
        ))}
        <button className="add-group-tab" onClick={addCustomGroup} disabled={busy}>
          <PlusCircle size={16} />
          <span>新分组</span>
        </button>
      </section>

      <section className="dashboard-grid">
        <section className="surface-panel resource-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Resources</p>
              <h2>{filteredItems.length} 个资源</h2>
            </div>
            <div className="section-actions">
              <span>{favoriteItems.length} 个星标 · {items.length} 个总条目</span>
              <button type="button" className="secondary-action compact-action" onClick={() => (batchMode ? exitBatchMode() : setBatchMode(true))}>
                {batchMode ? "退出批量" : "批量管理"}
              </button>
            </div>
          </div>

          {batchMode && (
            <div className="batch-toolbar">
              <strong>已选 {selectedIds.length} 个</strong>
              <button type="button" onClick={() => setSelectedIds(filteredItems.map((item) => item.id))}>全选当前</button>
              <button type="button" onClick={() => setSelectedIds([])}>清空</button>
              <button type="button" onClick={batchMoveSelected} disabled={busy || selectedIds.length === 0}>加标签</button>
              <button type="button" className="danger-action" onClick={batchDeleteSelected} disabled={busy || selectedIds.length === 0}>删除</button>
            </div>
          )}

          <div className="resource-list">
            {filteredItems.map((item) => (
              <article key={item.id} className={`resource-row ${selectedIds.includes(item.id) ? "selected" : ""}`} data-resource-id={item.id}>
                {batchMode && (
                  <label className="tile-check">
                    <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} />
                  </label>
                )}
                <button type="button" className="resource-launch" onClick={() => (batchMode ? toggleSelected(item.id) : openItem(item))} disabled={busy}>
                  <span
                    className="resource-icon"
                    style={resourceIconStyle(item)}
                  >
                    <Icon name={item.icon} size={26} />
                  </span>
                  <span className="resource-copy">
                    <strong>{item.title}</strong>
                    <small>{item.subtitle || item.target}</small>
                    <span className="resource-group-tags" aria-label="资源标签">
                      {groupLabelsForItem(item, groups).map((group) => (
                        <em key={group.id}>{group.title}</em>
                      ))}
                    </span>
                  </span>
                  <span className="resource-meta-column">
                    <em>{item.launchCount} 次启动</em>
                    <small>{lastLaunchedText(item)}</small>
                  </span>
                </button>
                {!batchMode && (
                  <div className="tile-actions">
                    <button
                      className={`trip-action ${tripCounts[item.id] ? "has-trips" : ""}`}
                      title="Trips"
                      onClick={() => {
                        setTripPanelItem(item);
                        setTripPanelHighlightId(null);
                      }}
                      disabled={busy}
                    >
                      <Lightbulb size={15} />
                      {tripCounts[item.id] > 0 && <span className="trip-badge">{tripCounts[item.id]}</span>}
                    </button>
                    <button
                      className={`favorite-action ${item.favorite ? "is-favorite" : ""}`}
                      title="星标"
                      onClick={() => toggleFavorite(item)}
                      disabled={busy}
                    >
                      {item.favorite ? <img src={localGalaxyAssets.icons.favoriteStar20.src} alt="" /> : <Star size={15} />}
                    </button>
                    <button title="编辑" onClick={() => setEditor({ mode: "edit", item, input: inputFromItem(item) })}>
                      <Pencil size={15} />
                    </button>
                    <button title="删除" onClick={() => removeItem(item)} disabled={busy}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </article>
            ))}
            {filteredItems.length === 0 && (
              <div className="empty-state">
                <Search size={28} />
                <strong>未发现匹配资源</strong>
                <span>调整搜索关键词、切换分组，或导入本地资源。</span>
              </div>
            )}
          </div>
        </section>

        <aside className="surface-panel operations-panel">
          <section className="status-card">
            <div className="status-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p>系统状态</p>
              <strong>工作台运行正常</strong>
              <span>所有核心引擎已就绪</span>
            </div>
          </section>

          <section className="operation-group">
            <div className="section-head slim">
              <h2>常用操作</h2>
            </div>
            <button className="wide-command" onClick={() => runNativeItemScan("shortcuts")} disabled={busy || !pluginEnabled("core-shortcuts")}>
              <ScanSearch size={17} />
              <span>扫描本地程序</span>
            </button>
            <button className="wide-command" onClick={() => runNativeItemScan("bookmarks")} disabled={busy || !pluginEnabled("core-bookmarks")}>
              <Bookmark size={17} />
              <span>导入浏览器书签</span>
            </button>
            <button className="wide-command" onClick={runExport} disabled={busy}>
              <Download size={17} />
              <span>导出数据备份</span>
            </button>
          </section>

          <section className="toast-line">
            <CheckCircle2 size={18} />
            <span>{toast}</span>
          </section>
        </aside>
      </section>
    </section>
  );

  const renderTripsPage = () => {
    const totalTrips = Object.values(tripCounts).reduce((sum, value) => sum + value, 0);
    const resourceWithTrips = Object.values(tripCounts).filter((value) => value > 0).length;
    return (
      <section className="page-layout trips-page">
        <section className="kpi-grid trips-kpis" aria-label="Trips 概览">
          <article className="kpi-card">
            <span>Trips 总数</span>
            <strong>{totalTrips}</strong>
            <em>资源使用提示</em>
          </article>
          <article className="kpi-card">
            <span>覆盖资源</span>
            <strong>{resourceWithTrips}</strong>
            <em>{items.length} 个资源中已记录</em>
          </article>
          <article className="kpi-card">
            <span>搜索结果</span>
            <strong>{tripSearchResults.length}</strong>
            <em>{tripsQuery ? "当前关键词" : "最近更新"}</em>
          </article>
          <article className="kpi-card">
            <span>插件入口</span>
            <strong>{pluginEnabled("trips-search") ? "启用" : "停用"}</strong>
            <em>命令面板增强</em>
          </article>
        </section>

        <section className="surface-panel trips-surface">
          <div className="section-head">
            <div>
              <p className="eyebrow">Trip Notes</p>
              <h2>资源提示笔记</h2>
            </div>
            <div className="search-shell trips-search-shell">
              <Search size={17} />
              <input value={tripsQuery} onChange={(event) => setTripsQuery(event.target.value)} placeholder="搜索 Trip 标题、内容、状态或标签..." />
              {tripsQuery && (
                <button type="button" title="清空" onClick={() => setTripsQuery("")}>
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          <div className="trips-result-grid">
            {tripSearchResults.map((result) => {
              const item = itemById.get(result.itemId);
              return (
                <article key={result.trip.id} className="trip-result-card">
                  <div className="trip-result-head">
                    <span className={`trip-chip ${result.trip.category}`}>{tripCategoryLabels[result.trip.category]}</span>
                    {result.trip.status && <span className={`trip-status ${result.trip.status}`}>{tripStatusLabels[result.trip.status] ?? result.trip.status}</span>}
                  </div>
                  <h3>{result.trip.title}</h3>
                  <p>{result.trip.content.replace(/[#*_`|>-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || "暂无内容"}</p>
                  <div className="trip-result-meta">
                    <span>
                      <Icon name={result.itemIcon} size={15} />
                      {result.itemTitle}
                    </span>
                    <button
                      type="button"
                      className="secondary-action compact-action"
                      onClick={() => {
                        if (item) {
                          setTripPanelItem(item);
                          setTripPanelHighlightId(result.trip.id);
                        }
                      }}
                    >
                      查看
                    </button>
                  </div>
                </article>
              );
            })}
            {tripSearchResults.length === 0 && (
              <div className="empty-state trips-empty-state">
                <Lightbulb size={28} />
                <strong>还没有匹配的 Trips</strong>
                <span>从资源卡片上的灯泡按钮开始记录。</span>
              </div>
            )}
          </div>
        </section>
      </section>
    );
  };

  const renderPlugins = () => (
    <section className="settings-page-grid plugins-settings">
      <div className="setting-card wide-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Engines</p>
            <h2>引擎管理</h2>
          </div>
          <button className="secondary-action" onClick={toggleSafeMode} disabled={busy}>
            <ShieldAlert size={17} />
            {settings?.safeMode ? "关闭安全模式" : "开启安全模式"}
          </button>
        </div>
        <div className="data-table plugin-table">
          {plugins.map((plugin) => (
            <article key={plugin.id} className={`data-row plugin-card ${!plugin.enabled ? "is-disabled" : ""}`}>
              <div className="data-main">
                <strong>{plugin.name}</strong>
                <span>{plugin.description}</span>
              </div>
              <div className="permission-row">
                {plugin.permissions.slice(0, 3).map((permission) => (
                  <em key={permission.id} className={`risk-${permission.risk}`}>{permission.label}</em>
                ))}
              </div>
              <small>{plugin.builtin ? "核心引擎" : "本地引擎"} · v{plugin.version}</small>
              <div className="plugin-actions">
                <button className="secondary-action compact-action" onClick={() => setSelectedPlugin(plugin)}>
                  详情
                </button>
                <button className={`switch-button ${plugin.enabled ? "on" : ""}`} onClick={() => togglePlugin(plugin)} disabled={busy}>
                  <Power size={16} />
                  {plugin.enabled ? "停用" : "启用"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
      <div className="setting-card info-card">
        <p className="eyebrow">Behavior</p>
        <h2>即时生效</h2>
        <p>停用网址引擎后，相关分组和资源会从界面隐藏，数据仍保留在本地数据库中。</p>
        <button className="wide-command" onClick={() => setActiveGroup("web")}>
          <Globe size={17} />
          <span>检查网址分组</span>
        </button>
      </div>
    </section>
  );

  const renderThemes = () => {
    const isPremiumTheme = (themeId: string) => {
      return ["local-galaxy", "orbit-dark", "ink-blue", "creative-mode"].includes(themeId);
    };

    const isBasicLight = (themeId: string) => {
      return ["atelier-zero", "atelier-charcoal", "atelier-mint", "atelier-sky", "atelier-pink", "atelier-grey", "atelier-lavender"].includes(themeId);
    };

    const isBasicDark = (themeId: string) => {
      return ["atelier-rust", "atelier-coal", "atelier-abyss", "atelier-amber"].includes(themeId);
    };

    const premiumThemes = themes.filter((t) => isPremiumTheme(t.id));
    const basicLightThemes = themes.filter((t) => isBasicLight(t.id));
    const basicDarkThemes = themes.filter((t) => isBasicDark(t.id));
    const otherThemes = themes.filter((t) => !isPremiumTheme(t.id) && !isBasicLight(t.id) && !isBasicDark(t.id));
    const allPremium = [...premiumThemes, ...otherThemes];

    const renderThemeCard = (theme: ThemeManifest) => (
      <button key={theme.id} className={`theme-card ${theme.id === settings?.activeThemeId ? "selected" : ""}`} onClick={() => changeTheme(theme.id)}>
        <span className="theme-swatches">
          <i style={{ background: theme.tokens["--bg"] }} />
          <i style={{ background: theme.tokens["--accent"] }} />
          <i style={{ background: theme.tokens["--accent-2"] }} />
          <i style={{ background: theme.tokens["--accent-3"] }} />
        </span>
        <strong>{theme.name}</strong>
        <small>{theme.description}</small>
        <em>{theme.builtin ? "官方主题" : "本地主题包"}</em>
      </button>
    );

    return (
      <section className="settings-page-grid theme-settings">
        <div className="setting-card wide-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Theme</p>
              <h2>{activeTheme?.name ?? "未选择主题"}</h2>
            </div>
            <button className="secondary-action" onClick={() => changeDensity(density === "comfortable" ? "compact" : "comfortable")} disabled={busy}>
              <Grid3X3 size={17} />
              {density === "comfortable" ? "紧凑模式" : "舒适模式"}
            </button>
          </div>
          <div className="theme-group-container">
            <h3 className="theme-group-title">高级主题</h3>
            <div className="theme-grid">
              {allPremium.map(renderThemeCard)}
            </div>
            <h3 className="theme-group-title">基础主题 - 亮色</h3>
            <div className="theme-grid">
              {basicLightThemes.map(renderThemeCard)}
            </div>
            <h3 className="theme-group-title">基础主题 - 暗色</h3>
            <div className="theme-grid">
              {basicDarkThemes.map(renderThemeCard)}
            </div>
          </div>
        </div>
        <div className="setting-card info-card">
          <p className="eyebrow">Directory</p>
          <h2>主题包目录</h2>
          <p>{settings?.dataDir ? `${settings.dataDir}\\themes` : "加载中"}</p>
          <button className="wide-command" onClick={openDataDir}>
            <FolderOpen size={17} />
            <span>打开数据目录</span>
          </button>
        </div>
      </section>
    );
  };

  const renderDev = () => (
    <section className="settings-page-grid dev-settings">
      <div className="setting-card">
        <p className="eyebrow">Development</p>
        <h2>引擎开发工具</h2>
        <p>创建标准引擎包结构，接入命令注册、搜索提供者、桌面通知等核心能力。</p>
        <button className="wide-command" onClick={createTemplate} disabled={busy}>
          <FileCode2 size={17} />
          <span>创建引擎模板</span>
        </button>
        <button className="wide-command" onClick={openDataDir}>
          <FolderOpen size={17} />
          <span>打开引擎目录</span>
        </button>
      </div>
      <div className="setting-card">
        <p className="eyebrow">Theme Dev</p>
        <h2>可分享主题包</h2>
        <p>主题包通过 theme.json 声明 CSS tokens，支持附加 theme.css 扩展高级视觉样式。</p>
        <button className="wide-command" onClick={() => copyToast(JSON.stringify(activeTheme, null, 2))}>
          <Copy size={17} />
          <span>复制当前主题</span>
        </button>
      </div>
      <div className="setting-card wide-card">
        <p className="eyebrow">Local First</p>
        <h2>数据路径</h2>
        <div className="path-list">
          <code>{settings?.dataDir ?? "loading"}\\orbit.db</code>
          <code>{settings?.dataDir ?? "loading"}\\plugins</code>
          <code>{settings?.dataDir ?? "loading"}\\themes</code>
          <code>{settings?.dataDir ?? "loading"}\\backups</code>
        </div>
      </div>
    </section>
  );

  const renderLogs = () => (
    <section className="settings-page-grid logs-settings">
      <div className="setting-card wide-card logs-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Logs</p>
            <h2>{logs.length} 条最近事件</h2>
          </div>
        </div>
        <div className="log-list">
          {logs.map((log) => (
            <article key={log.id} className={`log-row ${log.level}`}>
              <strong>{log.pluginId}</strong>
              <span>{log.message}</span>
              <em>{lastLaunchedText({ lastLaunchedAt: log.createdAt } as OrbitItem)}</em>
            </article>
          ))}
          {logs.length === 0 && <p className="empty-copy">暂无引擎日志。</p>}
        </div>
      </div>
    </section>
  );

  const renderGeneralSettings = () => (
    <section className="settings-page-grid general-settings">
      <div className="setting-card">
        <p className="eyebrow">General</p>
        <h2>通用配置</h2>
        <p>控制界面密度、全局热键与插件安全策略。</p>
        <div className="setting-list">
          <label>
            显示密度
            <select value={density} onChange={(event) => changeDensity(event.target.value as "comfortable" | "compact")}>
              <option value="comfortable">舒适</option>
              <option value="compact">紧凑</option>
            </select>
          </label>
          <label>
            全局热键
            <div className="hotkey-input-container">
              <input
                ref={hotkeyInputRef}
                value={isRecordingHotkey ? (recordedKeys.join("+") || "请按下快捷键...") : (settings?.globalHotkey ?? "Ctrl+Alt+Space")}
                readOnly
                onKeyDown={handleHotkeyKeyDown}
                className={isRecordingHotkey ? "recording" : ""}
                placeholder="请按下快捷键..."
                style={{ cursor: isRecordingHotkey ? "pointer" : "default" }}
              />
              {isRecordingHotkey ? (
                <>
                  <button type="button" className="action-btn confirm-btn" onClick={saveHotkey} disabled={busy}>
                    确定
                  </button>
                  <button type="button" className="action-btn cancel-btn" onClick={() => { setIsRecordingHotkey(false); setRecordedKeys([]); }} disabled={busy}>
                    取消
                  </button>
                </>
              ) : (
                <button type="button" className="action-btn" onClick={() => { setIsRecordingHotkey(true); setRecordedKeys([]); setTimeout(() => hotkeyInputRef.current?.focus(), 50); }}>
                  自定义
                </button>
              )}
            </div>
          </label>
          <label>
            关闭按钮
            <select value={settings?.closeBehavior === "exit" ? "exit" : "tray"} onChange={(event) => changeCloseBehavior(event.target.value as "tray" | "exit")}>
              <option value="tray">隐藏到托盘</option>
              <option value="exit">直接退出</option>
            </select>
          </label>
          <label className="setting-inline">
            <input type="checkbox" checked={Boolean(settings?.safeMode)} onChange={toggleSafeMode} />
            安全模式
          </label>
          {isTauriRuntime() && (
            <label className="setting-inline">
              <input type="checkbox" checked={autostartEnabled} onChange={toggleAutostart} />
              开机自启动
            </label>
          )}
        </div>
      </div>
      <div className="setting-card">
        <p className="eyebrow">Launcher</p>
        <h2>主页行为</h2>
        <p>配置首页资源管理方式与本地程序扫描入口。</p>
        <div className="setting-list action-stack">
          <label className="setting-inline">
            <input type="checkbox" checked={batchMode} onChange={(event) => (event.target.checked ? setBatchMode(true) : exitBatchMode())} />
            批量操作模式
          </label>
          <button className="wide-command" onClick={addCustomGroup}>
            <PlusCircle size={17} />
            <span>新建自定义分组</span>
          </button>
          <button className="wide-command" onClick={() => runNativeItemScan("shortcuts")}>
            <ScanSearch size={17} />
            <span>重新扫描本地图标</span>
          </button>
        </div>
      </div>
    </section>
  );

  const renderDataSettings = () => (
    <section className="settings-page-grid data-settings">
      <div className="setting-card wide-card">
        <p className="eyebrow">Data</p>
        <h2>数据目录</h2>
        <p>OrbitStart 的数据库、引擎、主题与备份文件都存储在本地。</p>
        <div className="path-list">
          <code>{settings?.dataDir ?? "loading"}\\orbit.db</code>
          <code>{settings?.dataDir ?? "loading"}\\plugins</code>
          <code>{settings?.dataDir ?? "loading"}\\themes</code>
          <code>{settings?.dataDir ?? "loading"}\\backups</code>
        </div>
        <button className="wide-command" onClick={openDataDir}>
          <FolderOpen size={17} />
          <span>打开数据目录</span>
        </button>
      </div>
      <div className="setting-card">
        <p className="eyebrow">Backup</p>
        <h2>导入导出</h2>
        <p>导出 JSON 备份，或从已有备份恢复资源目录。</p>
        <button className="wide-command" onClick={runExport}>
          <Download size={17} />
          <span>导出 JSON</span>
        </button>
        <button className="wide-command" onClick={() => setBackupOpen(true)}>
          <Upload size={17} />
          <span>导入 JSON</span>
        </button>
      </div>
    </section>
  );

  const renderAbout = () => (
    <section className="settings-page-grid about-settings">
      <div className="setting-card wide-card about-card">
        <p className="eyebrow">About</p>
        <h2>OrbitStart</h2>
        <p>原创 Windows 启动工作台，面向本地应用、文件、网址、脚本和插件入口的统一管理。</p>
        <div className="about-stats">
          <span><strong>{items.length}</strong>资源</span>
          <span><strong>{enabledPlugins}</strong>启用引擎</span>
          <span><strong>{themes.length}</strong>主题</span>
          <span><strong>0.5.0</strong>版本</span>
        </div>
      </div>
      <div className="setting-card">
        <p className="eyebrow">Desktop Shell</p>
        <h2>桌面外壳</h2>
        <p>自定义标题栏、右键菜单、系统托盘、全局快捷键和外部打开逻辑都由 OrbitStart 接管。</p>
      </div>
      <div className="setting-card">
        <p className="eyebrow">Local Data</p>
        <h2>本地优先</h2>
        <p>{settings?.dataDir ?? "正在加载数据目录"}</p>
      </div>
    </section>
  );

  const renderSettings = () => {
    const sections: Array<{ id: SettingsSection; title: string; icon: JSX.Element }> = [
      { id: "general", title: "基础设置", icon: <Settings size={18} /> },
      { id: "plugins", title: "引擎管理", icon: <Blocks size={18} /> },
      { id: "themes", title: "主题工作室", icon: <Palette size={18} /> },
      { id: "dev", title: "开发套件", icon: <Hammer size={18} /> },
      { id: "data", title: "数据备份", icon: <Database size={18} /> },
      { id: "about", title: "关于", icon: <Info size={18} /> }
    ];

    return (
      <section className="settings-shell">
        <aside className="settings-menu">
          {sections.map((section) => (
            <button key={section.id} className={settingsSection === section.id ? "active" : ""} onClick={() => setSettingsSection(section.id)}>
              {section.icon}
              <span>{section.title}</span>
            </button>
          ))}
        </aside>
        <div className="settings-content">
          {settingsSection === "general" && renderGeneralSettings()}
          {settingsSection === "plugins" && renderPlugins()}
          {settingsSection === "themes" && renderThemes()}
          {settingsSection === "dev" && renderDev()}
          {settingsSection === "data" && renderDataSettings()}
          {settingsSection === "about" && renderAbout()}
        </div>
      </section>
    );
  };

  const renderAppDialog = () => {
    if (!dialog) return null;
    const moveGroups = visibleGroups.filter((group) => group.id !== "all");

    if (dialog.type === "group") {
      return (
        <section className="palette-backdrop centered-backdrop" role="dialog" aria-modal="true">
          <form
            className="modal-panel dialog-panel"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmCustomGroup(dialog.value);
            }}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">New group</p>
                <h2>新建自定义分组</h2>
              </div>
              <button type="button" className="icon-action" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="dialog-body">
              <label>
                分组名称
                <input
                  autoFocus
                  value={dialog.value}
                  onChange={(event) =>
                    setDialog((current) => (current?.type === "group" ? { ...current, value: event.target.value } : current))
                  }
                  placeholder="例如：AI 工具"
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={() => setDialog(null)}>取消</button>
              <button type="submit" className="primary-action" disabled={busy}>创建</button>
            </div>
          </form>
        </section>
      );
    }

    if (dialog.type === "delete-item") {
      return (
        <section className="palette-backdrop centered-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel dialog-panel">
            <div className="modal-head">
              <div>
                <p className="eyebrow">Delete resource</p>
                <h2>删除资源</h2>
              </div>
              <button type="button" className="icon-action" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="dialog-body">
              <p className="dialog-warning">这只会从 OrbitStart 资源库中移除条目，不会删除磁盘上的真实文件。</p>
              <div className="dialog-target">
                <Icon name={dialog.item.icon} size={22} />
                <span>
                  <strong>{dialog.item.title}</strong>
                  <small>{dialog.item.target}</small>
                </span>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={() => setDialog(null)}>取消</button>
              <button type="button" className="danger-action dialog-action" onClick={() => void confirmRemoveItem(dialog.item)} disabled={busy}>
                删除
              </button>
            </div>
          </div>
        </section>
      );
    }

    if (dialog.type === "batch-delete") {
      return (
        <section className="palette-backdrop centered-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel dialog-panel">
            <div className="modal-head">
              <div>
                <p className="eyebrow">Batch delete</p>
                <h2>批量删除</h2>
              </div>
              <button type="button" className="icon-action" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="dialog-body">
              <p className="dialog-warning">将从资源库移除当前选中的 {selectedIds.length} 个资源，不会删除本地文件。</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={() => setDialog(null)}>取消</button>
              <button type="button" className="danger-action dialog-action" onClick={() => void confirmBatchDeleteSelected()} disabled={busy}>
                删除
              </button>
            </div>
          </div>
        </section>
      );
    }

    if (dialog.type === "batch-move") {
      return (
        <section className="palette-backdrop centered-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel dialog-panel">
            <div className="modal-head">
              <div>
                <p className="eyebrow">Batch move</p>
                <h2>添加到标签</h2>
              </div>
              <button type="button" className="icon-action" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="dialog-body">
              <p>已选择 {selectedIds.length} 个资源。选择标签后会追加到资源现有标签中。</p>
              <label>
                目标标签
                <select
                  value={dialog.groupId}
                  onChange={(event) =>
                    setDialog((current) => (current?.type === "batch-move" ? { ...current, groupId: event.target.value } : current))
                  }
                >
                  {moveGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={() => setDialog(null)}>取消</button>
              <button
                type="button"
                className="primary-action"
                onClick={() => void confirmBatchMoveSelected(dialog.groupId)}
                disabled={busy || selectedIds.length === 0 || moveGroups.length === 0}
              >
                添加标签
              </button>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="palette-backdrop centered-backdrop" role="dialog" aria-modal="true">
        <form
          className="modal-panel dialog-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmCreateTemplate(dialog.value);
          }}
        >
          <div className="modal-head">
            <div>
              <p className="eyebrow">Plugin template</p>
              <h2>创建引擎模板</h2>
            </div>
            <button type="button" className="icon-action" onClick={() => setDialog(null)}>
              <X size={18} />
            </button>
          </div>
          <div className="dialog-body">
            <label>
              模板名称
              <input
                autoFocus
                value={dialog.value}
                onChange={(event) =>
                  setDialog((current) => (current?.type === "template" ? { ...current, value: event.target.value } : current))
                }
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-action" onClick={() => setDialog(null)}>取消</button>
            <button type="submit" className="primary-action" disabled={busy}>创建</button>
          </div>
        </form>
      </section>
    );
  };

  const renderContextMenu = () => {
    if (!contextMenu) return null;
    const resource = contextMenu.kind === "resource" ? items.find((item) => item.id === contextMenu.resourceId) : null;

    return (
      <section
        ref={contextMenuRef}
        className="context-menu"
        style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {contextMenu.kind === "edit" && (
          <>
            <button type="button" onClick={() => void runEditContextAction("cut")}>剪切</button>
            <button type="button" onClick={() => void runEditContextAction("copy")}>复制</button>
            <button type="button" onClick={() => void runEditContextAction("paste")}>粘贴</button>
            <span className="context-separator" />
            <button type="button" onClick={() => void runEditContextAction("select-all")}>全选</button>
          </>
        )}

        {contextMenu.kind === "resource" && resource && (
          <>
            <button type="button" onClick={() => void runResourceContextAction("launch", resource)}>启动</button>
            <button type="button" disabled>以管理员身份启动</button>
            <span className="context-separator" />
            <button type="button" onClick={() => void runResourceContextAction("reveal", resource)}>打开所在位置</button>
            <button type="button" onClick={() => void runResourceContextAction("copy", resource)}>复制路径 / URL</button>
            <span className="context-separator" />
            <button type="button" onClick={() => void runResourceContextAction("edit", resource)}>编辑资源</button>
            <button type="button" onClick={() => void runResourceContextAction("favorite", resource)}>
              {resource.favorite ? "取消收藏" : "收藏"}
            </button>
            <button type="button" className="context-danger" onClick={() => void runResourceContextAction("delete", resource)}>删除资源</button>
          </>
        )}

        {contextMenu.kind === "blank" && (
          <>
            <button type="button" onClick={() => void runBlankContextAction("add")}>添加资源</button>
            <button type="button" onClick={() => void runBlankContextAction("scan")}>扫描桌面 / 开始菜单</button>
            <button type="button" onClick={() => void runBlankContextAction("bookmarks")}>导入浏览器书签</button>
            <span className="context-separator" />
            <button type="button" onClick={() => void runBlankContextAction("refresh")}>刷新资源索引</button>
            <button type="button" onClick={() => void runBlankContextAction("settings")}>打开设置</button>
          </>
        )}
      </section>
    );
  };

  const renderPluginDetail = () => {
    if (!selectedPlugin) return null;
    const detail = pluginDetail(selectedPlugin);
    return (
      <section className="palette-backdrop" role="dialog" aria-modal="true">
        <div className="modal-panel plugin-detail-panel">
          <div className="modal-head">
            <div>
              <p className="eyebrow">Plugin Detail</p>
              <h2>{selectedPlugin.name}</h2>
            </div>
            <button className="icon-action" onClick={() => setSelectedPlugin(null)}>
              <X size={18} />
            </button>
          </div>
          <div className="plugin-detail-body">
            <div className="detail-kv"><span>作者</span><strong>{detail.author}</strong></div>
            <div className="detail-kv"><span>版本</span><strong className="mono-value">{selectedPlugin.version}</strong></div>
            <div className="detail-kv"><span>状态</span><strong>{selectedPlugin.enabled ? "启用" : "停用"}</strong></div>
            <div>
              <h3>功能</h3>
              <div className="detail-tags">{detail.features.map((feature) => <em key={feature}>{feature}</em>)}</div>
            </div>
            <div>
              <h3>权限</h3>
              <div className="detail-tags">
                {selectedPlugin.permissions.map((permission) => <em key={permission.id} className={`risk-${permission.risk}`}>{permission.label}</em>)}
              </div>
            </div>
            <div className="demo-box">
              <h3>演示</h3>
              <p>{detail.demo}</p>
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderBackupDialog = () => {
    if (!backupOpen) return null;
    return (
      <section className="palette-backdrop" role="dialog" aria-modal="true">
        <div className="modal-panel backup-panel">
          <div className="modal-head">
            <div>
              <p className="eyebrow">Backup</p>
              <h2>JSON 导入导出</h2>
            </div>
            <button className="icon-action" onClick={() => setBackupOpen(false)}>
              <X size={18} />
            </button>
          </div>
          {backupPath && <p className="backup-path">上次导出：{backupPath}</p>}
          <textarea
            value={backupJson}
            onChange={(event) => setBackupJson(event.target.value)}
            placeholder="点击导出生成 JSON，或在这里粘贴要导入的 OrbitStart JSON。"
          />
          <div className="modal-actions">
            <button className="secondary-action" onClick={runExport} disabled={busy}>
              <Download size={18} />
              导出
            </button>
            <button className="primary-action" onClick={runImport} disabled={busy}>
              <Upload size={18} />
              导入
            </button>
          </div>
        </div>
      </section>
    );
  };

  const renderImportPreviewDialog = () => {
    if (!importPreview) return null;

    const { kind, items, selectedIndices, searchQuery } = importPreview;
    
    // 根据搜索框内容过滤出显示的项目列表
    const filteredItemsWithOriginalIndex = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const q = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.target.toLowerCase().includes(q)
        );
      });

    // 检查某项是否为卸载程序
    const checkIsUninstall = (item: OrbitItemInput) => {
      const titleLower = item.title.toLowerCase();
      const subtitleLower = item.subtitle.toLowerCase();
      const targetLower = item.target.toLowerCase();
      return (
        titleLower.includes("uninstall") ||
        titleLower.includes("卸载") ||
        subtitleLower.includes("uninstall") ||
        subtitleLower.includes("卸载") ||
        targetLower.includes("uninstall") ||
        targetLower.includes("卸载")
      );
    };

    // 切换单个勾选状态
    const handleToggleItem = (index: number) => {
      const nextSelected = new Set(selectedIndices);
      if (nextSelected.has(index)) {
        nextSelected.delete(index);
      } else {
        nextSelected.add(index);
      }
      setImportPreview({ ...importPreview, selectedIndices: nextSelected });
    };

    // 全选当前过滤出的项目
    const handleSelectAllFiltered = () => {
      const nextSelected = new Set(selectedIndices);
      filteredItemsWithOriginalIndex.forEach(({ index }) => {
        nextSelected.add(index);
      });
      setImportPreview({ ...importPreview, selectedIndices: nextSelected });
    };

    // 反选当前过滤出的项目（只针对当前显示的过滤列表进行切换）
    const handleInvertFiltered = () => {
      const nextSelected = new Set(selectedIndices);
      filteredItemsWithOriginalIndex.forEach(({ index }) => {
        if (nextSelected.has(index)) {
          nextSelected.delete(index);
        } else {
          nextSelected.add(index);
        }
      });
      setImportPreview({ ...importPreview, selectedIndices: nextSelected });
    };

    // 执行导入
    const handleConfirmImport = async () => {
      const selectedItems = Array.from(selectedIndices).map((idx) => items[idx]);
      if (selectedItems.length === 0) {
        setToast("未选中任何导入项");
        return;
      }
      setBusy(true);
      setToast("正在批量导入项目，请稍候...");
      try {
        const nextItems = await importScannedItems(selectedItems);
        setItems(nextItems);
        await reload();
        setToast(`成功导入 ${selectedItems.length} 个资源`);
        setImportPreview(null);
      } catch (error) {
        setToast(`导入失败：${String(error)}`);
      } finally {
        setBusy(false);
      }
    };

    const label = kind === "shortcuts" ? "本地程序" : "浏览器书签";

    return (
      <section className="palette-backdrop" role="dialog" aria-modal="true">
        <div className="modal-panel import-preview-panel">
          <div className="modal-head">
            <div>
              <p className="eyebrow">Batch Import</p>
              <h2>批量导入过滤：{label}</h2>
            </div>
            <button className="icon-action" onClick={() => setImportPreview(null)}>
              <X size={18} />
            </button>
          </div>

          <div className="import-search-bar">
            <Search size={16} />
            <input
              type="text"
              placeholder="搜索扫描出的项目名称或路径..."
              value={searchQuery}
              onChange={(e) => setImportPreview({ ...importPreview, searchQuery: e.target.value })}
            />
          </div>

          <div className="import-toolbar">
            <span>
              已选中 <strong>{selectedIndices.size}</strong> / {items.length} 项
            </span>
            <div className="toolbar-actions">
              <button type="button" className="toolbar-btn" onClick={handleSelectAllFiltered}>
                全选过滤项
              </button>
              <button type="button" className="toolbar-btn" onClick={handleInvertFiltered}>
                反选过滤项
              </button>
              <button type="button" className="toolbar-btn" onClick={() => setImportPreview({ ...importPreview, selectedIndices: new Set() })}>
                清空选择
              </button>
            </div>
          </div>

          <div className="import-preview-list">
            {filteredItemsWithOriginalIndex.length === 0 ? (
              <div className="empty-preview">没有找到匹配的项目</div>
            ) : (
              filteredItemsWithOriginalIndex.map(({ item, index }) => {
                const isUninstall = checkIsUninstall(item);
                const isChecked = selectedIndices.has(index);
                return (
                  <div
                    key={index}
                    className={`import-preview-item ${isUninstall ? "is-uninstall" : ""} ${isChecked ? "is-checked" : ""}`}
                    onClick={() => handleToggleItem(index)}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                    />
                    <div className="item-icon-wrapper" style={{ color: item.accent }}>
                      <Icon name={item.icon} size={18} />
                    </div>
                    <div className="item-info">
                      <div className="item-title">
                        {item.title}
                        {isUninstall && <span className="uninstall-tag">卸载程序 / 无效项</span>}
                      </div>
                      <div className="item-subtitle" title={item.subtitle}>
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="modal-actions">
            <button className="secondary-action" onClick={() => setImportPreview(null)} disabled={busy}>
              取消
            </button>
            <button className="primary-action" onClick={handleConfirmImport} disabled={busy || selectedIndices.size === 0}>
              确认导入 ({selectedIndices.size})
            </button>
          </div>
        </div>
      </section>
    );
  };

  if (isAuxWindow) {
    const auxTitle = auxPanel === "plugins" ? "插件管理" : auxPanel === "themes" ? "主题工作室" : auxPanel === "about" ? "关于 OrbitStart" : "设置";
    return (
      <>
        <main className={`app-shell aux-shell density-${density}`} style={appShellStyle} onContextMenu={handleAppContextMenu}>
          {isLocalGalaxyTheme && (
            <LocalGalaxyBackdrop
              mainOpacity={0.58}
              nebulaOpacity={0.1}
              starOpacity={0.08}
              topGlowOpacity={0.1}
              orbitOpacity={0.05}
              showOrbitLayer={false}
            />
          )}
          <header className="window-titlebar" onPointerDown={handleTitlebarPointerDown} onDoubleClick={handleTitlebarDoubleClick}>
            <div className="window-brand" data-tauri-drag-region>
              <span className="window-brand-glyph">{renderBrandIcon(12)}</span>
              <span>{auxTitle}</span>
            </div>
            <div className="window-drag-fill" data-tauri-drag-region />
            <div className="window-controls" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" aria-label="Minimize" title="Minimize" onClick={minimizeWindow}>-</button>
              <button type="button" aria-label="Maximize or restore" title="Maximize or restore" onClick={toggleMaximizeWindow}>□</button>
              <button type="button" aria-label="Close" title="Close" className="close-window" onClick={closeWindow}>×</button>
            </div>
          </header>
          <section className="aux-workspace">
            {auxPanel === "about" ? renderAbout() : renderSettings()}
          </section>
          {dialog && renderAppDialog()}
          {selectedPlugin && renderPluginDetail()}
          {backupOpen && renderBackupDialog()}
          {importPreview && renderImportPreviewDialog()}
        </main>
        {contextMenu && renderContextMenu()}
      </>
    );
  }

  return (
    <>
      {showOnboarding && (
        <OnboardingWizard
          onTemplateSelected={(tags) => {
            // Convert ScenarioTag[] to OrbitItem[] and add to items state
            const newItems: OrbitItem[] = tags.map((t) => ({
              id: t.id,
              title: t.title,
              subtitle: t.kind === "app" ? "本地程序" : t.kind === "website" ? "网址" : t.kind === "folder" ? "文件夹" : t.kind === "script" ? "脚本" : "动作链",
              kind: t.kind,
              group: "all",
              target: t.target,
              aliases: [],
              tags: [t.kind === "action_chain" ? "automation" : "template"],
              icon: t.icon,
              accent: t.accent,
              favorite: t.favorite ?? false,
              launchCount: 0
            }));
            setItems((prev) => [...prev, ...newItems]);
            setToast(`已创建 ${newItems.length} 个示例资源`);
          }}
          onScanShortcuts={async () => {
            setBusy(true);
            setToast("正在扫描桌面和开始菜单...");
            try {
              await runNativeItemScan("shortcuts");
            } catch (e) {
              setToast(`扫描失败：${String(e)}`);
            } finally {
              setBusy(false);
            }
          }}
          onScanBookmarks={async () => {
            setBusy(true);
            setToast("正在扫描浏览器书签...");
            try {
              await runNativeItemScan("bookmarks");
            } catch (e) {
              setToast(`扫描失败：${String(e)}`);
            } finally {
              setBusy(false);
            }
          }}
          onComplete={() => {
            setShowOnboarding(false);
            setToast("欢迎使用 OrbitStart！按 Ctrl+K 随时唤起命令面板");
          }}
        />
      )}
      <main className={`app-shell density-${density} view-${activeView}`} style={appShellStyle} onContextMenu={handleAppContextMenu}>
      {isLocalGalaxyTheme && (
        <LocalGalaxyBackdrop
          mainOpacity={0.76}
          nebulaOpacity={activeView === "logs" ? 0.12 : 0.16}
          starOpacity={activeView === "settings" ? 0.18 : 0.12}
          topGlowOpacity={activeView === "dashboard" ? 0.16 : 0.12}
          orbitOpacity={activeView === "settings" ? 0.1 : 0.08}
          showOrbitLayer={activeView !== "logs"}
        />
      )}
      <header className="window-titlebar" onPointerDown={handleTitlebarPointerDown} onDoubleClick={handleTitlebarDoubleClick}>
        <div className="window-brand" data-tauri-drag-region>
          <span className="window-brand-glyph">{renderBrandIcon(12)}</span>
          <span>OrbitStart</span>
        </div>
        <div className="window-drag-fill" data-tauri-drag-region />
        <div className="window-controls" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" aria-label="Minimize" title="Minimize" onClick={minimizeWindow}>-</button>
          <button type="button" aria-label="Maximize or restore" title="Maximize or restore" onClick={toggleMaximizeWindow}>□</button>
          <button type="button" aria-label="Close" title="Close" className="close-window" onClick={closeWindow}>×</button>
        </div>
      </header>
      <aside className="sidebar">
        <div className="brand-mark">
          <div className="brand-orbit">
            {renderBrandIcon(24)}
          </div>
          <div>
            <strong>OrbitStart</strong>
            <span>Desktop</span>
          </div>
        </div>

        <nav className="rail" aria-label="主导航">
          {navItems.map((item) => (
            <button type="button" key={item.id} className={`rail-button ${activeView === item.id && item.id !== "settings" ? "active" : ""}`} title={item.title} onClick={() => (item.id === "settings" ? void openPanelWindow("settings") : setActiveView(item.id))}>
              {item.icon}
            </button>
          ))}
          <button type="button" className="rail-button" title="命令面板" onClick={() => setPaletteOpen(true)}>
            <Command size={21} />
          </button>
        </nav>

        <section className="mini-panel">
          <span>资源</span>
          <strong>{items.length}</strong>
        </section>

        <button type="button" className="mini-panel mini-panel-button" onClick={() => void openPanelWindow("plugins")}>
          <span>插件</span>
          <strong>
            {enabledPlugins}/{plugins.length}
          </strong>
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{themeLabel} · {settings?.globalHotkey ?? "Ctrl+Alt+Space"}</p>
            <h1>{activeViewMeta[activeView].title}</h1>
            <span className="title-subtitle">{activeViewMeta[activeView].subtitle}</span>
          </div>
          <div className="top-actions">
            <button type="button" className="icon-action" title="切换密度" onClick={() => changeDensity(density === "comfortable" ? "compact" : "comfortable")}>
              <Grid3X3 size={19} />
            </button>
            <button type="button" className="icon-action" title="扫描本地程序" onClick={() => runNativeItemScan("shortcuts")} disabled={busy || !pluginEnabled("core-shortcuts")}>
              <ScanSearch size={19} />
            </button>
            <button type="button" className="icon-action" title="数据备份" onClick={() => setBackupOpen(true)}>
              <Database size={19} />
            </button>
            <button type="button" className="icon-action" title="命令面板" onClick={() => setPaletteOpen(true)}>
              <Search size={19} />
            </button>
          </div>
        </header>

        <section className="hero-strip">
          <div className="search-shell">
            <Search size={19} />
            <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索应用、文件、网址、脚本、插件或标签..." />
            <kbd>Ctrl K</kbd>
          </div>
          <button type="button" className="primary-action" onClick={() => setEditor({ mode: "create", input: makeEmptyInput() })} disabled={busy}>
            <PlusCircle size={18} />
            添加资源
          </button>
        </section>

        {activeView === "dashboard" && renderDashboard()}
        {activeView === "trips" && renderTripsPage()}
        {activeView === "settings" && renderSettings()}
        {activeView === "logs" && renderLogs()}
      </section>

      {dragActive && (
        <section className="drop-overlay" aria-live="polite">
          <div>
            <Download size={28} />
            <strong>释放以添加资源</strong>
            <span>支持桌面快捷方式、文件、文件夹和脚本</span>
          </div>
        </section>
      )}

      {dialog && renderAppDialog()}

      {tripPanelItem && (
        <TripPanel
          item={tripPanelItem}
          highlightTripId={tripPanelHighlightId}
          onClose={() => {
            setTripPanelItem(null);
            setTripPanelHighlightId(null);
          }}
          onChanged={handleTripsChanged}
        />
      )}

      {paletteOpen && (
        <section
          className="palette-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setPaletteOpen(false); }}
        >
          <div className="command-palette">
            <div className="palette-input">
              <Search size={20} />
              <input
                ref={paletteInputRef}
                value={paletteQuery}
                onChange={(event) => setPaletteQuery(event.target.value)}
                onKeyDown={handlePaletteKeyDown}
                placeholder="搜索应用、文件、网址、脚本、插件或拼音首字母..."
                autoFocus
              />
              {paletteQuery ? (
                <button type="button" title="清空" onClick={() => setPaletteQuery("")} className="palette-clear-btn">
                  <X size={16} />
                </button>
              ) : (
                <button type="button" title="关闭" onClick={() => setPaletteOpen(false)}>
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="palette-results">
              {paletteCommands.length === 0 && (
                <div className="palette-empty">
                  <Search size={24} />
                  <span>未找到匹配结果</span>
                  <small>试试拼音首字母或更短的关键词</small>
                </div>
              )}
              {paletteCommands.map((result, idx) => (
                <button
                  type="button"
                  key={result.id}
                  className={idx === paletteSelectedIndex ? "result-selected" : ""}
                  onClick={async () => {
                    await result.run();
                    setPaletteOpen(false);
                  }}
                  onMouseEnter={() => setPaletteSelectedIndex(idx)}
                >
                  <span className="result-icon">
                    <Icon name={result.icon} size={22} />
                  </span>
                  <span>
                    <strong>{result.title}</strong>
                    <small>{result.subtitle}</small>
                  </span>
                  <em>{result.actionLabel}</em>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {editor && (
        <section className="palette-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel editor-panel">
            <div className="modal-head">
              <div>
                <p className="eyebrow">{editor.mode === "create" ? "New resource" : "Edit resource"}</p>
                <h2>{editor.mode === "create" ? "添加资源" : "编辑资源"}</h2>
              </div>
              <button className="icon-action" onClick={() => setEditor(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="form-grid">
              <label>
                类型
                <select
                  value={editor.input.kind}
                  onChange={(event) => setEditor({ ...editor, input: inputWithKind(editor.input, event.target.value as ItemKind) })}
                >
                  {visibleKindOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                标题
                <input
                  value={editor.input.title}
                  onChange={(event) => setEditor({ ...editor, input: { ...editor.input, title: event.target.value } })}
                  placeholder="例如 VS Code"
                />
              </label>
              <label className="wide-field">
                {editor.input.kind === "action_chain" ? "动作链目标" : "目标路径或网址"}
                {editor.input.kind === "action_chain" ? (
                  <textarea
                    value={editor.input.target}
                    onChange={(event) => setEditor({ ...editor, input: { ...editor.input, target: event.target.value } })}
                    placeholder={"每行一个目标，例如：\nC:\\Windows\\System32\\notepad.exe\nhttps://github.com\nE:\\OrbitStart"}
                  />
                ) : (
                  <>
                    <input
                      value={editor.input.target}
                      onChange={(event) => setEditor({ ...editor, input: { ...editor.input, target: event.target.value } })}
                      placeholder="C:\\Program Files\\... 或 https://..."
                    />
                    <div className="field-actions">
                      <button type="button" className="secondary-action" onClick={() => void chooseResourceTarget("file")} disabled={busy}>
                        <FolderOpen size={16} />
                        选择文件/应用/脚本
                      </button>
                      <button type="button" className="secondary-action" onClick={() => void chooseResourceTarget("folder")} disabled={busy}>
                        <FolderKanban size={16} />
                        选择文件夹
                      </button>
                    </div>
                  </>
                )}
              </label>
              <label className="wide-field">
                副标题
                <input
                  value={editor.input.subtitle}
                  onChange={(event) => setEditor({ ...editor, input: { ...editor.input, subtitle: event.target.value } })}
                  placeholder="显示在标题下方"
                />
              </label>
              <label className="wide-field">
                所属分组 / 标签 (支持多选)
                <div className="group-checkbox-grid">
                  {visibleGroups.filter((group) => group.id !== "all").map((group) => {
                    const selectedGroups = splitGroupIds(editor.input.group);
                    const isChecked = selectedGroups.includes(group.id);
                    return (
                      <button
                        key={group.id}
                        type="button"
                        className={`group-tag-checkbox ${isChecked ? "checked" : ""}`}
                        onClick={() => {
                          const next = isChecked
                            ? selectedGroups.filter((g) => g !== group.id)
                            : [...selectedGroups, group.id];
                          setEditor({
                            ...editor,
                            input: { ...editor.input, group: joinGroupIds(next) }
                          });
                        }}
                      >
                        <Icon name={group.icon} size={14} />
                        <span>{group.title}</span>
                      </button>
                    );
                  })}
                </div>
              </label>
              <label>
                颜色
                <input
                  type="color"
                  value={editor.input.accent}
                  onChange={(event) => setEditor({ ...editor, input: { ...editor.input, accent: event.target.value } })}
                />
              </label>
              <label className="wide-field">
                自定义图标
                <div className="icon-picker-row">
                  <span
                    className="resource-icon"
                    style={{
                      "--accent": editor.input.accent,
                      "--asset-icon-base": isLocalGalaxyTheme ? `url("${iconBaseFor(editor.input as OrbitItem)}")` : "none"
                    } as CSSProperties}
                  >
                    <Icon name={editor.input.icon} size={26} />
                  </span>
                  <button type="button" className="secondary-action" onClick={() => void chooseCustomIcon()} disabled={busy}>
                    <Image size={16} />
                    选择图片
                  </button>
                  <button type="button" className="secondary-action" onClick={resetEditorIcon} disabled={busy}>
                    恢复默认
                  </button>
                </div>
              </label>
              <label className="wide-field">
                别名
                <input
                  value={listToText(editor.input.aliases)}
                  onChange={(event) => setEditor({ ...editor, input: { ...editor.input, aliases: normalizeList(event.target.value) } })}
                  placeholder="用逗号分隔，例如 code, ide, 编辑器"
                />
              </label>
              <label className="wide-field">
                标签
                <input
                  value={listToText(editor.input.tags)}
                  onChange={(event) => setEditor({ ...editor, input: { ...editor.input, tags: normalizeList(event.target.value) } })}
                  placeholder="用逗号分隔，例如 dev, daily"
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={editor.input.favorite}
                  onChange={(event) => setEditor({ ...editor, input: { ...editor.input, favorite: event.target.checked } })}
                />
                加入收藏
              </label>
            </div>

            <div className="modal-actions">
              <button className="secondary-action" onClick={() => setEditor(null)}>
                取消
              </button>
              <button className="primary-action" onClick={saveEditor} disabled={busy}>
                <Save size={18} />
                保存
              </button>
            </div>
          </div>
        </section>
      )}

      {selectedPlugin && (
        <section className="palette-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel plugin-detail-panel">
            <div className="modal-head">
              <div>
                <p className="eyebrow">Plugin Detail</p>
                <h2>{selectedPlugin.name}</h2>
              </div>
              <button className="icon-action" onClick={() => setSelectedPlugin(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="plugin-detail-body">
              {(() => {
                const detail = pluginDetail(selectedPlugin);
                return (
                  <>
                    <div className="detail-kv">
                      <span>作者</span>
                      <strong>{detail.author}</strong>
                    </div>
                    <div className="detail-kv">
                      <span>版本</span>
                      <strong className="mono-value">{selectedPlugin.version}</strong>
                    </div>
                    <div className="detail-kv">
                      <span>状态</span>
                      <strong>{selectedPlugin.enabled ? "启用" : "停用"}</strong>
                    </div>
                    <div>
                      <h3>功能</h3>
                      <div className="detail-tags">
                        {detail.features.map((feature) => (
                          <em key={feature}>{feature}</em>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3>权限</h3>
                      <div className="detail-tags">
                        {selectedPlugin.permissions.map((permission) => (
                          <em key={permission.id} className={`risk-${permission.risk}`}>{permission.label}</em>
                        ))}
                      </div>
                    </div>
                    <div className="demo-box">
                      <h3>演示</h3>
                      <p>{detail.demo}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </section>
      )}

      {backupOpen && (
        <section className="palette-backdrop" role="dialog" aria-modal="true">
          <div className="modal-panel backup-panel">
            <div className="modal-head">
              <div>
                <p className="eyebrow">Backup</p>
                <h2>JSON 导入导出</h2>
              </div>
              <button className="icon-action" onClick={() => setBackupOpen(false)}>
                <X size={18} />
              </button>
            </div>
            {backupPath && <p className="backup-path">上次导出：{backupPath}</p>}
            <textarea
              value={backupJson}
              onChange={(event) => setBackupJson(event.target.value)}
              placeholder="点击导出生成 JSON，或在这里粘贴要导入的 OrbitStart JSON。"
            />
            <div className="modal-actions">
              <button className="secondary-action" onClick={runExport} disabled={busy}>
                <Download size={18} />
                导出
              </button>
              <button className="primary-action" onClick={runImport} disabled={busy}>
                <Upload size={18} />
                导入
              </button>
            </div>
          </div>
        </section>
      )}

      {localAuxPanel && (
        <section className="palette-backdrop centered-backdrop" role="dialog" aria-modal="true" style={{ zIndex: 100 }}>
          <div className="modal-panel settings-modal-panel">
            <div className="modal-head">
              <div>
                <p className="eyebrow">{localAuxPanel === "plugins" ? "Plugins" : localAuxPanel === "themes" ? "Themes" : localAuxPanel === "about" ? "About" : "Settings"}</p>
                <h2>{localAuxPanel === "plugins" ? "插件管理" : localAuxPanel === "themes" ? "主题工作室" : localAuxPanel === "about" ? "关于 OrbitStart" : "轨道控制"}</h2>
              </div>
              <button type="button" className="icon-action" onClick={() => setLocalAuxPanel(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="aux-workspace" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {localAuxPanel === "about" ? renderAbout() : renderSettings()}
            </div>
          </div>
        </section>
      )}
      {importPreview && renderImportPreviewDialog()}
      </main>
      {contextMenu && renderContextMenu()}
    </>
  );
}
