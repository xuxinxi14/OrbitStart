import React, { useState, useEffect } from "react";
import { 
  Briefcase, Plus, Trash2, Settings, Play, Save, X, Search,
  ArrowUp, ArrowDown, Edit3, Circle, CheckCircle2, 
  AlertCircle, RefreshCw, Check, AppWindow, Globe, FolderOpen, FileText, HelpCircle,
  TerminalSquare, Workflow
} from "lucide-react";
import type { OrbitItem } from "../../types";
import { invoke } from "@tauri-apps/api/core";

interface Workspace {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLaunchedAt?: string;
  launchCount: number;
  hotkey?: string;
  preventDuplicate?: boolean;
}

interface WorkspaceStep {
  id: string;
  workspaceId: string;
  order: number;
  type: "item" | "app" | "website" | "folder" | "file" | "script" | "wait";
  itemId?: string; // If selecting from OrbitStart items
  title: string;
  target: string;
  arguments?: string;
  workingDirectory?: string;
  failurePolicy?: "continue" | "stop";
  enabled: boolean;
  delayMs?: number;
  waitCondition?: {
    type: "time" | "process" | "port" | "path" | "url";
    value: string;
    timeoutMs?: number;
  };
  scriptConfig?: {
    type: "bat" | "ps1";
    content: string;
    useFile?: boolean;
    filePath?: string;
  };
  dependsOn?: string[];
  windowLayout?: WorkspaceWindowLayout;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceWindowLayout {
  processName: string;
  windowTitle?: string;
  executablePath?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized?: boolean;
  capturedAt: string;
  alwaysOnTop?: boolean;
}

interface WorkspacesProps {
  pluginHost: any;
  items: OrbitItem[];
}

const STORAGE_KEY_WORKSPACES = "orbitstart.plugin.workspaces.storage.workspaces";
const STORAGE_KEY_STEPS = "orbitstart.plugin.workspaces.storage.steps";

// Color presets for workspaces
const COLOR_PRESETS = [
  "#E0533C", // Orange-Red
  "#5cc8ff", // Light Blue
  "#8bd450", // Green
  "#f6b95b", // Warm Orange
  "#bf5cff", // Purple
  "#ff7a90", // Rose
  "#37d6bf", // Teal
  "#a0aec0"  // Gray
];

// Icon presets for workspaces
const ICON_PRESETS = [
  "Briefcase",
  "AppWindow",
  "Globe",
  "FolderOpen",
  "FileText",
  "Settings"
];

function sanitizeCommandId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
}

export function Workspaces({ pluginHost, items }: WorkspacesProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [steps, setSteps] = useState<WorkspaceStep[]>([]);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [editingSteps, setEditingSteps] = useState<WorkspaceStep[]>([]);
  const [isNew, setIsNew] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [selectorStepId, setSelectorStepId] = useState<string | null>(null);
  const [selectorSearch, setSelectorSearch] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [launchLogs, setLaunchLogs] = useState<any[]>([]);
  const [themedAlert, setThemedAlert] = useState<{ title: string; message: string; type: "success" | "error" | "info" } | null>(null);
  const [scanLayoutModalOpen, setScanLayoutModalOpen] = useState(false);
  const [scannedWindows, setScannedWindows] = useState<WorkspaceWindowLayout[]>([]);
  const [selectedWindowIndices, setSelectedWindowIndices] = useState<number[]>([]);
  const [windowBindings, setWindowBindings] = useState<{ [index: number]: string }>({});
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);

  const loadLogs = () => {
    try {
      const raw = localStorage.getItem("orbitstart.plugin.workspaces.storage.logs");
      if (raw) {
        setLaunchLogs(JSON.parse(raw));
      } else {
        setLaunchLogs([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (showLogsModal) {
      loadLogs();
    }
  }, [showLogsModal]);

  // Load from LocalStorage
  useEffect(() => {
    const rawWs = localStorage.getItem(STORAGE_KEY_WORKSPACES);
    const rawSteps = localStorage.getItem(STORAGE_KEY_STEPS);
    if (rawWs) {
      try {
        setWorkspaces(JSON.parse(rawWs));
      } catch (e) {
        console.error("Failed to parse workspaces", e);
      }
    }
    if (rawSteps) {
      try {
        setSteps(JSON.parse(rawSteps));
      } catch (e) {
        console.error("Failed to parse steps", e);
      }
    }
  }, []);

  // Handle cross-component editing signal
  useEffect(() => {
    const editId = localStorage.getItem("orbitstart.workspaces.editing_id");
    if (editId && workspaces.length > 0) {
      localStorage.removeItem("orbitstart.workspaces.editing_id");
      const found = workspaces.find((w) => w.id === editId);
      if (found) {
        setEditingWorkspace(found);
        const wsSteps = steps
          .filter((s) => s.workspaceId === editId)
          .sort((a, b) => a.order - b.order);
        setEditingSteps([...wsSteps]);
        setIsNew(false);
      }
    }
  }, [workspaces, steps]);

  // Listen to background shortcut workspace run commands
  useEffect(() => {
    let unsubscribe: any;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<string>("orbit://run-workspace", (event) => {
        const wsId = event.payload;
        const rawWs = localStorage.getItem(STORAGE_KEY_WORKSPACES);
        if (rawWs) {
          try {
            const list = JSON.parse(rawWs);
            const found = list.find((w: any) => w.id === wsId);
            if (found) {
              handleLaunch(found);
            }
          } catch (e) {
            console.error("Failed to run workspace from shortcut", e);
          }
        }
      }).then((unsub) => {
        unsubscribe = unsub;
      });
    });
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [workspaces]);

  // Save to LocalStorage and reload plugin commands
  const saveAllData = (nextWs: Workspace[], nextSteps: WorkspaceStep[]) => {
    localStorage.setItem(STORAGE_KEY_WORKSPACES, JSON.stringify(nextWs));
    localStorage.setItem(STORAGE_KEY_STEPS, JSON.stringify(nextSteps));
    setWorkspaces(nextWs);
    setSteps(nextSteps);

    // Sync workspaces to the background worker runtime
    if (pluginHost && pluginHost.commands && typeof pluginHost.commands.run === "function") {
      pluginHost.commands.run("workspaces.reload").catch((err: any) => {
        console.error("Failed to reload workspaces in plugin", err);
      });
    }
  };

  const handleCreateWorkspace = () => {
    const newWs: Workspace = {
      id: "ws_" + Math.random().toString(36).substr(2, 9),
      name: "新工作区",
      description: "一键启动开发或办公环境",
      icon: "Briefcase",
      color: COLOR_PRESETS[0],
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      launchCount: 0,
      preventDuplicate: true
    };
    setEditingWorkspace(newWs);
    setEditingSteps([]);
    setIsNew(true);
  };

  const handleEditWorkspace = (ws: Workspace) => {
    setEditingWorkspace({ ...ws });
    const wsSteps = steps
      .filter((s) => s.workspaceId === ws.id)
      .sort((a, b) => a.order - b.order);
    setEditingSteps([...wsSteps]);
    setIsNew(false);
  };

  const handleDeleteWorkspace = (id: string) => {
    setDeleteConfirmId(id);
  };

  const handleHotkeyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const keys: string[] = [];
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.altKey) keys.push("Alt");
    if (e.shiftKey) keys.push("Shift");
    if (e.metaKey) keys.push("Win");

    const ignoreKeys = ["Control", "Alt", "Shift", "Meta", "CapsLock", "Tab"];
    if (!ignoreKeys.includes(e.key)) {
      let keyName = e.key;
      if (keyName === " ") keyName = "Space";
      else if (keyName.length === 1) keyName = keyName.toUpperCase();
      
      keys.push(keyName);
      const hotkeyStr = keys.join("+");
      
      if (editingWorkspace) {
        setEditingWorkspace({ ...editingWorkspace, hotkey: hotkeyStr });
      }
      setIsRecordingHotkey(false);
    }
  };

  const handleSaveEdit = () => {
    if (!editingWorkspace) return;
    if (!editingWorkspace.name.trim()) {
      setThemedAlert({ title: "提示", message: "工作区名称不能为空", type: "error" });
      return;
    }

    let nextWs = [...workspaces];
    if (isNew) {
      nextWs.push(editingWorkspace);
    } else {
      nextWs = nextWs.map((w) => (w.id === editingWorkspace.id ? editingWorkspace : w));
    }

    // Filter out step updates for this workspace, then merge new steps
    const cleanSteps = steps.filter((s) => s.workspaceId !== editingWorkspace.id);
    const updatedSteps = editingSteps.map((s, idx) => ({
      ...s,
      order: idx + 1,
      updatedAt: new Date().toISOString()
    }));

    // Sync shortcut to the system
    invoke("update_workspace_hotkey", { 
      workspaceId: editingWorkspace.id, 
      newHotkey: editingWorkspace.hotkey || null 
    }).catch((err) => {
      console.error("Failed to update workspace hotkey:", err);
    });

    saveAllData(nextWs, [...cleanSteps, ...updatedSteps]);
    setEditingWorkspace(null);
    setEditingSteps([]);
  };

  const handleCaptureWindowLayout = async () => {
    try {
      const activeWindows = await invoke<WorkspaceWindowLayout[]>("workspaces_capture_active_windows");
      if (!activeWindows || activeWindows.length === 0) {
        setThemedAlert({
          title: "提示",
          message: "未检测到任何正在运行的活跃应用窗口，请确认是否有程序处于打开且非最小化状态。",
          type: "info"
        });
        return;
      }

      setScannedWindows(activeWindows);

      const initialBindings: { [index: number]: string } = {};
      const initialSelected: number[] = [];

      activeWindows.forEach((win, index) => {
        const procLower = win.processName.toLowerCase();
        const cleanProc = procLower.replace(/\.exe$/, "");
        const winTitleLower = (win.windowTitle || "").toLowerCase();

        const matchedStep = editingSteps.find((step) => {
          if (step.type === "script" || step.type === "wait") return false;

          const targetLower = (step.target || "").toLowerCase();
          const titleLower = (step.title || "").toLowerCase();

          if (step.type === "folder") {
            const folderBase = step.target.split(/[\\/]/).pop()?.toLowerCase();
            if (folderBase && (winTitleLower === folderBase || winTitleLower.includes(folderBase))) return true;
          }

          if (titleLower && (titleLower.includes(cleanProc) || cleanProc.includes(titleLower))) return true;
          if (targetLower && targetLower.includes(procLower)) return true;

          return false;
        });

        if (matchedStep) {
          initialBindings[index] = matchedStep.id;
          initialSelected.push(index);
        } else {
          initialBindings[index] = "new";
          const isExplorerFolder = procLower === "explorer.exe" && winTitleLower.length > 0;
          if (isExplorerFolder || (!procLower.includes("explorer") && !procLower.includes("host") && !procLower.includes("wmi") && !procLower.includes("ime"))) {
            initialSelected.push(index);
          }
        }
      });

      setWindowBindings(initialBindings);
      setSelectedWindowIndices(initialSelected);
      setScanLayoutModalOpen(true);
    } catch (err) {
      console.error("Failed to capture active windows layout:", err);
      setThemedAlert({
        title: "错误",
        message: "获取活跃窗口失败：" + String(err),
        type: "error"
      });
    }
  };

  const handleImportScannedLayouts = () => {
    let nextSteps = [...editingSteps];
    let newStepsAdded = 0;
    let boundStepsCount = 0;

    selectedWindowIndices.forEach((index) => {
      const win = scannedWindows[index];
      if (!win) return;

      const binding = windowBindings[index] || "new";

      if (binding === "new") {
        const cleanName = win.processName.replace(/\.exe$/i, "");
        const newStep: WorkspaceStep = {
          id: "step_" + Math.random().toString(36).substr(2, 9),
          workspaceId: editingWorkspace?.id || "",
          order: nextSteps.length + 1,
          type: "app",
          title: win.windowTitle || cleanName,
          target: win.executablePath || win.processName,
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          windowLayout: {
            processName: win.processName,
            windowTitle: win.windowTitle,
            executablePath: win.executablePath,
            x: win.x,
            y: win.y,
            width: win.width,
            height: win.height,
            isMaximized: win.isMaximized,
            capturedAt: new Date().toISOString()
          }
        };
        nextSteps.push(newStep);
        newStepsAdded++;
      } else {
        nextSteps = nextSteps.map((step) => {
          if (step.id !== binding) return step;
          return {
            ...step,
            windowLayout: {
              processName: win.processName,
              windowTitle: win.windowTitle,
              executablePath: win.executablePath,
              x: win.x,
              y: win.y,
              width: win.width,
              height: win.height,
              isMaximized: win.isMaximized,
              capturedAt: new Date().toISOString()
            }
          };
        });
        boundStepsCount++;
      }
    });

    setEditingSteps(nextSteps);
    setScanLayoutModalOpen(false);

    setThemedAlert({
      title: "导入成功",
      message: `成功新建了 ${newStepsAdded} 个启动步骤，并关联更新了 ${boundStepsCount} 个步骤的窗口坐标！\n（请保存工作区以使其生效）`,
      type: "success"
    });
  };

  const handleCaptureSingleStepLayout = async (stepId: string) => {
    try {
      const activeWindows = await invoke<WorkspaceWindowLayout[]>("workspaces_capture_active_windows");
      const step = editingSteps.find((s) => s.id === stepId);
      if (!step) return;
      
      const targetLower = (step.target || "").toLowerCase();
      const titleLower = (step.title || "").toLowerCase();
      const itemIdLower = (step.itemId || "").toLowerCase();
      
      const matches = activeWindows.filter((win) => {
        const procLower = win.processName.toLowerCase();
        const winTitleLower = (win.windowTitle || "").toLowerCase();
        
        if (step.type === "folder") {
          const folderBase = step.target.split(/[\\/]/).pop()?.toLowerCase();
          if (folderBase && (winTitleLower === folderBase || winTitleLower.includes(folderBase))) return true;
        }

        if (titleLower && winTitleLower.includes(titleLower)) {
          return true;
        }
        
        if (targetLower && (targetLower.includes(procLower) || procLower.includes(targetLower))) {
          return true;
        }
        
        if (itemIdLower && (itemIdLower.includes(procLower) || procLower.includes(itemIdLower))) {
          return true;
        }
        
        return false;
      });
      
      if (matches.length > 0) {
        const matchedWin = matches[0];
        handleUpdateStep(stepId, {
          windowLayout: {
            ...matchedWin,
            capturedAt: new Date().toISOString()
          }
        });
        setThemedAlert({
          title: "捕获成功",
          message: `已成功捕获并关联窗口：\n${matchedWin.windowTitle || matchedWin.processName}`,
          type: "success"
        });
      } else {
        const winListStr = activeWindows.length > 0 
          ? activeWindows.map(w => `• [${w.processName}] ${w.windowTitle || "无标题"}`).slice(0, 15).join("\n") 
          : "（无）";
        setThemedAlert({
          title: "提示",
          message: `未在屏幕上检测到与「${step.title || step.target}」相关的正在运行的窗口。\n\n当前检测到的活跃窗口有：\n${winListStr}\n(共 ${activeWindows.length} 个)`,
          type: "info"
        });
      }
    } catch (err) {
      setThemedAlert({
        title: "错误",
        message: "捕获窗口失败: " + String(err),
        type: "error"
      });
    }
  };

  const handlePickFile = async (filter = "*.*", title = "选择文件"): Promise<string | null> => {
    try {
      const picked = await invoke<string | null>("workspaces_pick_file", { filter, title });
      return picked;
    } catch (err) {
      console.error("Failed to pick file:", err);
      return null;
    }
  };

  const handlePickFolder = async (): Promise<string | null> => {
    try {
      const picked = await invoke<string | null>("workspaces_pick_folder");
      return picked;
    } catch (err) {
      console.error("Failed to pick folder:", err);
      return null;
    }
  };

  const handleAddStep = () => {
    if (!editingWorkspace) return;
    const newStep: WorkspaceStep = {
      id: "step_" + Math.random().toString(36).substr(2, 9),
      workspaceId: editingWorkspace.id,
      order: editingSteps.length + 1,
      type: "item",
      title: "启动项",
      target: "",
      arguments: "",
      workingDirectory: "",
      failurePolicy: "continue",
      enabled: true,
      delayMs: 0,
      dependsOn: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setEditingSteps([...editingSteps, newStep]);
  };

  const handleUpdateStep = (stepId: string, updates: Partial<WorkspaceStep>) => {
    setEditingSteps(
      editingSteps.map((s) => {
        if (s.id !== stepId) return s;
        const merged = { ...s, ...updates };
        if (updates.itemId) {
          const item = items.find((i) => i.id === updates.itemId);
          if (item) {
            merged.title = item.title;
            merged.target = item.target;
            merged.type = item.kind as any;
            merged.arguments = item.arguments || "";
          }
        }
        return merged;
      })
    );
  };

  const handleDeleteStep = (stepId: string) => {
    setEditingSteps(editingSteps.filter((s) => s.id !== stepId));
  };

  const handleMoveStep = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= editingSteps.length) return;

    const list = [...editingSteps];
    const temp = list[index];
    list[index] = list[nextIndex];
    list[nextIndex] = temp;

    setEditingSteps(list);
  };

  const handleLaunch = async (workspace: Workspace) => {
    setLaunchingId(workspace.id);
    try {
      const commandId = `workspaces.run-workspace-${sanitizeCommandId(workspace.id)}`;
      if (pluginHost && pluginHost.commands && typeof pluginHost.commands.run === "function") {
        await pluginHost.commands.run(commandId);
        // Refresh local view count and launched stats
        setTimeout(() => {
          const rawWs = localStorage.getItem(STORAGE_KEY_WORKSPACES);
          if (rawWs) {
            try {
              setWorkspaces(JSON.parse(rawWs));
            } catch (e) {}
          }
        }, 1500);
      } else {
        setThemedAlert({
          title: "错误",
          message: "插件系统不可用，无法启动工作区",
          type: "error"
        });
      }
    } catch (e) {
      console.error("Workspace launch failed", e);
      setThemedAlert({
        title: "启动失败",
        message: `启动失败，错误信息：${String(e)}`,
        type: "error"
      });
    } finally {
      setLaunchingId(null);
    }
  };

  // Helper to render type icon
  const getStepIcon = (type: string) => {
    switch (type) {
      case "app": return <AppWindow size={16} className="text-sky-400" />;
      case "website": return <Globe size={16} className="text-teal-400" />;
      case "folder": return <FolderOpen size={16} className="text-green-400" />;
      case "script": return <TerminalSquare size={16} className="text-violet-400" />;
      case "wait": return <Workflow size={16} className="text-gold" />;
      default: return <FileText size={16} className="text-orange-400" />;
    }
  };

  // Helper to render preset workspace icon
  const getWorkspaceIcon = (name: string, color?: string, size = 20) => {
    const style = color ? { color } : undefined;
    switch (name) {
      case "AppWindow": return <AppWindow size={size} style={style} />;
      case "Globe": return <Globe size={size} style={style} />;
      case "FolderOpen": return <FolderOpen size={size} style={style} />;
      case "FileText": return <FileText size={size} style={style} />;
      case "Settings": return <Settings size={size} style={style} />;
      default: return <Briefcase size={size} style={style} />;
    }
  };

  return (
    <div className="tab-pane-content workspace-panel">
      {editingWorkspace ? (
        // EDIT MODE UI
        <div className="workspace-editor glass-panel">
          <div className="panel-header">
            <h2>{isNew ? "新建工作区" : "编辑工作区"}</h2>
            <button className="icon-button" onClick={() => setEditingWorkspace(null)}>
              <X size={20} />
            </button>
          </div>

          <div className="editor-body">
            <div className="meta-section">
              <div className="input-group">
                <label>工作区名称</label>
                <input 
                  type="text" 
                  value={editingWorkspace.name}
                  onChange={(e) => setEditingWorkspace({ ...editingWorkspace, name: e.target.value })}
                  placeholder="例如：开发环境、早间办公"
                />
              </div>

              <div className="input-group">
                <label>描述</label>
                <input 
                  type="text" 
                  value={editingWorkspace.description || ""}
                  onChange={(e) => setEditingWorkspace({ ...editingWorkspace, description: e.target.value })}
                  placeholder="描述此工作区一键启动的场景"
                />
              </div>

              <div className="input-group">
                <label>全局快捷键</label>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <input 
                    type="text" 
                    value={isRecordingHotkey ? "请在键盘上按下快捷键..." : (editingWorkspace.hotkey || "未绑定")}
                    readOnly
                    onKeyDown={isRecordingHotkey ? handleHotkeyKeyDown : undefined}
                    placeholder="点击右侧按钮绑定快捷键"
                    style={{ 
                      flexGrow: 1, 
                      color: isRecordingHotkey ? "var(--gold)" : (editingWorkspace.hotkey ? "var(--text)" : "var(--text-muted)"),
                      fontWeight: isRecordingHotkey ? "bold" : "normal",
                      caretColor: "transparent",
                      cursor: "default"
                    }}
                  />
                  {isRecordingHotkey ? (
                    <button 
                      type="button" 
                      className="secondary-action compact-action" 
                      onClick={() => setIsRecordingHotkey(false)}
                    >
                      取消录制
                    </button>
                  ) : (
                    <>
                      <button 
                        type="button" 
                        className="secondary-action compact-action" 
                        onClick={() => setIsRecordingHotkey(true)}
                      >
                        录制快捷键
                      </button>
                      {editingWorkspace.hotkey && (
                        <button 
                          type="button" 
                          className="secondary-action compact-action danger-action" 
                          onClick={() => setEditingWorkspace({ ...editingWorkspace, hotkey: undefined })}
                        >
                          清除
                        </button>
                      )}
                    </>
                  )}
                </div>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px" }}>
                  绑定后，您可以在后台或任意界面通过该快捷键一键启动此工作区。（例如：Ctrl+Alt+F1）
                </span>
              </div>

              <div className="input-group" style={{ flexDirection: "row", alignItems: "center", gap: "10px", margin: "var(--space-2) 0" }}>
                <input 
                  type="checkbox" 
                  id="prevent-duplicate-toggle"
                  checked={editingWorkspace.preventDuplicate !== false}
                  onChange={(e) => setEditingWorkspace({ ...editingWorkspace, preventDuplicate: e.target.checked })}
                  style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--gold)" }}
                />
                <label htmlFor="prevent-duplicate-toggle" style={{ margin: 0, cursor: "pointer", fontSize: "0.85rem", color: "var(--text)" }}>
                  防重复启动 (若已运行则仅移动位置，不重复打开新实例)
                </label>
              </div>

              <div className="presets-row">
                <div className="preset-group">
                  <label>主题色</label>
                  <div className="preset-colors">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        className={`preset-color ${editingWorkspace.color === color ? "active" : ""}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setEditingWorkspace({ ...editingWorkspace, color })}
                      />
                    ))}
                  </div>
                </div>

                <div className="preset-group">
                  <label>图标</label>
                  <div className="preset-icons">
                    {ICON_PRESETS.map((icon) => (
                      <button
                        key={icon}
                        className={`preset-icon ${editingWorkspace.icon === icon ? "active" : ""}`}
                        onClick={() => setEditingWorkspace({ ...editingWorkspace, icon })}
                      >
                        {getWorkspaceIcon(icon, editingWorkspace.color, 18)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="steps-section">
              <div className="steps-header">
                <h3>启动步骤清单 ({editingSteps.length})</h3>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  {editingSteps.length > 0 && (
                    <button type="button" className="secondary-action compact-action" onClick={handleCaptureWindowLayout} title="捕获当前屏幕上所有打开软件的窗口大小与坐标并自动匹配绑定到对应步骤">
                      <AppWindow size={16} /> 自动关联当前窗口位置
                    </button>
                  )}
                  <button className="primary-action compact-action" onClick={handleAddStep}>
                    <Plus size={16} /> 添加步骤
                  </button>
                </div>
              </div>

              {editingSteps.length === 0 ? (
                <div className="empty-steps">
                  <HelpCircle size={32} className="text-muted" />
                  <p>暂无启动步骤，点击上方“添加步骤”开始配置</p>
                </div>
              ) : (
                <div className="steps-list">
                  {editingSteps.map((step, index) => (
                    <div key={step.id} className="step-item glass-card">
                      <div className="step-drag-handle">
                        <button 
                          className="sort-btn" 
                          disabled={index === 0} 
                          onClick={() => handleMoveStep(index, "up")}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <span className="step-number">{index + 1}</span>
                        <button 
                          className="sort-btn" 
                          disabled={index === editingSteps.length - 1} 
                          onClick={() => handleMoveStep(index, "down")}
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>

                      <div className="step-config">
                        <div className="step-resource-select">
                          <label>步骤类型</label>
                          <div style={{ display: "flex", gap: "var(--space-2)", width: "100%" }}>
                            <select
                              value={step.type === "item" ? "item" : (step.itemId ? "item" : step.type)}
                              onChange={(e) => {
                                const newType = e.target.value as any;
                                if (newType === "item") {
                                  handleUpdateStep(step.id, { type: "item", itemId: undefined, title: "未关联资源", target: "" });
                                } else if (newType === "script") {
                                  handleUpdateStep(step.id, { 
                                    type: "script", 
                                    itemId: undefined, 
                                    title: "运行脚本", 
                                    target: "",
                                    scriptConfig: { type: "bat", content: "@echo off\necho Hello World", useFile: false, filePath: "" } 
                                  });
                                } else if (newType === "wait") {
                                  handleUpdateStep(step.id, { 
                                    type: "wait", 
                                    itemId: undefined, 
                                    title: "等待条件", 
                                    target: "",
                                    waitCondition: { type: "time", value: "5000", timeoutMs: 30000 } 
                                  });
                                } else {
                                  handleUpdateStep(step.id, { type: newType, itemId: undefined, title: "", target: "" });
                                }
                              }}
                              className="select-type-dropdown"
                              style={{ width: "130px", background: "var(--field)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", color: "var(--text)", padding: "0 8px", height: "32px", fontSize: "0.8rem" }}
                            >
                              <option value="item">关联已有资源</option>
                              <option value="app">自定义程序</option>
                              <option value="website">自定义网址</option>
                              <option value="folder">自定义文件夹</option>
                              <option value="file">自定义文件</option>
                              <option value="script">脚本命令</option>
                              <option value="wait">条件等待</option>
                            </select>
                            
                            {(step.type === "item" || step.itemId) && (
                              <button 
                                type="button" 
                                className="select-resource-btn"
                                onClick={() => {
                                  setSelectorStepId(step.id);
                                  setSelectorSearch("");
                                }}
                                style={{ flexGrow: 1 }}
                              >
                                {step.itemId ? (
                                  <>
                                    {getStepIcon(step.type)}
                                    <span className="btn-text">{step.title}</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus size={14} />
                                    <span className="btn-text">选择资源...</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Script Step Configuration */}
                        {step.type === "script" && (
                          <div className="step-script-config" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", width: "100%", marginTop: "var(--space-2)" }}>
                            <div style={{ display: "flex", gap: "var(--space-2)" }}>
                              <div className="step-input" style={{ width: "150px" }}>
                                <label>脚本类型</label>
                                <select
                                  value={step.scriptConfig?.type || "bat"}
                                  onChange={(e) => handleUpdateStep(step.id, { 
                                    scriptConfig: { ...(step.scriptConfig || { content: "", useFile: false, filePath: "" }), type: e.target.value as any } 
                                  })}
                                >
                                  <option value="bat">Batch (.bat/.cmd)</option>
                                  <option value="ps1">PowerShell (.ps1)</option>
                                </select>
                              </div>
                              <div className="step-input" style={{ flexGrow: 1 }}>
                                <label>脚本标题</label>
                                <input
                                  type="text"
                                  value={step.title}
                                  onChange={(e) => handleUpdateStep(step.id, { title: e.target.value })}
                                  placeholder="运行脚本的描述标题"
                                />
                              </div>
                            </div>
                            
                            <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "4px" }}>
                              <label className="toggle-label" style={{ fontSize: "0.8rem" }}>
                                <input
                                  type="radio"
                                  name={`script-source-${step.id}`}
                                  checked={!step.scriptConfig?.useFile}
                                  onChange={() => handleUpdateStep(step.id, { 
                                    scriptConfig: { ...(step.scriptConfig || { type: "bat", content: "", filePath: "" }), useFile: false } 
                                  })}
                                />
                                在线编写脚本内容
                              </label>
                              <label className="toggle-label" style={{ fontSize: "0.8rem" }}>
                                <input
                                  type="radio"
                                  name={`script-source-${step.id}`}
                                  checked={step.scriptConfig?.useFile}
                                  onChange={() => handleUpdateStep(step.id, { 
                                    scriptConfig: { ...(step.scriptConfig || { type: "bat", content: "", filePath: "" }), useFile: true } 
                                  })}
                                />
                                执行本地脚本文件
                              </label>
                            </div>
                            
                            {!step.scriptConfig?.useFile ? (
                              <div className="step-input" style={{ width: "100%" }}>
                                <label>脚本内容</label>
                                <textarea
                                  value={step.scriptConfig?.content || ""}
                                  onChange={(e) => handleUpdateStep(step.id, { 
                                    scriptConfig: { ...(step.scriptConfig || { type: "bat", useFile: false, filePath: "" }), content: e.target.value } 
                                  })}
                                  placeholder={step.scriptConfig?.type === "ps1" ? "Write PowerShell script here...\ne.g. Get-Process | select -First 5" : "Write Batch script here...\ne.g. echo Hello World"}
                                  rows={4}
                                  style={{ width: "100%", background: "var(--field)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", color: "var(--text)", padding: "8px", fontFamily: "monospace", fontSize: "0.8rem" }}
                                />
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--gold)", fontSize: "0.72rem", marginTop: "4px", background: "rgba(197, 160, 89, 0.05)", padding: "4px 8px", borderRadius: "4px", border: "1px solid rgba(197, 160, 89, 0.15)" }}>
                                  <AlertCircle size={12} />
                                  <span>安全提示：脚本会在本机执行，请只运行您信任的脚本。</span>
                                </div>
                              </div>
                            ) : (
                              <div className="step-input" style={{ width: "100%" }}>
                                <label>脚本文件路径</label>
                                <div style={{ display: "flex", gap: "var(--space-1)", width: "100%" }}>
                                  <input
                                    type="text"
                                    value={step.scriptConfig?.filePath || ""}
                                    onChange={(e) => handleUpdateStep(step.id, { 
                                      scriptConfig: { ...(step.scriptConfig || { type: "bat", useFile: true, content: "" }), filePath: e.target.value } 
                                    })}
                                    placeholder="C:\path\to\script.ps1 或 .bat"
                                    style={{ flexGrow: 1 }}
                                  />
                                  <button
                                    type="button"
                                    className="compact-action"
                                    title="选择脚本文件"
                                    style={{ padding: "0 8px", background: "var(--surface-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", height: "32px", cursor: "pointer" }}
                                    onClick={async () => {
                                      const filter = step.scriptConfig?.type === "ps1"
                                        ? "PowerShell scripts|*.ps1|All files|*.*"
                                        : "Batch scripts|*.bat;*.cmd|All files|*.*";
                                      const picked = await handlePickFile(filter, "选择脚本文件");
                                      if (picked) {
                                        handleUpdateStep(step.id, {
                                          scriptConfig: { ...(step.scriptConfig || { type: "bat", useFile: true, content: "" }), filePath: picked }
                                        });
                                      }
                                    }}
                                  >
                                    <FileText size={15} />
                                  </button>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--gold)", fontSize: "0.72rem", marginTop: "4px", background: "rgba(197, 160, 89, 0.05)", padding: "4px 8px", borderRadius: "4px", border: "1px solid rgba(197, 160, 89, 0.15)" }}>
                                  <AlertCircle size={12} />
                                  <span>安全提示：脚本会在本机执行，请只运行您信任的脚本。</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Wait Condition Configuration */}
                        {step.type === "wait" && (
                          <div className="step-wait-config" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", width: "100%", marginTop: "var(--space-2)" }}>
                            <div style={{ display: "flex", gap: "var(--space-2)" }}>
                              <div className="step-input" style={{ width: "130px" }}>
                                <label>等待条件类型</label>
                                <select
                                  value={step.waitCondition?.type || "time"}
                                  onChange={(e) => handleUpdateStep(step.id, { 
                                    waitCondition: { ...(step.waitCondition || { value: "", timeoutMs: 30000 }), type: e.target.value as any } 
                                  })}
                                >
                                  <option value="time">固定时间</option>
                                  <option value="process">进程运行中</option>
                                  <option value="port">TCP端口可访问</option>
                                  <option value="path">文件路径存在</option>
                                  <option value="url">URL可访问</option>
                                </select>
                              </div>
                              <div className="step-input" style={{ flexGrow: 1 }}>
                                <label>等待标题描述</label>
                                <input
                                  type="text"
                                  value={step.title}
                                  onChange={(e) => handleUpdateStep(step.id, { title: e.target.value })}
                                  placeholder="描述（例如：等待 localhost:3000）"
                                />
                              </div>
                            </div>
                            
                            <div style={{ display: "flex", gap: "var(--space-2)", width: "100%", flexWrap: "nowrap" }}>
                              <div className="step-input" style={{ flex: 1, minWidth: 0 }}>
                                <label>
                                  {step.waitCondition?.type === "time" && "等待时间 (毫秒)"}
                                  {step.waitCondition?.type === "process" && "进程名称 (例如: vmware.exe)"}
                                  {step.waitCondition?.type === "port" && "端口地址 (例如: localhost:3000)"}
                                  {step.waitCondition?.type === "path" && "本地或共享路径 (例如: E:\\Projects)"}
                                  {step.waitCondition?.type === "url" && "HTTP/HTTPS 链接 (例如: http://127.0.0.1:80)"}
                                </label>
                                <div style={{ display: "flex", gap: "var(--space-1)", width: "100%" }}>
                                  <input
                                    type="text"
                                    value={step.waitCondition?.value || ""}
                                    onChange={(e) => handleUpdateStep(step.id, { 
                                      waitCondition: { ...(step.waitCondition || { type: "time", timeoutMs: 30000 }), value: e.target.value } 
                                    })}
                                    placeholder={
                                      step.waitCondition?.type === "time" ? "5000" :
                                      step.waitCondition?.type === "process" ? "vmware.exe" :
                                      step.waitCondition?.type === "port" ? "localhost:3000" :
                                      step.waitCondition?.type === "path" ? "S:\\SambaShare" :
                                      "http://localhost:3000"
                                    }
                                    style={{ flexGrow: 1, minWidth: 0 }}
                                  />
                                  {step.waitCondition?.type === "path" && (
                                    <>
                                      <button
                                        type="button"
                                        className="compact-action"
                                        title="选择等待文件"
                                        style={{ padding: "0 8px", background: "var(--surface-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", height: "32px", cursor: "pointer", flexShrink: 0 }}
                                        onClick={async () => {
                                          const picked = await handlePickFile();
                                          if (picked) {
                                            handleUpdateStep(step.id, {
                                              waitCondition: { ...(step.waitCondition || { type: "path", timeoutMs: 30000 }), value: picked }
                                            });
                                          }
                                        }}
                                      >
                                        <FileText size={15} />
                                      </button>
                                      <button
                                        type="button"
                                        className="compact-action"
                                        title="选择等待文件夹"
                                        style={{ padding: "0 8px", background: "var(--surface-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", height: "32px", cursor: "pointer", flexShrink: 0 }}
                                        onClick={async () => {
                                          const picked = await handlePickFolder();
                                          if (picked) {
                                            handleUpdateStep(step.id, {
                                              waitCondition: { ...(step.waitCondition || { type: "path", timeoutMs: 30000 }), value: picked }
                                            });
                                          }
                                        }}
                                      >
                                        <FolderOpen size={15} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                              {step.waitCondition?.type !== "time" && (
                                <div className="step-input" style={{ width: "110px", flexShrink: 0 }}>
                                  <label>最大超时 (ms)</label>
                                  <input
                                    type="number"
                                    min="1000"
                                    value={step.waitCondition?.timeoutMs || 30000}
                                    onChange={(e) => handleUpdateStep(step.id, { 
                                      waitCondition: { ...(step.waitCondition || { type: "process", value: "" }), timeoutMs: parseInt(e.target.value) || 30000 } 
                                    })}
                                    placeholder="30000"
                                    style={{ width: "100%" }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Standard Custom Fields */}
                        {!step.itemId && step.type !== "script" && step.type !== "wait" && (
                          <>
                            <div className="step-input">
                              <label>步骤标题</label>
                              <input
                                type="text"
                                value={step.title}
                                onChange={(e) => handleUpdateStep(step.id, { title: e.target.value })}
                                placeholder="步骤说明"
                              />
                            </div>
                            <div className="step-input step-target">
                              <label>自定义目标路径或网址</label>
                              <div style={{ display: "flex", gap: "var(--space-1)", width: "100%" }}>
                                <input
                                  type="text"
                                  value={step.target}
                                  onChange={(e) => handleUpdateStep(step.id, { target: e.target.value })}
                                  placeholder="C:\path\to\app.exe 或 https://..."
                                  style={{ flexGrow: 1 }}
                                />
                                <button
                                  type="button"
                                  className="compact-action"
                                  title="选择文件"
                                  style={{ padding: "0 8px", background: "var(--surface-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", height: "32px", cursor: "pointer" }}
                                  onClick={async () => {
                                    const picked = await handlePickFile();
                                    if (picked) handleUpdateStep(step.id, { target: picked });
                                  }}
                                >
                                  <FileText size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="compact-action"
                                  title="选择文件夹"
                                  style={{ padding: "0 8px", background: "var(--surface-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", height: "32px", cursor: "pointer" }}
                                  onClick={async () => {
                                    const picked = await handlePickFolder();
                                    if (picked) handleUpdateStep(step.id, { target: picked });
                                  }}
                                >
                                  <FolderOpen size={15} />
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                        
                        {step.itemId && step.type !== "script" && step.type !== "wait" && (
                          <div className="step-preview-info">
                            {getStepIcon(step.type)}
                            <span className="step-preview-title">{step.title}</span>
                            <span className="step-preview-target">{step.target}</span>
                          </div>
                        )}

                        {step.type !== "script" && step.type !== "wait" && (
                          <div className="step-delay">
                            <label>启动后延迟 (毫秒)</label>
                            <input
                              type="number"
                              min="0"
                              step="100"
                              value={step.delayMs || 0}
                              onChange={(e) => handleUpdateStep(step.id, { delayMs: parseInt(e.target.value) || 0 })}
                              placeholder="例如: 1000"
                            />
                          </div>
                        )}

                        <div className="step-actions">
                          <label className="toggle-label">
                            <input
                              type="checkbox"
                              checked={step.enabled}
                              onChange={(e) => handleUpdateStep(step.id, { enabled: e.target.checked })}
                            />
                            启用
                          </label>
                          <button className="icon-button text-danger" onClick={() => handleDeleteStep(step.id)}>
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {/* Preceding Dependencies */}
                        {index > 0 && (
                          <div className="step-input step-depends-on" style={{ marginTop: "var(--space-2)", width: "100%" }}>
                            <label>前置依赖步骤 (仅当前置步骤成功启动才运行该步骤)</label>
                            <div className="depends-on-checkboxes" style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "4px" }}>
                              {editingSteps.slice(0, index).map((prevStep, prevIdx) => {
                                const isChecked = (step.dependsOn || []).includes(prevStep.id);
                                return (
                                  <label key={prevStep.id} className="depends-on-checkbox-label">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        const currentDeps = step.dependsOn || [];
                                        const nextDeps = e.target.checked
                                          ? [...currentDeps, prevStep.id]
                                          : currentDeps.filter((id) => id !== prevStep.id);
                                        handleUpdateStep(step.id, { dependsOn: nextDeps });
                                      }}
                                    />
                                    <span>步骤 {prevIdx + 1}: {prevStep.title || prevStep.target || "未命名"}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {step.type !== "script" && step.type !== "wait" && (
                          <div className="step-advanced-row">
                            <div className="step-input step-args">
                              <label>启动参数</label>
                              <input
                                type="text"
                                value={step.arguments || ""}
                                onChange={(e) => handleUpdateStep(step.id, { arguments: e.target.value })}
                                placeholder="参数 (如: --profile-directory=...)"
                              />
                            </div>
                            <div className="step-input step-workdir">
                              <label>工作目录</label>
                              <div style={{ display: "flex", gap: "var(--space-1)", width: "100%" }}>
                                <input
                                  type="text"
                                  value={step.workingDirectory || ""}
                                  onChange={(e) => handleUpdateStep(step.id, { workingDirectory: e.target.value })}
                                  placeholder="工作目录路径 (可选)"
                                  style={{ flexGrow: 1 }}
                                />
                                <button
                                  type="button"
                                  className="compact-action"
                                  title="选择工作目录"
                                  style={{ padding: "0 8px", background: "var(--surface-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", height: "32px", cursor: "pointer" }}
                                  onClick={async () => {
                                    const picked = await handlePickFolder();
                                    if (picked) handleUpdateStep(step.id, { workingDirectory: picked });
                                  }}
                                >
                                  <FolderOpen size={15} />
                                </button>
                              </div>
                            </div>
                            <div className="step-input step-policy">
                              <label>失败策略</label>
                              <select
                                value={step.failurePolicy || "continue"}
                                onChange={(e) => handleUpdateStep(step.id, { failurePolicy: e.target.value as any })}
                              >
                                <option value="continue">失败后继续</option>
                                <option value="stop">失败后停止</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {step.type !== "script" && step.type !== "wait" && (
                          <div className="step-window-layout-config" style={{ marginTop: "var(--space-2)", width: "100%", background: "var(--surface-3)", padding: "10px", borderRadius: "var(--radius-sm)", border: "1px dashed var(--line)", display: "flex", flexDirection: "column", gap: "6px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <label style={{ fontSize: "0.75rem", fontWeight: "bold", color: "var(--gold)", display: "flex", alignItems: "center", gap: "4px" }}>
                                <AppWindow size={14} /> 窗口位置布局保存
                              </label>
                              {step.windowLayout ? (
                                <button 
                                  type="button" 
                                  className="text-action compact-action" 
                                  style={{ fontSize: "0.72rem", color: "#ef4444", border: "none", background: "none", cursor: "pointer", padding: 0 }}
                                  onClick={() => handleUpdateStep(step.id, { windowLayout: undefined })}
                                >
                                  清除保存的位置
                                </button>
                              ) : (
                                <button 
                                  type="button" 
                                  className="text-action compact-action" 
                                  style={{ fontSize: "0.72rem", color: "var(--gold)", border: "none", background: "none", cursor: "pointer", padding: 0 }}
                                  onClick={() => handleCaptureSingleStepLayout(step.id)}
                                >
                                  捕获此步骤当前窗口位置
                                </button>
                              )}
                            </div>
                            {step.windowLayout ? (
                              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                                <div><strong>坐标 (X, Y):</strong> ({step.windowLayout.x}, {step.windowLayout.y})</div>
                                <div><strong>尺寸 (W x H):</strong> {step.windowLayout.width} x {step.windowLayout.height}</div>
                                <div style={{ gridColumn: "span 2" }}><strong>进程名:</strong> {step.windowLayout.processName}</div>
                                {step.windowLayout.isMaximized && <div style={{ gridColumn: "span 2", color: "var(--gold)" }}><strong>状态:</strong> 启动后自动最大化</div>}
                                <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: "6px", margin: "2px 0" }}>
                                  <input 
                                    type="checkbox" 
                                    id={`always-on-top-${step.id}`}
                                    checked={step.windowLayout.alwaysOnTop === true}
                                    onChange={(e) => {
                                      const nextLayout = { ...step.windowLayout, alwaysOnTop: e.target.checked };
                                      handleUpdateStep(step.id, { windowLayout: nextLayout as any });
                                    }}
                                    style={{ cursor: "pointer", accentColor: "var(--gold)", width: "13px", height: "13px" }}
                                  />
                                  <label htmlFor={`always-on-top-${step.id}`} style={{ margin: 0, cursor: "pointer", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                    启动后置于顶层 (始终置顶)
                                  </label>
                                </div>
                                <div style={{ gridColumn: "span 2", fontSize: "0.68rem", color: "var(--muted)" }}>捕获时间: {new Date(step.windowLayout.capturedAt).toLocaleString()}</div>
                              </div>
                            ) : (
                              <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                                尚未关联窗口位置。启动工作区时将以默认大小和位置启动该程序。
                              </div>
                            )}
                          </div>
                        )}

                        {(step.type === "script" || step.type === "wait") && (
                          <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)", width: "200px" }}>
                            <div className="step-input" style={{ width: "100%" }}>
                              <label>失败策略</label>
                              <select
                                value={step.failurePolicy || "continue"}
                                onChange={(e) => handleUpdateStep(step.id, { failurePolicy: e.target.value as any })}
                              >
                                <option value="continue">失败后继续</option>
                                <option value="stop">失败后停止</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="editor-footer">
              <button className="secondary-action" onClick={() => setEditingWorkspace(null)}>
                取消
              </button>
              <button className="primary-action" onClick={handleSaveEdit}>
                <Save size={16} /> 保存工作区
              </button>
            </div>
          </div>
        </div>
      ) : (
        // WORKSPACES LIST UI
        <div className="workspaces-list-view">
          <div className="view-actions" style={{ display: "flex", gap: "var(--space-2)" }}>
            <button className="primary-action" onClick={handleCreateWorkspace}>
              <Plus size={18} /> 新建工作区
            </button>
            <button className="secondary-action" onClick={() => setShowLogsModal(true)}>
              <FileText size={16} /> 历史日志
            </button>
          </div>

          {workspaces.length === 0 ? (
            <div className="empty-workspaces glass-panel">
              <Briefcase size={48} className="text-muted" />
              <h3>暂无工作区</h3>
              <p>工作区可以将多个应用、网址、文件夹等组合在一起，并在您需要的时候一键按顺序批量启动。</p>
              <button className="primary-action compact-action" onClick={handleCreateWorkspace}>
                立即创建
              </button>
            </div>
          ) : (
            <div className="workspaces-grid">
              {workspaces.map((ws) => {
                const wsSteps = steps.filter((s) => s.workspaceId === ws.id);
                const enabledSteps = wsSteps.filter((s) => s.enabled);
                const isLaunching = launchingId === ws.id;

                return (
                  <div key={ws.id} className="workspace-card glass-panel" style={{ borderTop: `4px solid ${ws.color || "#E0533C"}` }}>
                    <div className="card-top">
                      <div className="ws-icon-circle" style={{ backgroundColor: `${ws.color}15` }}>
                        {getWorkspaceIcon(ws.icon || "Briefcase", ws.color, 24)}
                      </div>
                      <div className="ws-meta">
                        <h4>{ws.name}</h4>
                        <p>{ws.description || "无描述"}</p>
                      </div>
                    </div>

                    <div className="card-middle">
                      <div className="stat-badge">
                        <span className="stat-label">步骤数量:</span>
                        <span className="stat-val">{enabledSteps.length} / {wsSteps.length}</span>
                      </div>
                      <div className="stat-badge">
                        <span className="stat-label">启动次数:</span>
                        <span className="stat-val">{ws.launchCount || 0}</span>
                      </div>
                      {ws.lastLaunchedAt && (
                        <div className="stat-badge full-width">
                          <span className="stat-label">上次启动:</span>
                          <span className="stat-val">{new Date(ws.lastLaunchedAt).toLocaleString("zh-CN", { hour12: false })}</span>
                        </div>
                      )}
                    </div>

                    <div className="card-bottom">
                      <button 
                        className={`primary-action launch-btn ${isLaunching ? "launching" : ""}`}
                        disabled={isLaunching}
                        onClick={() => handleLaunch(ws)}
                      >
                        {isLaunching ? (
                          <>
                            <RefreshCw size={16} className="spin-animation" /> 启动中
                          </>
                        ) : (
                          <>
                            <Play size={16} /> 启动
                          </>
                        )}
                      </button>

                      <div className="action-buttons">
                        <button className="icon-button" onClick={() => handleEditWorkspace(ws)} title="编辑">
                          <Edit3 size={16} />
                        </button>
                        <button className="icon-button text-danger" onClick={() => handleDeleteWorkspace(ws.id)} title="删除">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selectorStepId && (() => {
        const filteredItems = items.filter((item) => {
          const searchLower = selectorSearch.toLowerCase().trim();
          if (!searchLower) return true;
          return (
            item.title.toLowerCase().includes(searchLower) ||
            (item.target && item.target.toLowerCase().includes(searchLower))
          );
        });

        return (
          <div className="resource-selector-overlay" onClick={() => setSelectorStepId(null)}>
            <div className="resource-selector-modal glass-panel" onClick={(e) => e.stopPropagation()}>
              <div className="selector-header">
                <Search size={18} className="text-muted" />
                <input
                  type="text"
                  placeholder="搜索已有应用、网页、文件夹..."
                  value={selectorSearch}
                  onChange={(e) => setSelectorSearch(e.target.value)}
                  autoFocus
                />
                <button className="icon-button" onClick={() => setSelectorStepId(null)}>
                  <X size={16} />
                </button>
              </div>
              <div className="selector-results">
                <div 
                  className="selector-result-item custom-option"
                  onClick={() => {
                    handleUpdateStep(selectorStepId, { itemId: undefined, title: "自定义步骤", target: "", type: "file" });
                    setSelectorStepId(null);
                  }}
                >
                  <Edit3 size={16} className="text-muted" />
                  <div className="result-info">
                    <span className="result-title">使用自定义路径或网址</span>
                    <span className="result-subtitle">手动输入文件地址、命令或 HTTP 网址</span>
                  </div>
                </div>
                {filteredItems.map((item) => (
                  <div 
                    key={item.id} 
                    className="selector-result-item"
                    onClick={() => {
                      handleUpdateStep(selectorStepId, { itemId: item.id });
                      setSelectorStepId(null);
                    }}
                  >
                    {getStepIcon(item.kind)}
                    <div className="result-info">
                      <span className="result-title">{item.title}</span>
                      <span className="result-subtitle">{item.target}</span>
                    </div>
                  </div>
                ))}
                {filteredItems.length === 0 && (
                  <div className="selector-no-results">
                    未找到匹配的资源
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {deleteConfirmId && (() => {
        const ws = workspaces.find((w) => w.id === deleteConfirmId);
        if (!ws) return null;
        return (
          <div className="resource-selector-overlay" onClick={() => setDeleteConfirmId(null)}>
            <div className="modal-panel dialog-panel" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <p className="eyebrow">Delete workspace</p>
                  <h2>删除工作区</h2>
                </div>
                <button className="icon-action" onClick={() => setDeleteConfirmId(null)}>
                  <X size={18} />
                </button>
              </div>
              <div className="dialog-body">
                <p className="dialog-warning">这只会从 OrbitStart 中移除该工作区，不会删除各启动步骤中关联的真实程序或文件。</p>
                <div className="dialog-target">
                  <div style={{ marginRight: "12px", display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", borderRadius: "50%", background: `${ws.color}15` }}>
                    {getWorkspaceIcon(ws.icon || "Briefcase", ws.color, 20)}
                  </div>
                  <span>
                    <strong>{ws.name}</strong>
                    <small>{ws.description || "无描述"}</small>
                  </span>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-action" onClick={() => setDeleteConfirmId(null)}>取消</button>
                <button 
                  type="button" 
                  className="danger-action dialog-action" 
                  onClick={() => {
                    invoke("update_workspace_hotkey", { workspaceId: deleteConfirmId, newHotkey: null }).catch((e) => {
                      console.error("Failed to unregister hotkey on delete", e);
                    });
                    const nextWs = workspaces.filter((w) => w.id !== deleteConfirmId);
                    const nextSteps = steps.filter((s) => s.workspaceId !== deleteConfirmId);
                    saveAllData(nextWs, nextSteps);
                    setDeleteConfirmId(null);
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showLogsModal && (
        <div className="resource-selector-overlay" onClick={() => setShowLogsModal(false)}>
          <div className="modal-panel dialog-panel" style={{ maxWidth: "550px", width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">Launch logs</p>
                <h2>启动历史日志</h2>
              </div>
              <button className="icon-action" onClick={() => setShowLogsModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="dialog-body" style={{ maxHeight: "350px", overflowY: "auto", padding: "var(--space-2) var(--space-4)" }}>
              {launchLogs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "var(--space-6) 0", color: "var(--muted)", fontSize: "0.9rem" }}>
                  暂无启动日志记录
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {launchLogs.map((log: any) => (
                    <div key={log.id} className="dialog-target" style={{ padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)", alignItems: "stretch", cursor: "default" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ fontSize: "0.85rem", color: "var(--text)" }}>{log.workspaceName}</strong>
                        <span 
                          style={{ 
                            fontSize: "0.7rem", 
                            padding: "2px 6px", 
                            borderRadius: "4px",
                            background: log.status === "success" ? "rgba(46, 204, 113, 0.12)" : "rgba(231, 76, 60, 0.12)",
                            color: log.status === "success" ? "#2ecc71" : "#e74c3c",
                            fontWeight: 500
                          }}
                        >
                          {log.status === "success" ? "启动成功" : (log.status === "partial" ? "部分成功" : "启动失败")}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--muted)" }}>
                        <span>启动时间: {new Date(log.launchedAt).toLocaleString("zh-CN")}</span>
                        <span>耗时: {(log.durationMs / 1000).toFixed(2)} 秒</span>
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--soft)" }}>
                        总步骤: {log.totalSteps} · 成功: {log.successSteps} · 失败: {log.failedSteps}
                      </div>
                      {log.errors && log.errors.length > 0 && (
                        <div style={{ background: "rgba(231, 76, 60, 0.05)", padding: "var(--space-2)", borderRadius: "var(--radius-sm)", marginTop: "var(--space-1)", border: "1px solid rgba(231, 76, 60, 0.1)" }}>
                          {log.errors.map((err: any, idx: number) => (
                            <div key={idx} style={{ color: "#e74c3c", fontSize: "0.7rem", lineHeight: "1.4" }}>
                              • <strong>{err.stepTitle}</strong>: {err.errorMsg}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="modal-actions" style={{ justifyContent: "space-between" }}>
              <button 
                type="button" 
                className="secondary-action" 
                onClick={() => {
                  localStorage.removeItem("orbitstart.plugin.workspaces.storage.logs");
                  setLaunchLogs([]);
                }}
                disabled={launchLogs.length === 0}
              >
                清空日志
              </button>
              <button type="button" className="primary-action" onClick={() => setShowLogsModal(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {scanLayoutModalOpen && (
        <div className="resource-selector-overlay" onClick={() => setScanLayoutModalOpen(false)}>
          <div className="modal-panel dialog-panel" style={{ maxWidth: "720px", width: "95%", maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">Import Desktop Windows</p>
                <h2>导入/关联桌面运行窗口</h2>
              </div>
              <button className="icon-action" onClick={() => setScanLayoutModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="dialog-body" style={{ overflowY: "auto", maxHeight: "55vh", padding: "var(--space-3) var(--space-4)" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: "var(--space-3)" }}>
                系统检测到以下正在运行的窗口。您可以选择要导入/关联的窗口，并指定是新建步骤还是更新已有步骤。
              </p>
              
              <div className="scanned-windows-list" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {scannedWindows.map((win, idx) => {
                  const isSelected = selectedWindowIndices.includes(idx);
                  const currentBinding = windowBindings[idx] || "new";
                  
                  return (
                    <div 
                      key={idx} 
                      style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: "var(--space-3)", 
                        background: "var(--surface-3)", 
                        padding: "10px 12px", 
                        borderRadius: "var(--radius-sm)",
                        border: isSelected ? "1px solid var(--gold)" : "1px solid var(--line)",
                        transition: "all 0.2s"
                      }}
                    >
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedWindowIndices([...selectedWindowIndices, idx]);
                          } else {
                            setSelectedWindowIndices(selectedWindowIndices.filter(i => i !== idx));
                          }
                        }}
                        style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--gold)" }}
                      />
                      
                      <div style={{ flexGrow: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontWeight: "bold", fontSize: "0.85rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={win.windowTitle}>
                            {win.windowTitle || "无标题窗口"}
                          </span>
                          <span style={{ fontSize: "0.72rem", background: "var(--surface-4)", padding: "1px 6px", borderRadius: "3px", color: "var(--gold)" }}>
                            {win.processName}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "3px" }}>
                          位置: ({win.x}, {win.y}) · 尺寸: {win.width}x{win.height} {win.isMaximized ? "· 已最大化" : ""}
                        </div>
                      </div>
                      
                      <div className="step-input" style={{ width: "180px", marginBottom: 0 }}>
                        <select
                          value={currentBinding}
                          onChange={(e) => setWindowBindings({ ...windowBindings, [idx]: e.target.value })}
                          style={{ width: "100%", height: "30px", fontSize: "0.75rem" }}
                          disabled={!isSelected}
                        >
                          <option value="new">🆕 新建为启动步骤</option>
                          {editingSteps
                            .filter(s => s.type !== "script" && s.type !== "wait")
                            .map((s, stepIdx) => (
                              <option key={s.id} value={s.id}>
                                🔗 关联步骤 {stepIdx + 1}: {s.title || s.target.split(/[\\/]/).pop()}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="modal-actions" style={{ borderTop: "1px solid var(--line)", paddingTop: "var(--space-3)" }}>
              <button type="button" className="secondary-action" onClick={() => setScanLayoutModalOpen(false)}>
                取消
              </button>
              <button 
                type="button" 
                className="primary-action" 
                onClick={handleImportScannedLayouts}
                disabled={selectedWindowIndices.length === 0}
              >
                确认导入并更新 ({selectedWindowIndices.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {themedAlert && (
        <div className="resource-selector-overlay" style={{ zIndex: 100000 }} onClick={() => setThemedAlert(null)}>
          <div className="modal-panel dialog-panel" style={{ maxWidth: "400px", width: "90%", padding: "var(--space-5)" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ marginBottom: "var(--space-3)", borderBottom: "none", paddingBottom: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                {themedAlert.type === "success" && <CheckCircle2 size={24} style={{ color: "var(--gold)" }} />}
                {themedAlert.type === "error" && <AlertCircle size={24} style={{ color: "#e74c3c" }} />}
                {themedAlert.type === "info" && <HelpCircle size={24} style={{ color: "var(--gold)" }} />}
                <h2 style={{ margin: 0, fontSize: "1.2rem" }}>{themedAlert.title}</h2>
              </div>
            </div>
            <div className="dialog-body" style={{ padding: "0 0 var(--space-4) 0" }}>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)", whiteSpace: "pre-line", lineHeight: "1.5" }}>
                {themedAlert.message}
              </p>
            </div>
            <div className="modal-actions" style={{ padding: 0, paddingTop: "var(--space-3)", borderTop: "1px solid var(--line)" }}>
              <button 
                type="button" 
                className="primary-action compact-action" 
                onClick={() => setThemedAlert(null)}
                style={{ width: "100%" }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
