# Obsidian 集成 / 待办面板 · 技术可行性评估与设计方案

> 评估日期：2026-06-21
> 评估版本：OrbitStart 0.5.0
> 评估方式：只读代码审查，不修改任何文件，不产生构建产物
> 评估范围：前端 `src/`、Tauri 后端 `src-tauri/src/main.rs`、插件 API、配置、文档、样式

---

## 结论先行（TL;DR）

| # | 问题 | 判断 |
|---|------|------|
| 1 | 这个功能是否值得做？ | **值得**，但必须重新定义范围。 |
| 2 | 是否适合 OrbitStart 当前阶段？ | **适合做"只读入口 + 待办聚合"**；不适合做笔记编辑器。 |
| 3 | 推荐先做哪个最小版本？ | **MVP-A：Obsidian 本地只读索引 + 未完成待办聚合面板**（Phase 0+1）。 |
| 4 | 技术风险 | **低**（Phase 0–2）/ **高**（Phase 4 双向写回）。 |
| 5 | 产品收益 | **中高**（待办聚合是真实痛点，且与"启动工作台"定位天然契合）。 |
| 6 | 是否建议现在就实施？ | **是**，但仅实施 Phase 0–2。Phase 4 双向写回暂缓。 |
| 7 | 第一步应该做什么？ | 在 `src-tauri/src/main.rs` 新增 `scan_obsidian_vault` Tauri 命令 + 一个最小 Markdown 扫描器，在控制台输出未完成 `- [ ]` 任务列表。 |

### 核心建议

1. **不要叫"同步"**。准确命名是 **"Obsidian 本地索引 / 待办聚合"**。OrbitStart 不复制、不上传、不修改 Obsidian vault，只在本地读取 Markdown 文件并在 OrbitStart 内做待办聚合视图。
2. **不做笔记编辑器**。OrbitStart 保持"启动工作台 / 个人效率入口"定位。Obsidian 是编辑器，OrbitStart 是入口和聚合器。两者职责互补。
3. **作为主功能做，而不是插件**。理由：插件 Worker 当前被 `installRuntimeGuards()` 劫持 `fetch` / `importScripts`，且无文件系统访问能力（详见第 1 节）。Vault 扫描必须在 Rust 侧完成，不适合走插件 Worker 通道。但**搜索增强**可以做成插件（trips-search 模式）。
4. **MVP 必须只读**。Phase 4 双向写回是最高风险项，独立评估，不进 MVP。
5. **复用现有能力**：`fs::read_dir` / `fs::read_to_string`（main.rs 已用）、SQLite `trips` 表的模式（可仿照建 `obsidian_notes` / `obsidian_tasks` 表）、`palette-backdrop centered-backdrop` modal 模式、`renderMarkdown()`（src/lib/markdown.ts）、`launch_target()`（已支持 `obsidian://` 协议，因为 `target.contains("://")` 分支会走 rundll32）。

---

## 1. 当前 OrbitStart 架构审查

### 1.1 整体技术栈

| 层 | 技术 | 关键文件 |
|----|------|----------|
| 桌面框架 | Tauri 2 | `src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` |
| 前端 | React 18 + TypeScript + Vite | `src/App.tsx`（主壳，~3170 行）、`src/components/`、`src/lib/` |
| 后端 | Rust | `src-tauri/src/main.rs`（~3900 行单文件） |
| 存储 | SQLite（rusqlite 0.32 bundled） | `%APPDATA%\OrbitStart\orbit.db` |
| 浏览器预览 | localStorage fallback | `src/lib/native.ts` 每个 invoke 都有 try/catch fallback |
| 插件隔离 | Web Worker | `src/plugin/workerRuntime.ts`（565 行） |

### 1.2 应用入口与主界面结构

`src/App.tsx`：
- `ViewId = "dashboard" | "trips" | "settings" | "logs"`（第 129 行）—— 四个一级视图。
- `navItems`（第 1400 行）定义侧栏导航。
- 主壳结构：`<aside class="sidebar">` + `<section class="workspace">` + modal 浮层。
- 视图通过 `activeView === "dashboard" && renderDashboard()` 条件渲染（第 2797–2799 行）。
- `activeViewMeta`（第 737 行）驱动 topbar 标题。
- 设置以 modal 形式弹出（`palette-backdrop centered-backdrop` + `settings-modal-panel`），不是独立路由。

**与 Obsidian 集成的关系**：新增一个 `ViewId = "obsidian"` 一级视图，或作为 dashboard 上的一个面板组件，两种方案都可行。推荐前者（独立视图 + 侧栏入口），因为待办聚合需要足够的展示空间。

### 1.3 数据存储方式

后端 SQLite 表（`init_db`，main.rs 第 276–342 行）：
- `items` / `groups` / `plugin_states` / `plugin_logs` / `settings`（KV）/ `trips`（按 `item_id` 索引，`idx_trips_item_id`、`idx_trips_updated_at`）。

前端 `src/lib/native.ts`：每个 Tauri 命令都有 localStorage fallback（`orbitstart.browser.items` / `orbitstart.browser.snapshot` / `orbitstart.browser.trips`），保证浏览器预览模式可用。

**与 Obsidian 集成的关系**：
- 新建 `obsidian_vaults`（vault 配置）、`obsidian_notes`（笔记索引）、`obsidian_tasks`（任务索引）三张表，完全仿照 `trips` 表的建表模式。
- 索引表是**缓存性质**——源数据始终是 vault 里的 .md 文件，SQLite 只是加速查询。删除 vault 配置时应级联清理索引（仿照 `delete_item` 级联清理 trips 的模式）。

### 1.4 插件系统 / 扩展接口

两层结构：
1. **核心插件**（`createOrbitPluginHost`，src/plugin/api.ts 第 121 行）：`core-clipboard` / `core-everything` / `core-window-switcher` 等内置插件，直接在主线程注册命令和搜索 provider。
2. **第三方插件**（WorkerPluginRuntime，src/plugin/workerRuntime.ts）：每个插件跑在独立 Web Worker 中，通过 `postMessage` 双向通信。

插件权限模型（main.rs 第 82–85 行、第 3323 行）：`ui:toast` / `storage:plugin` / `settings:plugin` / `trips:read` 等，由宿主侧 `requirePermission()` 强制检查。

**关键约束**：
- Worker 内 `installRuntimeGuards()`（workerRuntime.ts 第 88 行）默认**劫持 `fetch` / `WebSocket` / `importScripts`**，除非插件声明 `net:fetch` 权限。
- Worker **没有文件系统访问能力**。`host-request` 通道（第 519 行 `resolveHostRequest`）只暴露 `storage:*` / `settings:*` / `trips:*` 三类 API，没有 `fs:*`。
- 插件能做的最高级别操作是注册命令和搜索 provider，UI 仍由核心渲染。

**与 Obsidian 集成的关系**：
- **Vault 扫描、Markdown 解析、索引建立必须在 Rust 侧做**，不能做成 Worker 插件。Worker 既不能读文件，又不能多线程跑长任务。
- **搜索增强可以做成插件**（仿照 `trips-search`）：注册一个 `obsidian-search` provider，通过新增的 `obsidian:search` host API 调用 Rust 侧的索引查询。这是符合现有架构的扩展点。
- **UI 面板必须核心实现**，因为 Worker 无法注入 DOM。

### 1.5 Native / Tauri 能力

已注册的 Tauri 命令（main.rs 第 3863–3901 行，共 ~35 个）：`catalog_snapshot` / `create_item(s)` / `pick_resource_input` / `launch_item/target` / `scan_shortcuts` / `scan_browser_bookmarks` / `list/create/update/mark_viewed/delete/search_trips` / `trip_count_for_items` / `set_plugin_enabled` / `read_plugin_runtime` / `export/import_catalog_json` / `open_data_directory` / `open_aux_window` / `get/set_autostart_enabled` 等。

文件系统访问（main.rs 中已有的 `std::fs` 调用）：
- `fs::read_dir`（第 723、1646、2771 行）—— 目录遍历，用于扫描快捷方式、浏览器书签。
- `fs::read_to_string`（第 732、1655、795、818、3007、3090 行）—— 读文件内容，用于解析 manifest、浏览器书签 JSON。
- `fs::read`（第 1827 行）—— 读二进制，用于图标。
- `canonicalize`（在 `validated_plugin_id` / `local_plugin_dir` 中用于路径防穿越）。

**没有的能力**：
- 文件监听（`notify` crate 未在 Cargo.toml 中）。
- Tauri fs plugin（`tauri.conf.json` 无 fs scope 配置，capabilities/default.json 无 fs 权限）。
- Tauri dialog plugin（`pick_folder_path` 第 1802 行是用 PowerShell + `System.Windows.Forms.FolderBrowserDialog` 实现的，不是 rfd）。

**与 Obsidian 集成的关系**：
- **读取 vault 目录：零新增依赖**。直接用 `fs::read_dir` + `fs::read_to_string`，和现有 `scan_shortcuts` 完全同构。
- **选 vault 路径：零新增依赖**。复用 `pick_folder_path()`（main.rs 第 1802 行），只需新增一个 Tauri 命令 `pick_obsidian_vault_path` 包一层。
- **打开 Obsidian 文件：零新增依赖**。`launch_target()`（第 2693 行）已支持任意 `://` 协议——`obsidian://open?vault=xxx&file=yyy` 会走 `rundll32 url.dll,FileProtocolHandler` 分支直接打开。也可以用 `explorer.exe path\to\note.md` 打开系统默认编辑器。
- **文件监听（Phase 3）：需要新增 `notify = "6"` 依赖**。这是 Phase 3 才需要，MVP 不做。

### 1.6 UI 是否适合增加"任务/待办/Obsidian 面板"

非常适合。证据：
- `trips` 视图（renderTripsPage，App.tsx 第 1668 行）已经是一个"卡片网格 + 搜索 + KPI + 空状态"的完整模板，Obsidian 待办面板可以高度复用这个结构。
- `surface-panel` / `kpi-grid` / `trip-result-card` / `trip-result-head` / `trip-chip` / `trip-status` / `search-shell` / `empty-state` 这些 class 都是现成的，可直接套用或派生。
- `palette-backdrop centered-backdrop` modal 模式（App.tsx 第 3147 行）用于编辑/详情弹窗，已验证可跨主题工作。
- `page-layout`（styles.css 第 1509 行）+ `kpi-grid` 是标准页面骨架。

**结论**：UI 层零阻力，主要是写新的 `renderObsidianPage()` + 几个 `obsidian-*` class。

### 1.7 关键文件清单（按与 Obsidian 集成的相关性排序）

| 文件 | 当前行数 | 与 Obsidian 集成的关系 |
|------|----------|------------------------|
| `src-tauri/src/main.rs` | ~3900 | **核心改造点**：新增 `scan_obsidian_vault` / `list_obsidian_tasks` / `pick_obsidian_vault_path` / `open_obsidian_note` 等 Tauri 命令；新增 `obsidian_vaults` / `obsidian_notes` / `obsidian_tasks` 三张表；新增 Markdown 扫描器（Rust 侧）。 |
| `src/lib/native.ts` | ~645 | 新增 `scanObsidianVault` / `listObsidianTasks` / `pickObsidianVaultPath` / `openObsidianNote` 等前端桥接函数，每个带 localStorage fallback。 |
| `src/types.ts` | ~186 | 新增 `ObsidianVaultConfig` / `ObsidianNoteIndex` / `ObsidianTask` / `ObsidianTaskPriority` 等类型。 |
| `src/App.tsx` | ~3170 | 新增 `ViewId = "obsidian"`；新增 `renderObsidianPage()`；在 `navItems` 加侧栏入口；在 `activeViewMeta` 加元数据；可能新增 `renderObsidianSettings()` 设置 vault 路径。 |
| `src/lib/markdown.ts` | ~117 | **可复用**：已有 `renderMarkdown()`，但只用于渲染 HTML。Obsidian 任务提取需要单独的解析器（提取 `- [ ]` / frontmatter / 标签），不能直接复用这个渲染器。 |
| `src/lib/searchEngine.ts` | ~450+ | 命令面板集成点：`buildSortedResults` 的 `extraPluginResults` 参数（第 398 行）可注入 Obsidian 任务搜索结果。 |
| `src/plugin/workerRuntime.ts` | 565 | 若做 `obsidian-search` 插件，需在 `resolveHostRequest`（第 519 行）新增 `obsidian:search` / `obsidian:open` 两个 host API。 |
| `src/plugin/api.ts` | 184 | 若做 `obsidian-search` 插件，仿照 `core-everything` 注册 search provider。 |
| `src/styles.css` | ~6300+ | 新增 `.obsidian-page` / `.obsidian-task-card` / `.obsidian-task-checkbox` / `.obsidian-vault-config` 等 class，复用 `kpi-grid` / `surface-panel` / `trip-result-card` 模式。 |
| `src-tauri/tauri.conf.json` | 46 | **无需改动**（除非 Phase 3 加 fs scope）。 |
| `src-tauri/capabilities/default.json` | 22 | **无需改动**（所有文件操作走自定义 Tauri 命令，不走 fs plugin）。 |
| `src-tauri/Cargo.toml` | 17 | **MVP 无需改动**；Phase 3 加 `notify = "6"`。 |
| `docs/PLUGIN_API.md` / `docs/PLUGIN_DEVELOPMENT.md` | — | 若做 `obsidian-search` 插件，需补充 `obsidian:search` host API 文档。 |

---

## 2. "Obsidian 同步"概念澄清

"同步"这个词有误导性。下面把可能的能力拆成 A/B/C/D 四档，逐一评估。

### A. 只读读取 Obsidian Vault

**能力**：扫描用户指定目录下的 `.md` 文件，提取标题/路径/标签/frontmatter/`- [ ]`/`- [x]`/最近修改时间。

| 维度 | 评估 |
|------|------|
| 技术难度 | **低**。`fs::read_dir` 递归 + `fs::read_to_string` + 正则/简单解析。main.rs 已有同构代码（`scan_shortcuts`）。 |
| 风险 | **极低**。只读，不碰源文件。 |
| 收益 | **中**。本身不直接产生用户价值，但是 B/C 的基础。 |
| 推荐 | **必做**（Phase 0）。 |

### B. Obsidian 快速入口

**能力**：在 OrbitStart 中展示常用笔记/最近笔记/任务来源，点击通过 `obsidian://open` 或系统默认编辑器打开。

| 维度 | 评估 |
|------|------|
| 技术难度 | **低**。`launch_target()` 已支持 `obsidian://` 协议（`target.contains("://")` 分支）。UI 复用 `trip-result-card`。 |
| 风险 | **极低**。只读 + 启动外部程序，和现有 `launch_item` 同构。 |
| 收益 | **中高**。这是"启动工作台"定位的核心价值——快速跳转。 |
| 推荐 | **做**（Phase 1）。 |

### C. 待办聚合面板

**能力**：从 Markdown 提取待办，形成 OrbitStart 内部任务视图（今日/全部未完成/按文件分组/按标签分组/按优先级排序/点击跳转）。

| 维度 | 评估 |
|------|------|
| 技术难度 | **中**。需要 Markdown 解析、任务提取规则、索引缓存、聚合查询 UI。 |
| 风险 | **中**。任务提取规则的兼容性是主要风险（Obsidian Tasks 插件语法、Dataview 语法不统一）。 |
| 收益 | **高**。这是用户真实痛点——"我记得在某篇笔记里写过 TODO，但找不到"。 |
| 推荐 | **做**（Phase 1 做 MVP 子集，Phase 2 增强）。 |

### D. 双向写回 Obsidian

**能力**：在 OrbitStart 中勾选待办，自动修改原 Markdown 文件的 `- [ ]` → `- [x]`。

| 维度 | 评估 |
|------|------|
| 技术难度 | **高**。需要精确行号定位、文件重写、并发冲突处理（用户同时在 Obsidian 中编辑）、备份机制。 |
| 风险 | **高**。误改、损坏用户笔记是不可逆的。Obsidian 用户对笔记完整性极其敏感。 |
| 收益 | **中**。体验上有提升，但用户也可以直接在 Obsidian 中勾选。 |
| 推荐 | **暂缓**。MVP 不做。Phase 4 独立评估，需要备份 + 确认 + 可撤销三重保险。 |

### MVP 推荐组合

**MVP = A + B + C 的最小子集**：
- A：全量扫描 vault，提取笔记元数据 + 未完成待办。
- B：点击任务 → `obsidian://open` 跳转。
- C：单一视图（全部未完成待办，按文件分组），不做筛选/排序/标签。

**不做**：D（双向写回）、Dataview 语法、Obsidian Tasks 完整语法、文件监听、多 vault、笔记内容编辑。

---

## 3. 技术可行性分析

### 3.1 文件系统访问

| 问题 | 结论 |
|------|------|
| 当前项目是否可以读取本地目录？ | **可以**。main.rs 已用 `fs::read_dir`（第 723、1646、2771 行）递归遍历目录。 |
| Tauri 是否需要新增权限？ | **不需要**。所有文件操作走自定义 `#[tauri::command]`，不走 Tauri fs plugin，capabilities/default.json 无需改动。 |
| 用户如何选择 Obsidian vault 路径？ | 复用 `pick_folder_path()`（main.rs 第 1802 行），包一层 `#[tauri::command] fn pick_obsidian_vault_path()`。零新增依赖。 |
| 是否需要保存 vault 配置？ | **是**。存 SQLite `obsidian_vaults` 表（仿 `settings` KV 表或 `groups` 表结构）。字段：id / name / path / enabled / last_indexed_at / file_count / task_count。 |
| Windows 路径、中文路径、空格路径是否有风险？ | **低风险**。`scan_shortcuts` 已处理中文路径（PowerShell 脚本设置 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`）。Rust 侧 `PathBuf` 原生支持 UTF-8。唯一注意点：`obsidian://open` URL 中的 `file=` 参数需要 URL 编码（Obsidian 接受 `vault name/file path` 或 `file path`，中文需 encode）。 |

### 3.2 Markdown 解析

| 方案 | 评估 | 推荐 |
|------|------|------|
| 简单正则 | 速度快、零依赖。能处理 `- [ ]` / `- [x]` / `#tag` / `📅 2026-06-21`。无法处理嵌套结构。 | **MVP 推荐**。 |
| Markdown AST parser（如 `pulldown-cmark`） | 严谨，能处理嵌套。但增加 Rust 依赖，且 Obsidian 的 Wiki 链接 `[[xxx]]` / 行内字段 `key:: value` 不是标准 Markdown 语法，AST parser 也不认。 | Phase 2 再考虑。 |
| frontmatter parser | YAML frontmatter（`---` 包裹）需要单独解析。可用 `serde_yaml` 或手写简单解析。 | **MVP 手写**（frontmatter 格式固定，正则可解）。 |
| Dataview 语法 | Dataview 是 Obsidian 插件的查询语言（```dataview``` 代码块），本质上是一个查询引擎。**OrbitStart 不应实现 Dataview**，这是 Obsidian 插件的职责。 | **不做**。 |
| Obsidian Tasks 语法 | Tasks 插件用 emoji 标记（`📅` 截止 / `⏫` 🔺 🔼 优先级 / `✅ 2026-06-21` 完成日期 / `🔁` 重复）。这些是行内标记，正则可解。 | **MVP 只识别 `📅` 和 `⏫/🔺`**，其余 Phase 2。 |
| 中文内容、emoji、特殊符号 | Rust `String` 是 UTF-8，无问题。正则用 `char` 边界即可。 | 无风险。 |

**推荐方案**：MVP 用纯 Rust 手写扫描器 + 正则，零新增依赖。结构：
1. `extract_frontmatter(content) -> Option<YamlLike>` —— 提取 `---` 包裹的 frontmatter（手写 KV 解析，不引入 serde_yaml）。
2. `extract_tasks(content, file_path) -> Vec<ObsidianTask>` —— 逐行扫描，匹配 `^\s*[-*]\s+\[(?<status>[ xX])\]\s+(?<text>.+)$`。
3. `extract_tags(text) -> Vec<String>` —— 匹配 `#(?<tag>[\w\u4e00-\u9fa5/-]+)`。
4. `extract_due_date(text) -> Option<String>` —— 匹配 `📅\s*(?<date>\d{4}-\d{2}-\d{2})`。
5. `extract_priority(text) -> Option<Priority>` —— 匹配 `⏫`（high）/ `🔼`（medium）/ `🔻`（low）。

### 3.3 任务识别规则

**MVP 支持（Phase 0–1）**：

```
- [ ] 任务内容              ← 未完成
- [x] 任务内容              ← 已完成
- [ ] 任务内容 #tag         ← 标签
- [ ] 任务内容 📅 2026-06-21 ← 截止日期
- [ ] 任务内容 ⏫            ← 高优先级
```

**Phase 2 增加**：

```
- [ ] 任务内容 🔼           ← 中优先级
- [ ] 任务内容 🔻           ← 低优先级
- [ ] 任务内容 ✅ 2026-06-21 ← 完成日期
- [ ] 任务内容 🔁 every week ← 重复规则
due:: 2026-06-21            ← Dataview 行内字段（仅识别，不查询）
priority:: high             ← Dataview 行内字段
```

**不做**：
- Dataview 代码块查询（```dataview```）—— 这是查询引擎，不是任务标记。
- Tasks 插件的复杂重复规则解析。
- 嵌套子任务（缩进下的 `- [ ]`）—— MVP 只识别顶层任务，避免误判引用块内的伪任务。

### 3.4 索引与性能

| 问题 | 结论 |
|------|------|
| 每次启动全量扫描是否可行？ | **小型 vault（<500 文件）可行**，预计 <1s。**大型 vault（5000+）不建议每次全扫**，需要缓存。 |
| 是否需要缓存？ | **需要**。缓存到 SQLite `obsidian_notes` / `obsidian_tasks` 表。键：file_path + modified_at，增量更新只扫描 `modified_at` 变化的文件。 |
| 是否需要增量更新？ | **Phase 1 用"启动时全量 + 按 mtime 跳过未变"**。Phase 3 再上文件监听。 |
| 是否使用文件监听？ | **Phase 3 才上**。需要新增 `notify = "6"` crate。MVP 不做，用户手动点"重新扫描"按钮。 |
| 大型 vault（5000+ Markdown）会不会卡顿？ | **会，如果在主线程扫描**。必须在 Tauri 命令中用 `tokio::task::spawn_blocking` 或 `tauri::async_runtime` 包一层，前端显示进度。5000 文件 × 平均 5KB = 25MB 文本，Rust 侧扫描 + 解析预计 2–5s，可接受。 |
| 索引应该放在哪里？ | **SQLite**（`orbit.db`，和现有数据同库）。不用 JSON（不适合结构化查询）、不用内存缓存（重启丢失）。 |
| 是否使用 SQLite / JSON / 内存缓存？ | **SQLite 持久化 + 内存查询缓存**。前端首次加载 `list_obsidian_tasks` 后缓存在 React state，搜索/筛选在前端做（数据量 <10000 时无需每次查库）。 |

### 3.5 数据安全

| 问题 | 结论 |
|------|------|
| 默认只读是否更安全？ | **是**。MVP 强制只读，不提供任何写回能力。 |
| 是否应该避免上传任何笔记内容？ | **绝对**。OrbitStart 本身就是本地优先应用，无云服务。Obsidian 集成不改变这一点。需在 UI 明确告知"数据只在本地处理"。 |
| 是否应该明确告诉用户数据只在本地处理？ | **是**。在 vault 配置卡片下方显示提示："OrbitStart 只读取你的 vault，不会上传任何笔记内容。所有索引存储在本地 SQLite。" |
| 如果未来支持写回，如何避免误改文件？ | Phase 4 的硬性要求：(1) 写回前自动备份原文件到 `%APPDATA%\OrbitStart\backups\obsidian\`；(2) 写回前弹窗确认；(3) 5 秒内可撤销；(4) 只改对应行，不重写整个文件（用行号定位 + 字符串替换）。 |
| 是否需要备份机制？ | **MVP 不需要**（只读）。Phase 4 必须有。 |

---

## 4. 产品定位判断

### 4.1 会不会偏离"启动工作台"定位？

**不会，前提是范围控制得当**。

OrbitStart 的定位是"本地资源启动工作台 / 个人效率入口"。它的核心价值是**汇聚 + 快速跳转**，不是**编辑**。Obsidian 集成如果做成"只读索引 + 待办聚合 + 快速跳转"，完全符合这个定位——本质上是把 Obsidian vault 当作一种新的"资源类型"纳入 OrbitStart 的聚合层。

**会偏离定位的情况**（必须避免）：
- 做成 Markdown 编辑器（和 Obsidian 重复）。
- 做成完整笔记管理器（文件夹树、标签管理、笔记搜索全集）。
- 做成 Dataview 替代品。
- 做双向同步（变成"OrbitStart 的笔记 + Obsidian 的笔记"两套数据源）。

### 4.2 推荐产品定位

> **OrbitStart 不直接替代 Obsidian，而是作为 Obsidian 笔记和待办的快速入口与聚合面板。**

具体边界：
- OrbitStart **读取** vault，不复制、不上传、不修改（MVP）。
- OrbitStart **聚合**待办，不管理笔记结构。
- OrbitStart **跳转**到 Obsidian，不在内部编辑。
- Obsidian 仍是唯一的笔记编辑器，OrbitStart 是它的"待办仪表盘"。

### 4.3 它应该是主功能还是插件功能？

**混合**：
- **核心功能**：vault 配置、扫描索引、待办聚合面板、跳转 Obsidian。这些必须在核心实现（Rust + React），因为插件 Worker 无文件系统访问能力。
- **插件功能**：命令面板搜索增强。仿照 `trips-search`，做一个 `obsidian-search` 插件，通过新增的 `obsidian:search` host API 查询索引，在命令面板中显示匹配任务。

### 4.4 应该叫什么？

**不要叫"同步"**。推荐命名：
- 功能名：**"Obsidian 本地索引"** 或 **"Obsidian 待办聚合"**。
- 视图名：**"Tasks"** 或 **"Obsidian Tasks"**（侧栏入口）。
- 设置项：**"Obsidian Vault"**（设置页的一个 section）。

### 4.5 和现有功能如何融合？

| 现有功能 | 融合方式 |
|----------|----------|
| 资源中心（items） | vault 本身可以作为一个 `OrbitItem`（kind: "folder"，target: vault 路径）加入资源中心，方便从 dashboard 直接打开 vault。 |
| 搜索引擎 | 命令面板 `buildSortedResults` 的 `extraPluginResults` 注入 Obsidian 任务搜索结果。 |
| Trips 插件 | 概念上不冲突——Trips 是"资源使用提示"，Obsidian Tasks 是"笔记里的待办"。两者独立。 |
| 主题工作室 | 复用 CSS 变量，新 UI 自动适配所有主题。 |
| 插件系统 | `obsidian-search` 作为第三方插件，扩展命令面板。 |
| 备份导入导出 | MVP 不纳入 JSON 备份（索引是缓存，可重建）。Phase 2 可考虑导出 vault 配置。 |

---

## 5. 推荐 MVP 方案

用户提出的 MVP 基本合理，我做几点调整：

### 用户原方案

1. 设置页新增 Obsidian Vault 路径配置
2. 只读扫描 Markdown 文件
3. 提取未完成待办
4. 新增"Obsidian 待办"面板
5. 点击任务打开对应 Obsidian 文件
6. 不修改 Markdown 文件
7. 不做复杂双向同步
8. 不支持完整 Dataview 查询

### 我的调整版 MVP

**保留**：1–8 全部保留。

**新增**（低成本的增强）：
9. **支持多 vault 配置**（数据结构上预留，UI 只展示一个，不增加复杂度）。
10. **任务卡片显示来源文件名 + 截止日期 + 优先级**（已在解析阶段提取，展示成本极低）。
11. **"重新扫描"按钮**（替代文件监听，用户手动触发）。
12. **空状态/错误状态设计**（vault 未配置 / 路径不存在 / 无任务三种）。

**明确不做**（避免范围蔓延）：
- 不做笔记内容预览（只显示任务文本，不显示笔记正文）。
- 不做笔记全文搜索（只搜任务文本）。
- 不做标签筛选 UI（数据有，但 MVP 不做筛选器）。
- 不做"最近笔记"/"常用笔记"入口（Phase 2）。

### MVP 验收标准

1. 用户能在设置页添加/删除 vault 路径。
2. 点击"扫描"后，前端显示扫描进度（文件数 / 任务数）。
3. 侧栏"Tasks"视图显示所有未完成待办，按来源文件分组。
4. 每个任务卡片显示：复选框（只读）、任务文本、来源文件名、截止日期（如有）、优先级（如有）。
5. 点击任务卡片 → 调用 `obsidian://open?vault=xxx&file=yyy` 打开 Obsidian。
6. vault 路径不存在时显示错误状态，不崩溃。
7. vault 无任务时显示空状态。
8. 索引存储在 SQLite，重启后无需重新扫描（除非用户手动触发）。

---

## 6. UI / 交互设计方案

### 6.1 放在哪里？

**独立一级视图**（侧栏入口），不复用 trips 视图。

理由：
- 待办聚合需要足够的垂直空间。
- 和 trips（资源提示）是不同概念，混在一起会让用户困惑。
- 侧栏新增一个 "Tasks" 入口，icon 用 `CheckSquare` 或 `ListTodo`（lucide-react 已有）。

```
侧栏：
  Dashboard
  Trips
  Tasks      ← 新增
  Settings
  Logs
```

### 6.2 页面结构（仿 renderTripsPage）

```tsx
<section className="page-layout obsidian-page">
  {/* KPI 区 */}
  <section className="kpi-grid obsidian-kpis">
    <article className="kpi-card">未完成任务数</article>
    <article className="kpi-card">今日到期</article>
    <article className="kpi-card">已配置 vault 数</article>
    <article className="kpi-card">索引文件数</article>
  </section>

  {/* 工具栏 */}
  <section className="surface-panel obsidian-surface">
    <div className="section-head">
      <div>
        <p className="eyebrow">Obsidian Tasks</p>
        <h2>待办聚合</h2>
      </div>
      <div className="obsidian-toolbar">
        <button onClick={rescan}>重新扫描</button>
        <button onClick={openVaultSettings}>配置 Vault</button>
      </div>
    </div>

    {/* 任务列表，按文件分组 */}
    <div className="obsidian-task-groups">
      {groups.map(group => (
        <div className="obsidian-task-group">
          <h3>{group.fileName} <span>{group.taskCount}</span></h3>
          {group.tasks.map(task => <ObsidianTaskCard />)}
        </div>
      ))}
    </div>

    {/* 空状态 / 错误状态 */}
    {emptyState}
  </section>
</section>
```

### 6.3 任务卡片设计

```
┌─────────────────────────────────────────────────┐
│ ☐  任务文本（可点击跳转）              [⏫] [📅 06-21] │
│    📄 Daily/2026-06-21.md  ·  #project-x         │
└─────────────────────────────────────────────────┘
```

- 复选框：**只读**（MVP 不支持勾选）。点击整个卡片跳转 Obsidian。
- 任务文本：点击跳转 `obsidian://open?vault=xxx&file=yyy`。
- 优先级：`⏫` / `🔼` / `🔻` emoji 直接显示。
- 截止日期：`📅 2026-06-21` 格式，今日到期高亮（warning 色）。
- 来源文件：相对 vault 的路径，灰色小字。
- 标签：`#tag` chip，灰色。

### 6.4 空状态 / 错误状态

| 状态 | 设计 |
|------|------|
| 未配置 vault | 大图标 + "还没有配置 Obsidian Vault" + "去设置" 按钮。 |
| 路径不存在 | warning 图标 + "Vault 路径不存在：{path}" + "重新配置" 按钮。 |
| 无读取权限 | warning 图标 + "无法读取 Vault 目录" + 提示检查权限。 |
| 无任务 | 空状态插画 + "这个 Vault 里暂时没有未完成任务" + "打开 Obsidian" 按钮。 |
| 扫描中 | 进度条 + "正在扫描 {fileCount} 个文件..." |

### 6.5 是否支持搜索和筛选？

**MVP 不做**。Phase 2 加：
- 搜索框（搜任务文本，复用 `search-shell` class）。
- 筛选器：全部 / 今日 / 本周 / 按标签 / 按优先级。
- 排序：截止日期 / 优先级 / 文件名。

### 6.6 设置页 vault 配置

在设置页新增一个 section "Obsidian"：

```
设置 → Obsidian
  ┌────────────────────────────────────────┐
  │ 已配置的 Vault                          │
  │                                         │
  │ 📁 MyVault     D:\Obsidian\MyVault  [扫描] │
  │ 📁 Work         E:\Notes\Work        [扫描] │
  │                                         │
  │ [+ 添加 Vault]                          │
  │                                         │
  │ ⚠️ OrbitStart 只读取你的 vault，不会上传  │
  │    任何笔记内容。所有索引存储在本地。      │
  └────────────────────────────────────────┘
```

---

## 7. 数据结构设计

基于项目现有类型风格（`src/types.ts`），调整如下：

```ts
// src/types.ts 新增

export type ObsidianTaskPriority = "low" | "medium" | "high";

export interface ObsidianVaultConfig {
  id: string;                    // 如 "vault-{hash(path)}"
  name: string;                  // 用户可读名，默认取目录名
  path: string;                  // 绝对路径
  enabled: boolean;              // 是否参与扫描
  lastIndexedAt?: string;        // ISO 时间戳，最近一次扫描完成时间
  fileCount?: number;            // 已索引的 .md 文件数
  taskCount?: number;            // 已索引的任务数（含已完成）
  openInObsidian?: boolean;      // 点击任务时用 obsidian:// 还是系统编辑器，默认 true
}

export interface ObsidianNoteIndex {
  id: string;                    // 如 "{vaultId}-{hash(relativePath)}"
  vaultId: string;
  title: string;                 // 第一个 H1，或文件名（去扩展名）
  filePath: string;              // 绝对路径
  relativePath: string;          // 相对 vault 的路径
  tags: string[];                // 从正文 #tag 提取
  frontmatter?: Record<string, unknown>;  // YAML frontmatter（简化解析）
  modifiedAt: string;            // 文件 mtime，ISO 时间戳
  indexedAt: string;             // 索引时间
}

export interface ObsidianTask {
  id: string;                    // 如 "{noteId}-L{lineNumber}"
  vaultId: string;
  noteId: string;
  filePath: string;              // 冗余存储，方便跳转
  relativePath: string;          // 相对 vault，用于 obsidian://open 的 file 参数
  lineNumber: number;            // 1-based，用于精确跳转
  rawText: string;               // 原始行文本（含 `- [ ]`）
  text: string;                  // 去除标记后的任务文本
  completed: boolean;
  tags: string[];
  dueDate?: string;              // ISO 日期 "2026-06-21"
  priority?: ObsidianTaskPriority;
  completedAt?: string;          // 从 ✅ 提取（Phase 2）
  // 不存 createdAt —— Markdown 任务没有可靠的创建时间
  modifiedAt: string;            // 文件 mtime
}
```

### 设计理由

1. **`id` 用 hash 而非 UUID**：和项目现有 `make_id()` 模式一致（main.rs 中 `make_id("group", title)`），可读且幂等。
2. **`filePath` 在 task 中冗余存储**：避免查询时 join notes 表，性能更好。
3. **`relativePath` 必须有**：`obsidian://open?vault=MyVault&file=Daily/2026-06-21` 需要相对路径。
4. **`lineNumber` 1-based**：Obsidian URL 支持 `line` 参数（`obsidian://open?vault=xxx&file=yyy&line=10`）。
5. **不存 `createdAt`**：Markdown 任务没有可靠的创建时间，frontmatter 的 `created` 不可靠（用户可能手动改）。
6. **`frontmatter` 用 `Record<string, unknown>`**：MVP 只解析简单 KV，不强类型化。
7. **不建 `ObsidianTag` 表**：标签直接存在 notes/tasks 的 `tags` 字段（JSON 数组），和 trips 表的 `tags` 字段同构。Phase 2 若做标签筛选再考虑独立表。

### SQLite 表结构（Rust 侧）

```sql
CREATE TABLE IF NOT EXISTS obsidian_vaults (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_indexed_at TEXT,
    file_count INTEGER DEFAULT 0,
    task_count INTEGER DEFAULT 0,
    open_in_obsidian INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS obsidian_notes (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    frontmatter_json TEXT,
    modified_at TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    FOREIGN KEY (vault_id) REFERENCES obsidian_vaults(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_obsidian_notes_vault ON obsidian_notes(vault_id);
CREATE INDEX IF NOT EXISTS idx_obsidian_notes_modified ON obsidian_notes(modified_at DESC);

CREATE TABLE IF NOT EXISTS obsidian_tasks (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    tags_json TEXT NOT NULL DEFAULT '[]',
    due_date TEXT,
    priority TEXT,
    completed_at TEXT,
    modified_at TEXT NOT NULL,
    FOREIGN KEY (note_id) REFERENCES obsidian_notes(id) ON DELETE CASCADE,
    FOREIGN KEY (vault_id) REFERENCES obsidian_vaults(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_obsidian_tasks_completed ON obsidian_tasks(completed);
CREATE INDEX IF NOT EXISTS idx_obsidian_tasks_due ON obsidian_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_obsidian_tasks_vault ON obsidian_tasks(vault_id);
```

---

## 8. 实现路线

### Phase 0：可行性验证（1–2 天）

**目标**：证明能读 vault、能提取任务，在控制台输出。

**任务**：
1. `src-tauri/src/main.rs` 新增 `scan_obsidian_vault(path: String) -> Result<ObsidianVaultSnapshot, String>` Tauri 命令，内部用 `fs::read_dir` 递归 + `fs::read_to_string` + 手写正则提取 `- [ ]` / `- [x]`。
2. `src/lib/native.ts` 新增 `scanObsidianVault(path)` 桥接函数。
3. 临时在 dashboard 加一个按钮，点击调用 `scanObsidianVault`，`console.log` 结果。

**验收**：选定一个真实 vault，控制台正确输出任务列表。

**风险**：极低。

### Phase 1：只读 MVP（3–5 天）

**目标**：用户可用的最小版本。

**任务**：
1. Rust 侧：建三张表（`obsidian_vaults` / `obsidian_notes` / `obsidian_tasks`）。
2. Rust 侧：新增命令 `pick_obsidian_vault_path` / `add_obsidian_vault` / `remove_obsidian_vault` / `list_obsidian_vaults` / `scan_obsidian_vault`（带索引持久化）/ `list_obsidian_tasks`（查询未完成）/ `open_obsidian_note`（构造 `obsidian://open` URL 并调用 `launch_target`）。
3. 前端：`src/types.ts` 加类型；`src/lib/native.ts` 加桥接函数。
4. 前端：`src/App.tsx` 加 `ViewId = "obsidian"`，新增 `renderObsidianPage()`，新增侧栏入口。
5. 前端：设置页新增 "Obsidian" section，vault 配置 UI。
6. 前端：任务卡片 + 空状态 + 错误状态 + 扫描中状态。
7. `src/styles.css` 新增 `.obsidian-*` class。

**验收**：见第 5 节 MVP 验收标准。

**风险**：低。主要工作量在 UI。

### Phase 2：体验增强（2–3 天）

**目标**：从"能用"到"好用"。

**任务**：
1. 搜索框（搜任务文本）。
2. 筛选器：全部 / 今日 / 本周 / 按标签 / 按优先级。
3. 排序：截止日期 / 优先级 / 文件名。
4. "最近笔记"入口（最近修改的 10 个 .md 文件，点击跳转）。
5. 增量扫描：按 mtime 跳过未变文件。
6. `obsidian-search` 插件：命令面板搜索增强。

**风险**：低。

### Phase 3：高级功能（3–5 天）

**目标**：实时性 + 大 vault 支持。

**任务**：
1. 文件监听：`Cargo.toml` 加 `notify = "6"`，在 `setup()` 中启动 watcher，vault 路径变化时增量更新索引。
2. 多 vault 并行扫描：`tokio::task::spawn_blocking`。
3. Obsidian Tasks 完整语法：`✅` / `🔁` / Dataview 行内字段。
4. 大 vault 性能优化：分页加载、虚拟滚动（如果任务数 >1000）。

**风险**：中。文件监听的跨平台行为、Windows 路径监听的一些边角问题需要测试。

### Phase 4：谨慎考虑双向写回（独立评估，3–5 天）

**目标**：在 OrbitStart 中勾选任务 → 写回 Markdown。

**硬性要求**：
1. 写回前自动备份原文件到 `%APPDATA%\OrbitStart\backups\obsidian\{vaultId}\{relativePath}`。
2. 写回前弹窗确认（可在设置中关闭，默认开）。
3. 5 秒内可撤销（toast 带"撤销"按钮）。
4. 只改对应行，不重写整个文件（`String::replace_range` 按 byte offset 替换）。
5. 冲突检测：如果文件的 mtime 与索引时不一致，拒绝写回并提示"文件已被修改，请重新扫描"。
6. 写回后立即重新扫描该文件，更新索引。

**风险**：**高**。这是整个方案中风险最高的部分。建议在 Phase 1–2 上线、用户反馈稳定后再独立评估。如果用户反馈"不需要在 OrbitStart 中勾选"，可以永久不做。

### 推荐执行顺序

```
Phase 0 (1-2天) → Phase 1 (3-5天) → 上线 0.6.0
                                  ↓
                          Phase 2 (2-3天) → 上线 0.7.0
                                          ↓
                                  Phase 3 (3-5天) → 上线 0.8.0
                                                  ↓
                                          Phase 4 独立评估（可能不做）
```

---

## 9. 需要修改或新增的文件

> 以下为建议，不实际修改。

### 新增文件

| 路径 | 用途 |
|------|------|
| `src/components/ObsidianTaskCard.tsx` | 任务卡片组件 |
| `src/components/ObsidianVaultSettings.tsx` | vault 配置 UI（设置页 section） |
| `src/lib/obsidianScan.ts` | 前端侧扫描调度 + 状态管理（可选，也可直接在 App.tsx 内联） |
| `plugins/obsidian-search/main.ts` | 命令面板搜索增强插件（Phase 2） |
| `plugins/obsidian-search/plugin.json` | 插件 manifest（Phase 2） |
| `tests/obsidian-scan-verify.mjs` | 扫描器验证测试（仿 `plugin-runtime-verify.mjs`） |
| `docs/OBSIDIAN_INTEGRATION.md` | 用户文档（如何配置 vault） |

### 修改文件

| 路径 | 改动内容 |
|------|----------|
| `src-tauri/src/main.rs` | 新增 3 张表（`init_db`）+ 7 个 Tauri 命令 + Markdown 扫描器函数 + `obsidian://open` URL 构造器。注册命令到 `generate_handler!`。 |
| `src-tauri/Cargo.toml` | Phase 3 加 `notify = "6"`；MVP 阶段**不改**。 |
| `src/lib/native.ts` | 新增 7 个桥接函数（带 localStorage fallback）。 |
| `src/types.ts` | 新增 4 个类型（`ObsidianVaultConfig` / `ObsidianNoteIndex` / `ObsidianTask` / `ObsidianTaskPriority`）。 |
| `src/App.tsx` | `ViewId` 加 `"obsidian"`；`navItems` 加侧栏入口；`activeViewMeta` 加元数据；新增 `renderObsidianPage()`；设置页加 "Obsidian" section；新增 `obsidianVaults` / `obsidianTasks` state。 |
| `src/plugin/workerRuntime.ts` | Phase 2：`resolveHostRequest` 加 `obsidian:search` / `obsidian:open` 两个 host API。 |
| `src/styles.css` | 新增 `.obsidian-page` / `.obsidian-kpis` / `.obsidian-surface` / `.obsidian-task-groups` / `.obsidian-task-card` / `.obsidian-task-checkbox` / `.obsidian-task-meta` / `.obsidian-vault-list` / `.obsidian-vault-item` / `.obsidian-empty-state` 等 class。 |
| `registry/plugins.json` | Phase 2：加 `obsidian-search` 插件注册。 |
| `README.md` | 功能列表加 "Obsidian 待办聚合"。 |
| `docs/PLUGIN_API.md` | Phase 2：补 `obsidian:search` host API 文档。 |

### 不需要修改的文件

| 路径 | 原因 |
|------|------|
| `src-tauri/tauri.conf.json` | 无需加 fs scope（走自定义命令）。 |
| `src-tauri/capabilities/default.json` | 无需加 fs 权限。 |
| `src/lib/markdown.ts` | 不复用（它是 HTML 渲染器，不是任务提取器）。 |
| `src/lib/searchEngine.ts` | MVP 不改（Phase 2 通过 `extraPluginResults` 注入，不改引擎本身）。 |
| `src/plugin/api.ts` | MVP 不改（Phase 2 才加 `obsidian-search` 插件）。 |

---

## 10. 风险清单

| # | 风险 | 等级 | 规避方案 |
|---|------|------|----------|
| 1 | **误导性命名**："同步"让用户以为是云同步 | 高 | 全文不使用"同步"一词，统一叫"本地索引 / 待办聚合"。UI 明确标注"只读"。 |
| 2 | **隐私风险**：读取用户私人笔记 | 高 | (1) 默认只读，不上传任何内容；(2) UI 明确告知"数据只在本地处理"；(3) vault 配置需用户主动添加，不自动扫描；(4) 不在日志中记录笔记内容。 |
| 3 | **大 vault 扫描性能**（5000+ 文件卡顿） | 中 | (1) 扫描在 `spawn_blocking` 中执行；(2) 按 mtime 增量扫描；(3) 前端显示进度；(4) Phase 3 加文件监听。 |
| 4 | **Markdown 语法复杂**（嵌套、引用块、代码块内的伪任务） | 中 | (1) MVP 只识别顶层 `- [ ]`；(2) 跳过代码块内的任务（` ``` ` 包裹）；(3) 跳过引用块内的任务（`> ` 开头）。 |
| 5 | **Obsidian 插件生态语法不统一**（Tasks vs Dataview vs 用户的自定义） | 中 | (1) MVP 只支持通用 `- [ ]` + 基础 emoji；(2) 不承诺 100% 兼容 Tasks 插件；(3) 文档明确支持范围。 |
| 6 | **双向写回导致文件损坏** | 高 | (1) MVP 不做写回；(2) Phase 4 必须有备份 + 确认 + 撤销 + 冲突检测四重保险。 |
| 7 | **UI 功能膨胀**（从"待办聚合"滑向"笔记管理器"） | 中 | (1) 严格守住"只读 + 聚合 + 跳转"边界；(2) 不做笔记编辑、不做文件夹树、不做全文搜索；(3) 每个新功能先评估是否偏离定位。 |
| 8 | **与 OrbitStart 定位冲突**（变成臃肿的笔记软件） | 中 | (1) 功能定位为"Obsidian 的待办仪表盘"，不是"OrbitStart 的笔记功能"；(2) Obsidian 仍是唯一编辑器。 |
| 9 | **vault 路径变化**（用户移动/重命名 vault 目录） | 低 | (1) 扫描时检测路径不存在，显示错误状态；(2) 提供"重新配置"入口。 |
| 10 | **多 vault 任务冲突**（同名文件在不同 vault） | 低 | (1) 任务 id 带 vaultId 前缀；(2) UI 按 vault 分组（Phase 2）。 |
| 11 | **Obsidian 未安装**（`obsidian://` 协议无响应） | 低 | (1) 检测 `obsidian://` 调用是否失败；(2) 失败时 fallback 到系统默认编辑器打开 .md 文件。 |
| 12 | **并发扫描冲突**（用户同时在 Obsidian 中编辑） | 低 | (1) 只读扫描无冲突；(2) Phase 4 写回时用 mtime 冲突检测。 |

---

## 11. 最终结论

1. **这个功能是否值得做？**
   **值得**。待办聚合是真实痛点（"我记得在某篇笔记里写过 TODO"），且与 OrbitStart"启动工作台 / 个人效率入口"定位天然契合——把 Obsidian vault 当作一种新的资源类型纳入聚合层。

2. **是否适合 OrbitStart 当前阶段？**
   **适合做"只读入口 + 待办聚合"**（Phase 0–2）。不适合做笔记编辑器，不适合做双向同步。0.5.0 刚发布了 Trips 插件（资源提示笔记），Obsidian 集成是"外部笔记的待办聚合"，两者概念互补，不冲突。

3. **推荐先做哪个最小版本？**
   **Phase 0 + Phase 1（MVP-A）**：
   - Rust 侧新增 `scan_obsidian_vault` 命令 + 3 张 SQLite 表 + 手写 Markdown 扫描器。
   - 前端新增 "Tasks" 一级视图 + 设置页 vault 配置 section。
   - 只读，只展示未完成待办，按文件分组，点击跳转 Obsidian。
   - 预计 4–7 天。

4. **技术风险是低、中还是高？**
   - Phase 0–2：**低**。复用现有 `fs::read_dir` / `launch_target` / `palette-backdrop` / `kpi-grid` 等成熟能力，零新增 Rust 依赖。
   - Phase 3：**中**。文件监听有跨平台边角问题。
   - Phase 4：**高**。双向写回可能损坏用户笔记。

5. **产品收益是低、中还是高？**
   **中高**。待办聚合是 Obsidian 用户的真实痛点，且 OrbitStart 的"聚合 + 快速跳转"定位能提供 Obsidian 本身不具备的体验（跨 vault、跨文件的统一任务视图）。

6. **是否建议现在就实施？**
   **是**，但仅实施 Phase 0–2。Phase 4 双向写回暂缓，等 Phase 1–2 上线后根据用户反馈独立评估。

7. **如果实施，第一步应该做什么？**
   **Phase 0 可行性验证**：在 `src-tauri/src/main.rs` 新增一个 `scan_obsidian_vault(path: String) -> Result<Vec<ObsidianTaskRaw>, String>` Tauri 命令，递归扫描指定目录的 `.md` 文件，用正则提取 `- [ ]` 任务，返回原始结果。在 `src/lib/native.ts` 加桥接函数，临时在 dashboard 加按钮调用并 `console.log` 结果。选定一个真实 vault 验证扫描正确性后，再进入 Phase 1 正式开发。

---

> 本报告基于 OrbitStart 0.5.0 代码库的只读审查。所有"修改文件"建议均为方案设计，未实际执行。
