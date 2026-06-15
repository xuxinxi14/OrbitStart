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
  setActiveTheme,
  setCloseBehavior,
  setDensity,
  setPluginEnabled,
  setSafeMode,
  updateItem,
  launchItem
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
  ThemeManifest
} from "./types";

type ViewId = "dashboard" | "settings" | "logs";
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
  return requestedView === "settings" || requestedView === "logs" ? requestedView : "dashboard";
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

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function matchesItem(item: OrbitItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [item.title, item.subtitle, item.kind, item.group, item.target, ...item.aliases, ...item.tags]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function matchesCommand(command: OrbitCommand, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [command.title, command.subtitle, command.pluginId, ...command.keywords].join(" ").toLowerCase().includes(normalized);
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
  const pluginHost = useMemo(() => createOrbitPluginHost(plugins), [plugins]);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLElement>(null);
  const contextEditTargetRef = useRef<HTMLElement | null>(null);
  const lastPointerRef = useRef({ x: 24, y: 24 });
  const dropInProgressRef = useRef(false);

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

  useEffect(() => {
    reload().catch((error) => setToast(`加载失败：${String(error)}`));
  }, []);

  useEffect(() => {
    const onToast = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      setToast(message);
    };
    window.addEventListener("orbit-toast", onToast);
    return () => window.removeEventListener("orbit-toast", onToast);
  }, []);

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
    let cancelled = false;
    pluginHost.search.query(paletteQuery).then((results) => {
      if (!cancelled) setPluginResults(results);
    });
    return () => {
      cancelled = true;
    };
  }, [paletteQuery, pluginHost]);

  const activeTheme = useMemo(() => {
    return themes.find((theme) => theme.id === settings?.activeThemeId) ?? themes[0];
  }, [settings?.activeThemeId, themes]);

  useEffect(() => {
    if (!activeTheme) return;
    const root = document.documentElement;
    root.dataset.theme = activeTheme.id;
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
    return items
      .filter(itemKindAllowed)
      .filter((item) => activeGroup === "all" || item.group === activeGroup)
      .filter((item) => matchesItem(item, query));
  }, [activeGroup, items, plugins, query]);

  const favoriteItems = filteredItems.filter((item) => item.favorite);
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
    if (isLocalGalaxyTheme) {
      return <img src={localGalaxyAssets.icons.logo.src} alt="" />;
    }
    return <Sparkles size={size} strokeWidth={1.8} />;
  }

  function inputWithKind(input: OrbitItemInput, kind: ItemKind): OrbitItemInput {
    const option = baseKindOptions.find((candidate) => candidate.value === kind) ?? baseKindOptions[0];
    return {
      ...input,
      kind,
      group: option.group,
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
    if (!editor.input.title.trim() || !editor.input.target.trim()) {
      setToast("标题和目标路径/网址不能为空");
      return;
    }

    setBusy(true);
    try {
      if (editor.mode === "create") {
        await createItem(editor.input);
        setToast(`已添加：${editor.input.title}`);
      } else {
        await updateItem({
          ...editor.item,
          ...editor.input
        });
        setToast(`已更新：${editor.input.title}`);
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
      group: picked.group,
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
        await updateItem({ ...item, group: groupId });
      }
      setBatchGroup(groupId);
      exitBatchMode();
      setDialog(null);
      await reload();
      const group = groups.find((candidate) => candidate.id === groupId);
      setToast(`已移动到：${group?.title ?? groupId}`);
    } catch (error) {
      setToast(`批量移动失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runNativeItemScan(kind: "shortcuts" | "bookmarks") {
    setBusy(true);
    try {
      const nextItems = kind === "shortcuts" ? await scanShortcuts() : await scanBrowserBookmarks();
      setItems(nextItems);
      await reload();
      const label = kind === "shortcuts" ? "快捷方式" : "浏览器书签";
      setToast(`${label}扫描完成：当前 ${nextItems.length} 个资源`);
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
    if (isTauriRuntime()) {
      try {
        await openAuxWindow(panel);
        return;
      } catch (error) {
        setToast(`打开窗口失败：${String(error)}`);
      }
    }
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
    const builtInResults: SearchResult[] = commands.filter((command) => matchesCommand(command, paletteQuery)).map((command) => ({
      id: command.id,
      title: command.title,
      subtitle: command.subtitle,
      icon: command.icon,
      source: command.pluginId,
      actionLabel: "执行命令",
      run: () => handleCommand(command)
    }));

    const itemResults: SearchResult[] = items.filter(itemKindAllowed).filter((item) => matchesItem(item, paletteQuery)).map((item) => ({
      id: `item:${item.id}`,
      title: item.title,
      subtitle: item.subtitle,
      icon: item.icon,
      source: item.kind,
      actionLabel: "打开",
      run: () => openItem(item)
    }));

    const pluginCommandResults = pluginHost.commands.list().filter((command) => matchesCommand(command, paletteQuery)).map((command) => ({
      id: command.id,
      title: command.title,
      subtitle: command.subtitle,
      icon: command.icon,
      source: command.pluginId,
      actionLabel: "执行插件命令",
      run: command.run
    }));

    return [...itemResults, ...builtInResults, ...pluginCommandResults, ...pluginResults].slice(0, 16);
  }, [commands, items, paletteQuery, pluginHost, pluginResults, plugins]);

  const navItems: Array<{ id: ViewId; title: string; icon: JSX.Element }> = [
    { id: "dashboard", title: "工作台", icon: <LayoutDashboard size={21} /> },
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
              <button type="button" onClick={batchMoveSelected} disabled={busy || selectedIds.length === 0}>移动</button>
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
                  </span>
                  <span className="resource-meta-column">
                    <em>{item.launchCount} 次启动</em>
                    <small>{lastLaunchedText(item)}</small>
                  </span>
                </button>
                {!batchMode && (
                  <div className="tile-actions">
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

  const renderThemes = () => (
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
        <div className="theme-grid">
          {themes.map((theme) => (
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
          ))}
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
            <input value={settings?.globalHotkey ?? "Ctrl+Alt+Space"} readOnly />
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
          <span><strong>0.4.0</strong>版本</span>
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
                <h2>移动到分组</h2>
              </div>
              <button type="button" className="icon-action" onClick={() => setDialog(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="dialog-body">
              <p>已选择 {selectedIds.length} 个资源。选择目标分组后再移动。</p>
              <label>
                移动目的地
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
                移动
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
        </main>
        {contextMenu && renderContextMenu()}
      </>
    );
  }

  return (
    <>
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

      {paletteOpen && (
        <section className="palette-backdrop" role="dialog" aria-modal="true">
          <div className="command-palette">
            <div className="palette-input">
              <Search size={20} />
              <input
                ref={paletteInputRef}
                value={paletteQuery}
                onChange={(event) => setPaletteQuery(event.target.value)}
                placeholder="输入命令、资源名称、引擎功能..."
              />
              <button type="button" title="关闭" onClick={() => setPaletteOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="palette-results">
              {paletteCommands.map((result) => (
                <button
                  type="button"
                  key={result.id}
                  onClick={async () => {
                    await result.run();
                    setPaletteOpen(false);
                  }}
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
              <label>
                分组
                <select value={editor.input.group} onChange={(event) => setEditor({ ...editor, input: { ...editor.input, group: event.target.value } })}>
                  {visibleGroups.filter((group) => group.id !== "all").map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.title}
                    </option>
                  ))}
                </select>
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
      </main>
      {contextMenu && renderContextMenu()}
    </>
  );
}
