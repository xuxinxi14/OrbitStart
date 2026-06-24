/**
 * OrbitStart Onboarding / Scenario Template System
 *
 * First-launch wizard that guides users through:
 * 1. Scenario template selection (student, editor, developer, researcher, data analyst, general)
 * 2. Auto-creation of example tags/workspaces based on selection
 * 3. Two-step scan guide: shortcuts → bookmarks
 * 4. Skip option at any time
 *
 * State is persisted in localStorage so the wizard only shows once.
 */

// ---------------------------------------------------------------------------
// 1. Scenario Template Definitions
export interface ScenarioGroup {
  id: string;
  title: string;
  icon: string;
  description: string;
}

export interface ScenarioTag {
  id: string;
  title: string;
  kind: "app" | "file" | "folder" | "website" | "script" | "action_chain";
  target: string;
  icon: string;
  accent: string;
  group: string; // references ScenarioGroup.id
  favorite?: boolean;
}

export interface ScenarioTemplate {
  id: string;
  title: string;          // e.g., "我是学生"
  subtitle: string;       // e.g., "学习、笔记和课程管理"
  description: string;    // longer description
  icon: string;           // Lucide icon name
  accent: string;         // theme color
  tags: ScenarioTag[];     // pre-seeded items to create
  groups: ScenarioGroup[]; // custom groups to create
}

/** The 6 scenario templates matching the P3 spec image */
export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: "student",
    title: "我是学生",
    subtitle: "学习、笔记和课程管理",
    description: "为学习者打造的高效工具集合，包含笔记、翻译、文献管理和在线课程平台。",
    icon: "NotebookText",
    accent: "#5cc8ff",
    groups: [
      { id: "study_tools", title: "学习工具", icon: "NotebookText", description: "常用学习软件与工具" },
      { id: "study_sites", title: "学术网址", icon: "Globe", description: "学术搜索与在线平台" },
      { id: "study_work", title: "课程工作区", icon: "PanelsTopLeft", description: "课程与工作空间" }
    ],
    tags: [
      { id: "obsidian-student", title: "Obsidian 笔记", kind: "app", target: "obsidian://open", icon: "Gem", accent: "#9b87f5", group: "study_tools", favorite: true },
      { id: "notepad-student", title: "记事本", kind: "app", target: "C:\\Windows\\System32\\notepad.exe", icon: "NotebookText", accent: "#5cc8ff", group: "study_tools" },
      { id: "github-student", title: "GitHub", kind: "website", target: "https://github.com", icon: "Github", accent: "#ffffff", group: "study_sites" },
      { id: "baidu-student", title: "百度", kind: "website", target: "https://www.baidu.com", icon: "Globe", accent: "#2932e1", group: "study_sites" },
      { id: "course-workspace", title: "课程工作区", kind: "action_chain", target: "obsidian://open\nhttps://github.com", icon: "Workflow", accent: "#ff7a90", group: "study_work" }
    ]
  },
  {
    id: "editor",
    title: "我是剪辑用户",
    subtitle: "视频剪辑与素材管理",
    description: "视频创作工作流，整合剪辑软件、素材库、音效资源和渲染输出目录。",
    icon: "Film",
    accent: "#f472b6",
    groups: [
      { id: "edit_tools", title: "剪辑软件", icon: "Film", description: "视频与音频处理软件" },
      { id: "edit_assets", title: "素材与资源", icon: "FolderOpen", description: "素材夹与本地资源" },
      { id: "edit_sites", title: "素材网站", icon: "Globe", description: "高清图片与视频资源站" },
      { id: "edit_work", title: "剪辑工作区", icon: "PanelsTopLeft", description: "剪辑工作流组合" }
    ],
    tags: [
      { id: "premiere-editor", title: "Adobe Premiere Pro", kind: "app", target: "C:\\Program Files\\Adobe\\Adobe Premiere Pro 2024\\Adobe Premiere Pro.exe", icon: "Clapperboard", accent: "#99f", group: "edit_tools" },
      { id: "capcut-editor", title: "剪映专业版", kind: "app", target: "C:\\Users\\[user]\\AppData\\Local\\CapCut\\CapCut.exe", icon: "Scissors", accent: "#00d4aa", group: "edit_tools" },
      { id: "shots-folder", title: "截图素材文件夹", kind: "folder", target: "C:\\Users\\[user]\\Pictures\\Screenshots", icon: "FolderOpen", accent: "#f6b95b", group: "edit_assets" },
      { id: "pexels-editor", title: "Pexels 免费素材", kind: "website", target: "https://www.pexels.com", icon: "Image", accent: "#2ea043", group: "edit_sites" },
      { id: "unsplash-editor", title: "Unsplash 高清图片", kind: "website", target: "https://unsplash.com", icon: "Image", accent: "#111", group: "edit_sites" },
      { id: "editing-workspace", title: "剪辑工作区", kind: "action_chain", target: "C:\\Program Files\\Adobe\\Adobe Premiere Pro 2024\\Adobe Premiere Pro.exe\nhttps://www.pexels.com", icon: "Workflow", accent: "#ff7a90", group: "edit_work" }
    ]
  },
  {
    id: "developer",
    title: "我是开发者",
    subtitle: "代码、终端和部署工具链",
    description: "开发者全栈工具箱，覆盖编辑器、版本控制、容器化、API 文档 and 云服务平台。",
    icon: "Code",
    accent: "#a78bfa",
    groups: [
      { id: "dev_tools", title: "开发工具", icon: "Code", description: "编辑器与终端环境" },
      { id: "dev_sites", title: "技术社区", icon: "Globe", description: "开发文档与技术交流" },
      { id: "dev_work", title: "开发工作区", icon: "PanelsTopLeft", description: "开发与部署工作流" }
    ],
    tags: [
      { id: "vscode-dev", title: "Visual Studio Code", kind: "app", target: "C:\\Users\\[user]\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", icon: "FileCode2", accent: "#007acc", group: "dev_tools", favorite: true },
      { id: "git-bash-dev", title: "Git Bash", kind: "app", target: "C:\\Program Files\\Git\\bin\\bash.exe", icon: "TerminalSquare", accent: "#f05032", group: "dev_tools" },
      { id: "github-dev", title: "GitHub", kind: "website", target: "https://github.com", icon: "Github", accent: "#fff", group: "dev_sites" },
      { id: "npm-dev", title: "NPM 包管理器", kind: "website", target: "https://www.npmjs.com", icon: "Package", accent: "#cb3837", group: "dev_sites" },
      { id: "mdn-dev", title: "MDN Web 文档", kind: "website", target: "https://developer.mozilla.org", icon: "BookOpen", accent: "#000", group: "dev_sites" },
      { id: "dev-workspace", title: "开发工作区", kind: "action_chain", target: "C:\\Users\\[user]\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe\nC:\\Program Files\\Git\\bin\\bash.exe\nhttps://github.com", icon: "Workflow", accent: "#ff7a90", group: "dev_work" }
    ]
  },
  {
    id: "researcher",
    title: "我做科研",
    subtitle: "论文、数据和文献管理",
    description: "科研工作者专用环境，包含学术搜索引擎、文献管理工具、数据可视化和协作平台。",
    icon: "Microscope",
    accent: "#c084fc",
    groups: [
      { id: "research_tools", title: "科研工具", icon: "Microscope", description: "文献管理与笔记" },
      { id: "research_sites", title: "学术平台", icon: "Globe", description: "学术搜索与预印本网站" },
      { id: "research_work", title: "科研工作区", icon: "PanelsTopLeft", description: "科研工作空间组合" }
    ],
    tags: [
      { id: "zotero-research", title: "Zotero", kind: "app", target: "C:\\Program Files\\Zotero\\zotero.exe", icon: "Library", accent: "#cc9223", group: "research_tools" },
      { id: "obsidian-research", title: "Obsidian", kind: "app", target: "obsidian://open", icon: "Gem", accent: "#9b87f5", group: "research_tools", favorite: true },
      { id: "scholar-research", title: "Google Scholar", kind: "website", target: "https://scholar.google.com", icon: "GraduationCap", accent: "#4285f4", group: "research_sites" },
      { id: "arxiv-research", title: "arXiv 预印本", kind: "website", target: "https://arxiv.org", icon: "FileText", accent: "#b31b1b", group: "research_sites" },
      { id: "research-workspace", title: "科研工作区", kind: "action_chain", target: "obsidian://open\nhttps://scholar.google.com\nhttps://arxiv.org", icon: "Workflow", accent: "#ff7a90", group: "research_work" }
    ]
  },
  {
    id: "data-analyst",
    title: "我做数据分析",
    subtitle: "数据处理、可视化与报表",
    description: "数据分析师的工作台，集成电子表格、数据库客户端、BI 可视化和 Python 数据科学环境。",
    icon: "BarChart3",
    accent: "#fb923c",
    groups: [
      { id: "data_tools", title: "分析工具", icon: "BarChart3", description: "表格、数据库与可视化客户端" },
      { id: "data_scripts", title: "数据脚本", icon: "TerminalSquare", description: "本地脚本与分析代码" },
      { id: "data_sites", title: "数据源与竞赛", icon: "Globe", description: "竞赛平台与公共数据集" },
      { id: "data_work", title: "数据工作区", icon: "PanelsTopLeft", description: "分析与清洗工作流" }
    ],
    tags: [
      { id: "excel-data", title: "Microsoft Excel", kind: "app", target: "C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE", icon: "Table", accent: "#217346", group: "data_tools" },
      { id: "dbeaver-data", title: "DBeaver 数据库工具", kind: "app", target: "C:\\Program Files\\DBeaver\\dbeaver.exe", icon: "Database", accent: "#376e93", group: "data_tools" },
      { id: "python-data", title: "Python 环境", kind: "script", target: "python --version", icon: "TerminalSquare", accent: "#41e0a8", group: "data_scripts" },
      { id: "kaggle-data", title: "Kaggle 数据竞赛", kind: "website", target: "https://www.kaggle.com", icon: "Trophy", accent: "#20beff", group: "data_sites" },
      { id: "data-workspace", title: "数据分析工作区", kind: "action_chain", target: "C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE\nC:\\Program Files\\DBeaver\\dbeaver.exe", icon: "Workflow", accent: "#ff7a90", group: "data_work" }
    ]
  },
  {
    id: "general",
    title: "我只是想整理电脑",
    subtitle: "简洁高效，从零开始",
    description: "干净的起点：只保留最核心的入口，后续按需自行添加。适合追求极简的用户。",
    icon: "Sparkles",
    accent: "#94a3b8",
    groups: [
      { id: "general_tools", title: "常用工具", icon: "Sparkles", description: "系统核心工具与常用程序" }
    ],
    tags: [
      { id: "notepad-general", title: "记事本", kind: "app", target: "C:\\Windows\\System32\\notepad.exe", icon: "NotebookText", accent: "#5cc8ff", group: "general_tools" },
      { id: "explorer-general", title: "文件资源管理器", kind: "app", target: "C:\\Windows\\explorer.exe", icon: "FolderOpen", accent: "#fbbf24", group: "general_tools" },
      { id: "settings-general", title: "系统设置", kind: "app", target: "ms-settings:", icon: "Settings", accent: "#94a3b8", group: "general_tools" }
    ]
  }
];

// ---------------------------------------------------------------------------
// 2. Onboarding State Machine
// ---------------------------------------------------------------------------

export type OnboardingStep =
  | "template-select"   // Step 1: Choose a scenario
  | "tags-created";     // Step 2: Tags created, show scan guide

export interface OnboardingState {
  step: OnboardingStep;
  selectedTemplateId: string | null;
  shortcutScanDone: boolean;   // Step 3a: local program scan completed
  bookmarkScanDone: boolean;   // Step 3b: browser bookmark scan completed
  skipped: boolean;             // User chose to skip entirely
  completed: boolean;           // All steps done or skipped
}

const STORAGE_KEY = "orbitstart_onboarding_v1";

/** Default / initial onboarding state */
export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  step: "template-select",
  selectedTemplateId: null,
  shortcutScanDone: false,
  bookmarkScanDone: false,
  skipped: false,
  completed: false
};

// ---------------------------------------------------------------------------
// 3. Persistence
// ---------------------------------------------------------------------------

/** Load onboarding state from localStorage. Returns null if not found (first launch). */
export function loadOnboardingState(): OnboardingState | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null; // first time — show wizard
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    // Merge with defaults to handle future schema additions
    return { ...DEFAULT_ONBOARDING_STATE, ...parsed };
  } catch {
    return null;
  }
}

/** Save onboarding state to localStorage. */
export function saveOnboardingState(state: OnboardingState): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Silently fail — non-critical
  }
}

/** Check if the onboarding wizard should be shown. */
export function shouldShowOnboarding(): boolean {
  const state = loadOnboardingState();
  if (!state) return true; // Never shown before → first launch
  return !state.completed && !state.skipped;
}

/** Mark onboarding as completed (all steps done). */
export function completeOnboarding(): void {
  saveOnboardingState({ ...DEFAULT_ONBOARDING_STATE, completed: true });
}

/** Skip onboarding entirely. */
export function skipOnboarding(): void {
  saveOnboardingState({ ...DEFAULT_ONBOARDING_STATE, skipped: true, completed: true });
}

// ---------------------------------------------------------------------------
// 4. State Transitions
// ---------------------------------------------------------------------------

/** Advance to next step after template selection. Returns items to inject into catalog. */
export function selectTemplate(templateId: string): OnboardingState & { newTags: ScenarioTag[]; newGroups: ScenarioGroup[] } {
  const template = SCENARIO_TEMPLATES.find((t) => t.id === templateId);
  const state: OnboardingState = {
    ...DEFAULT_ONBOARDING_STATE,
    step: "tags-created",
    selectedTemplateId: templateId,
    shortcutScanDone: false,
    bookmarkScanDone: false
  };
  saveOnboardingState(state);
  return { ...state, newTags: template?.tags ?? [], newGroups: template?.groups ?? [] };
}

/** Mark shortcut scan as done. Returns updated state. */
export function markShortcutScanDone(): OnboardingState {
  const prev = loadOnboardingState() ?? DEFAULT_ONBOARDING_STATE;
  const state: OnboardingState = { ...prev, shortcutScanDone: true };
  saveOnboardingState(state);
  return state;
}

/** Mark bookmark scan as done. If both scans done, auto-complete. Returns updated state. */
export function markBookmarkScanDone(): OnboardingState {
  const prev = loadOnboardingState() ?? DEFAULT_ONBOARDING_STATE;
  const bothDone = prev.shortcutScanDone && true;
  const state: OnboardingState = {
    ...prev,
    bookmarkScanDone: true,
    completed: bothDone || prev.completed
  };
  saveOnboardingState(state);
  return state;
}

/** Check if both scan steps are completed (used for "finish" button enable). */
export function areBothScansDone(state: OnboardingState): boolean {
  return state.shortcutScanDone && state.bookmarkScanDone;
}
