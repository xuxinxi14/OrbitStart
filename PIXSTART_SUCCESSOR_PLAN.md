# PixStart 替代品计划书：OrbitStart

日期：2026-06-10

## 1. 目标判断

PixStart 的核心价值不是复杂功能，而是把“文件、程序、快捷方式、网址、文件夹”集中放进一个可视化启动面板。它的问题也很明显：功能边界窄、插件能力缺失、界面可定制性弱、数据可迁移性不透明，还把一个本应高度个人化的工具做成了封闭收费软件。

新项目暂定名 **OrbitStart**。目标不是逐像素复制 PixStart，而是做一个原创的、可扩展的 Windows 启动工作台：

- PixStart 能做的，MVP 必须全部覆盖。
- Raycast / Flow Launcher / PowerToys Run 的命令面板能力要吸收进来。
- Obsidian 式插件与主题系统作为一等架构，而不是后期补丁。
- 数据本地优先、可导入导出、可备份、可迁移。
- 默认免费自用，后续即使商业化，也不锁基础功能。

## 2. 对标参考

当前主流方向比较清楚：

- Raycast：把启动器升级为“可扩展命令中心”，官方定位是 extendable launcher，并有扩展商店与 Windows beta。
- Flow Launcher：Windows 上成熟的开源启动器，特点是快速搜索、应用/文件启动、社区插件。
- PowerToys Run / Command Palette：微软官方 Windows 快捷启动工具，强调应用、文件、计算、系统命令和插件化。
- Obsidian：本体保持稳定，插件和主题生态极强；插件用 TypeScript，主题用 CSS，这一点适合借鉴。
- Windows Fluent 2 / Mica：Windows 11 桌面应用的视觉基线，Mica 适合长生命周期窗口，Acrylic 适合浮层。

参考来源：

- Raycast: https://www.raycast.com/
- Raycast Windows: https://www.raycast.com/windows
- Flow Launcher: https://github.com/Flow-Launcher/Flow.Launcher
- Flow Launcher plugins: https://www.flowlauncher.com/plugins/
- PowerToys Run: https://learn.microsoft.com/en-us/windows/powertoys/run
- Obsidian developer docs: https://docs.obsidian.md/Home
- Obsidian community plugins/themes: https://community.obsidian.md/
- Fluent 2: https://fluent2.microsoft.design/
- Windows Mica: https://learn.microsoft.com/en-us/windows/apps/design/style/mica
- Tauri architecture: https://v2.tauri.app/concept/architecture/
- Tauri plugin development: https://v2.tauri.app/develop/plugins/

## 3. 产品定位

一句话定位：

> 一个本地优先、插件驱动、键鼠都高效的 Windows 启动工作台。

三类用户：

- 普通用户：把常用软件、文件夹、网站放在一个漂亮面板里。
- 高级用户：用命令面板、快捷键、脚本、动作链提升效率。
- 开发/研究/创作用户：用插件接入 Everything、GitHub、Obsidian、浏览器书签、项目工作区、AI 搜索等工作流。

和 PixStart 的区别：

| 维度 | PixStart | OrbitStart |
| --- | --- | --- |
| 核心启动面板 | 有 | 有，且支持多布局、多密度、多空间 |
| 文件/网址/文件夹/快捷方式 | 有 | 有，支持批量导入、标签、别名、动作链 |
| 搜索 | 基础 | 全局命令面板、模糊搜索、插件搜索源、权重学习 |
| 插件系统 | 基本没有 | 核心架构，随时启用/停用 |
| 主题 | 有限 | Obsidian 风格主题包、CSS 变量、实时预览 |
| 数据迁移 | 不透明 | SQLite + JSON 导入导出 + 自动备份 |
| 自动化 | 弱 | 热键、脚本、动作链、文件监听、计划任务 |
| 账号依赖 | 有会员体系 | 本地优先，云同步可选 |
| 代码结构 | 闭源不可控 | 模块化、插件 API 稳定、可测试 |

## 4. 核心体验设计

OrbitStart 应该有两个入口，而不是只有一个大窗口：

1. 主工作台
   - 类似 PixStart 的可视化网格。
   - 适合整理、浏览、拖拽、分组、批量编辑。
   - 支持“应用程序、文件夹、文档、网址、脚本、动作链、插件视图”。

2. 快速命令面板
   - 类似 Raycast / PowerToys Run。
   - 默认热键建议 `Alt + Space` 或 `Ctrl + Space`，可改。
   - 输入任何内容都能找应用、文件、命令、插件结果、最近使用项。
   - 支持动作：打开、管理员运行、打开所在目录、复制路径、固定、编辑、运行脚本。

主窗口负责“整理”，命令面板负责“快速执行”。这是超越 PixStart 的关键。

## 5. 功能蓝图

### 5.1 PixStart 替代功能

MVP 必须实现：

- 添加应用程序、文件、文件夹、网址。
- 拖拽导入文件/快捷方式。
- 扫描桌面、开始菜单、任务栏常用程序。
- 自动提取图标，支持手动换图标。
- 多级分组：根分类、二级分类、标签。
- 常用、最近打开、收藏。
- 右键菜单：打开、管理员运行、重命名、编辑参数、打开所在目录、删除。
- 批量选择、批量移动、批量删除。
- 全局热键唤起主窗口或命令面板。
- 托盘图标、开机启动、自动隐藏。
- 深色/浅色/跟随系统。
- 本地数据库、备份、导入导出。

### 5.2 超越 PixStart 的核心功能

第一批增强：

- 命令面板：所有功能都可通过命令执行。
- 动作链：一个条目可以执行多个步骤，例如“打开项目文件夹 -> 启动 VS Code -> 打开本地服务 -> 打开浏览器”。
- 工作区模板：为“科研、写作、开发、游戏、视频剪辑”等场景保存一组应用和文件。
- 智能别名：一个项目可有多个搜索名，例如 `pycharm`、`python ide`、`代码`。
- 使用频率排序：最近和常用自动提权，但用户可固定排序。
- 多视图布局：网格、紧凑列表、Spotlight 列表、看板式分组。
- 多显示器友好：记住窗口位置，支持在当前鼠标所在屏幕弹出。
- 图标缓存与图标修复：快捷方式失效时提示修复。
- 便携模式：数据和配置可跟随软件目录移动。

第二批增强：

- Everything 搜索插件。
- 浏览器书签插件。
- Obsidian Vault 快速打开插件。
- Git 项目扫描插件。
- 剪贴板历史插件。
- 窗口切换插件。
- 系统命令插件：关机、重启、网络、音量、蓝牙、显示设置。
- AI 辅助插件：自然语言找项目、自动打标签、根据使用习惯推荐动作链。

## 6. 插件系统设计

插件系统必须从第一天进入架构，不然后期很难补。

### 6.1 插件类型

- Command Plugin：向命令面板注册命令。
- Search Provider：向搜索结果提供数据源，例如 Everything、浏览器书签、文件索引。
- Item Provider：向主工作台提供一种新资源类型。
- View Plugin：添加一个完整页面或侧栏视图。
- Action Plugin：为现有条目增加动作，例如压缩、上传、复制 Markdown 链接。
- Theme Plugin：提供主题、图标包、字体和布局变量。
- Automation Plugin：提供触发器和动作链节点。
- Sync Plugin：提供 WebDAV、Git、OneDrive、本地局域网同步等。

### 6.2 插件包结构

```text
plugins/
  obsidian-vault-opener/
    manifest.json
    main.js
    styles.css
    settings.schema.json
    README.md
```

`manifest.json` 示例：

```json
{
  "id": "obsidian-vault-opener",
  "name": "Obsidian Vault Opener",
  "version": "1.0.0",
  "minAppVersion": "0.1.0",
  "author": "community",
  "description": "Search and open Obsidian vaults and notes.",
  "entry": "main.js",
  "permissions": [
    "fs:read",
    "shell:open",
    "settings:read"
  ],
  "activationEvents": [
    "onCommand:obsidian.openVault",
    "onSearchPrefix:obs"
  ],
  "contributes": {
    "commands": [
      {
        "id": "obsidian.openVault",
        "title": "Open Obsidian Vault"
      }
    ],
    "themes": []
  }
}
```

### 6.3 插件 API 草案

```ts
export default function activate(ctx: PluginContext) {
  ctx.commands.registerCommand({
    id: "demo.sayHello",
    title: "Say Hello",
    run: async () => {
      await ctx.ui.toast("Hello from plugin");
    }
  });

  ctx.search.registerProvider({
    id: "demo.search",
    title: "Demo Search",
    query: async (text) => [
      {
        title: `Result for ${text}`,
        subtitle: "Demo plugin result",
        icon: "search",
        actions: [
          { title: "Copy", run: () => ctx.clipboard.writeText(text) }
        ]
      }
    ]
  });
}
```

核心 API：

- `ctx.commands`: 注册命令。
- `ctx.search`: 注册搜索源。
- `ctx.items`: 注册资源类型、动作、导入器。
- `ctx.hotkeys`: 注册快捷键。
- `ctx.ui`: toast、modal、setting tab、custom view。
- `ctx.fs`: 受权限限制的文件访问。
- `ctx.shell`: 打开文件、启动进程、打开网址。
- `ctx.db`: 插件私有存储。
- `ctx.settings`: 插件设置。
- `ctx.theme`: 主题变量和样式扩展。
- `ctx.automation`: 注册触发器和动作节点。

### 6.4 插件安全模型

不能简单让插件拥有无限系统权限。建议设计：

- 每个插件必须声明权限。
- 首次启用时展示权限说明。
- `shell:execute`、`fs:write`、`network`、`secret` 等高危权限单独确认。
- 插件运行在隔离 Worker 或独立进程中，通过 IPC 调用主程序能力。
- 插件崩溃自动禁用，不拖垮主程序。
- 提供插件日志、性能耗时、错误堆栈。
- 支持安全模式启动：禁用全部第三方插件。

### 6.5 核心插件也走同一套机制

这点很重要。应用自带能力也拆成 Core Plugins：

- Apps：扫描和启动应用。
- Files：文件/文件夹条目。
- Websites：网址收藏。
- Shortcuts：Windows `.lnk` 解析。
- Command Palette：命令面板。
- Hotkeys：全局快捷键。
- Themes：主题管理。
- Backup：备份和导入导出。
- Automation：动作链。

好处是插件 API 会被真实使用，不会变成摆设。

## 7. 主题系统设计

目标是像 Obsidian 一样，主题可以改变气质，但不破坏可用性。

主题包结构：

```text
themes/
  aurora-dark/
    theme.json
    theme.css
    preview.png
```

主题能力：

- CSS 变量：颜色、圆角、阴影、间距、字体、动画速度。
- 布局密度：舒适、标准、紧凑。
- 图标风格：原生图标、圆角图标、纯色符号、品牌图标。
- Mica / Acrylic 开关。
- 暗色、浅色、高对比度。
- 每个工作区可用不同主题。
- 主题实时预览，无需重启。

默认主题建议：

- Orbit Dark：深色主力，低对比背景 + 清晰图标。
- Fluent Light：贴近 Windows 11 设置应用。
- Glass Compact：Mica 背景 + 紧凑网格。
- Focus Mono：文字列表优先，给键盘用户。

## 8. 视觉方向

不要复制 PixStart 当前的“暗色背景 + 大图标网格 + 普通灰色 tab”。可以保留“图标网格启动器”的交互认知，但视觉要原创。

建议方向：

- Windows 11 Fluent 2 作为基线：清晰层级、柔和背景、克制动效。
- 主窗口使用 Mica 背景；弹出菜单和命令面板使用 Acrylic 或纯色半透明面板。
- 左侧是“空间/视图”窄栏，顶部是当前空间、搜索、插件状态。
- 主区域支持网格与列表切换。
- 分组 tab 不做笨重按钮，改为细分段控件或横向 pill navigation。
- 图标卡片保持稳定尺寸，避免 PixStart 那种文字挤压和截断。
- 支持紧凑模式：给真正高频使用者，一屏展示更多项目。

关键屏幕：

- Dashboard：主工作台。
- Command Palette：快速搜索与命令。
- Add Item：添加资源。
- Plugin Manager：插件安装、启用、权限、日志。
- Theme Studio：主题选择、变量微调、实时预览。
- Automation Builder：动作链编辑。
- Import Wizard：扫描桌面/开始菜单/PixStart 迁移。
- Settings：快捷键、数据、备份、性能、安全。

## 9. 技术架构建议

推荐路线：**Tauri 2 + React + TypeScript + Rust native core**。

理由：

- Tauri 适合小体积桌面应用，Rust 负责 Windows 原生能力，Web 前端负责插件/主题生态。
- TypeScript 插件更接近 Obsidian，社区开发门槛低。
- CSS 主题系统天然适合 Web UI。
- Rust 可以稳定处理快捷方式解析、图标提取、全局快捷键、托盘、文件监听、进程启动等系统能力。

备选路线：

- WinUI 3 / WPF + .NET：Windows 原生感更强，但 TypeScript 插件和主题生态会更麻烦。
- Electron：插件生态容易，但体积和资源占用更高，不适合作为 PixStart 这种轻工具的“超越版”。

推荐模块结构：

```text
orbitstart/
  apps/
    desktop/                 # Tauri app
  crates/
    orbit-core/              # Rust domain model
    orbit-shell/             # Windows shell integration
    orbit-indexer/           # file/app indexing
    orbit-plugin-host/       # plugin runtime and IPC
  packages/
    ui/                      # React components
    plugin-api/              # TypeScript plugin SDK
    theme-kit/               # theme tokens
    shared/                  # shared TS types
  plugins/
    core-apps/
    core-files/
    core-websites/
    core-command-palette/
    core-themes/
  docs/
    plugin-dev/
    architecture/
```

## 10. 数据模型草案

本地 SQLite：

```text
items
  id
  type                 # app | file | folder | website | script | action_chain | plugin
  title
  subtitle
  target
  arguments
  working_directory
  icon_id
  group_id
  tags
  aliases
  pinned
  favorite
  launch_count
  last_launched_at
  created_at
  updated_at

groups
  id
  parent_id
  title
  icon
  sort_order
  layout

commands
  id
  plugin_id
  title
  keywords
  enabled

plugins
  id
  version
  enabled
  permissions_granted
  installed_at
  updated_at

themes
  id
  enabled
  variables_json

action_chains
  id
  title
  steps_json

usage_events
  id
  item_id
  command_id
  event_type
  created_at
```

配置文件用 JSON/TOML，便于人工修复：

```text
%APPDATA%/OrbitStart/
  config.json
  orbit.db
  backups/
  plugins/
  themes/
  logs/
  icon-cache/
```

便携模式：

```text
OrbitStart.exe
OrbitStart.Data/
  config.json
  orbit.db
```

## 11. PixStart 迁移策略

如果只是替代使用，迁移很关键。

PixStart 是闭源软件，不能假设数据库格式稳定。可做三种迁移：

1. 通用扫描
   - 扫描桌面、开始菜单、常用目录。
   - 自动分组为应用、网址、文件夹、文档。

2. 用户手动拖拽
   - 支持把 PixStart 中可拖出来的快捷方式或文件拖入 OrbitStart。

3. 高级迁移器
   - 检测 PixStart 配置目录和 SQLite 数据库。
   - 只读分析表结构。
   - 用户确认后导入。
   - 如果字段无法识别，导入为“未分类资源”并保留原始 JSON。

迁移器必须只读 PixStart 数据，不修改原程序。

## 12. MVP 范围

MVP 不要贪多。第一版必须做到“替代 PixStart 日常使用”，插件系统先打通最小闭环。

MVP 功能：

- 主窗口网格。
- 添加文件、文件夹、网址、应用。
- 桌面/开始菜单扫描。
- 图标提取与缓存。
- 分组、标签、收藏、最近使用。
- 右键菜单。
- 命令面板。
- 全局热键。
- 托盘。
- 本地 SQLite。
- 导入导出 JSON。
- 主题变量系统。
- 插件管理器：安装本地插件、启用、停用、权限展示。
- 示例插件：Hello Command、Everything 搜索占位、Obsidian Vault opener。

MVP 不做：

- 云账号。
- 支付。
- 插件商店在线分发。
- AI 深度功能。
- 多端同步。

这样可以避免重蹈 PixStart 的问题：还没把基础体验打磨好，就先做收费和会员。

## 13. 里程碑

### Phase 0：原型验证

目标：确定技术路线和 UI 基本感觉。

交付：

- Tauri 空壳。
- 主窗口 Mica/暗色主题。
- 图标网格假数据。
- 命令面板假数据。
- 插件 API 最小 demo。

验收：

- 冷启动快。
- 窗口不闪烁。
- 搜索框输入流畅。
- 插件能注册一个命令。

### Phase 1：PixStart 替代 MVP

目标：日常可用。

交付：

- SQLite 数据。
- 添加/编辑/删除资源。
- 扫描桌面和开始菜单。
- 启动文件、文件夹、网址、程序。
- 图标缓存。
- 全局热键。
- 托盘。
- 主题切换。
- JSON 导入导出。

验收：

- 能导入用户常用快捷方式。
- 能稳定替代 PixStart 的主启动面板。
- 1000 个条目搜索不卡顿。

### Phase 2：插件化架构成型

目标：核心功能插件化。

交付：

- 插件 manifest。
- 插件启用/停用。
- 插件权限。
- 插件设置页。
- 插件日志。
- Core plugins 改为同一 API。
- 插件开发模板。

验收：

- 禁用 Websites 插件后，网址功能从 UI 中消失但数据保留。
- 第三方插件能添加搜索源和命令。
- 插件异常不会导致主程序崩溃。

### Phase 3：高级效率功能

目标：明显超越 PixStart。

交付：

- 动作链。
- 工作区模板。
- Everything 搜索插件。
- 浏览器书签插件。
- Obsidian 插件。
- 窗口切换插件。
- 剪贴板插件。

验收：

- 一个动作链能启动完整工作环境。
- 命令面板可统一搜索插件结果。
- 插件启停即时生效。

### Phase 4：生态与分发

目标：让别人也能扩展。

交付：

- 插件开发文档。
- 主题开发文档。
- 本地插件打包器。
- 插件/主题目录索引。
- 自动更新。
- 安全模式。

验收：

- 新开发者 10 分钟内写出一个命令插件。
- 用户能安装、启用、禁用、卸载插件。
- 主题包可分享。

## 14. 第一批内置插件建议

必须内置：

- Apps：应用启动。
- Files：文件和文件夹。
- Websites：网址。
- Shortcuts：Windows 快捷方式解析。
- Command Palette：命令面板。
- Hotkeys：全局快捷键。
- Themes：主题。
- Backup：备份和导入导出。

强烈建议：

- Everything：极速文件搜索。
- Browser Bookmarks：浏览器书签。
- Obsidian：Vault 和笔记快速打开。
- Project Launcher：按项目打开 IDE、终端、浏览器、文档。
- Clipboard：剪贴板历史。
- Window Switcher：窗口切换。
- System Controls：系统设置、关机、音量、网络。
- Script Runner：PowerShell、CMD、Python、Node 脚本。

可选增强：

- AI Assistant：自然语言命令。
- OCR Launcher：截图识别文字并搜索。
- Git Workspaces：扫描 Git 仓库。
- Game Library：Steam/Epic 游戏库。
- WebDAV Sync：配置同步。

## 15. 质量标准

性能：

- 冷启动目标：1 秒级。
- 命令面板打开：100ms 级体感。
- 1000 条资源搜索：无明显卡顿。
- 图标提取异步，不阻塞 UI。

可靠性：

- 插件崩溃不影响主程序。
- 数据库自动备份。
- 迁移失败可回滚。
- 快捷方式失效可检测。

可维护性：

- Core 和插件 API 分离。
- 业务逻辑不要写死在 UI 组件里。
- 每个系统能力通过 Rust command 暴露。
- 插件 API 要有类型定义和版本兼容策略。

隐私：

- 默认不联网。
- 不强制账号。
- 插件网络权限必须提示。
- 本地日志不记录敏感参数。

## 16. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| Windows 快捷方式解析复杂 | 导入失败 | Rust/Windows API 封装，保留原始路径 |
| 图标提取慢 | 首次扫描卡顿 | 后台队列 + 缓存 + 占位图标 |
| 全局热键冲突 | 用户体验差 | 冲突检测 + 设置页提醒 |
| 插件权限过大 | 安全风险 | manifest 权限 + IPC 沙箱 + 安全模式 |
| Tauri WebView CSS 与系统视觉差异 | 原生感不足 | 使用 Fluent tokens + Mica + 精细键盘交互 |
| 插件 API 太早冻结 | 后续难改 | 0.x 阶段明确实验 API，稳定后语义化版本 |
| 过早做插件商店 | 分散精力 | 先本地插件和文档，后续再商店 |

## 17. 立即可执行的下一步

建议下一步不是直接写全量程序，而是先做 7 天技术验证：

1. 建 Tauri 2 + React + TypeScript + Rust 项目骨架。
2. 做一个原创暗色主窗口和命令面板。
3. 实现 SQLite 存储和 20 条假资源。
4. 实现打开文件/文件夹/网址/程序。
5. 实现桌面快捷方式扫描。
6. 实现一个插件注册命令的最小 API。
7. 写 `PLUGIN_API.md` 和 `THEME_API.md` 草案。

如果这 7 项跑通，就可以正式进入 MVP；如果 Tauri 在 Windows 原生能力上遇到硬伤，再切回 WinUI 3 / .NET 路线。

