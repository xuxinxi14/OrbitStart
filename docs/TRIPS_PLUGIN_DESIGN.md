# Trips 插件设计方案

> 为 OrbitStart 资源添加使用提示笔记，解决「工具久不用就忘怎么操作」的痛点

> 2026-06-21 实施整理：采用本文推荐的「核心集成 + 插件增强」路线。核心侧已新增
> SQLite `trips` 表、资源卡片 Trips 入口、Trips 页面、TripPanel/TripEditor、Markdown
> 子集渲染和主题 token 样式；插件侧新增 `plugins/trips-search`，通过受控
> `ctx.trips.search/open` Worker API 接入命令面板搜索，不开放泛用 native invoke。

## 一、问题与动机

OrbitStart 把应用、网址、文件、脚本、动作链收纳到统一的资源中心。但收纳只是第一步——用户面临的真实问题是：

- Premiere Pro 两周没用，忘了导出预设怎么调
- 上个月写的 Python 数据脚本，忘了 `--mode batch` 参数的含义
- 某个在线工具网站，忘了登录后要点哪个菜单才能到目标页面
- 批量重命名脚本，忘了是先选规则还是先拖文件夹

每次遗忘都要重新搜索学习，这是隐性的时间浪费。Trips 插件的核心理念是：**在资源旁边记录一小段使用提示，下次打开时一眼就能看到。**

## 二、使用场景

### 场景 1：剪辑软件快捷键记忆

```
资源：Premiere Pro
Trip 1 [shortcut]  常用快捷键
  C 裁剪工具 / V 选择工具 / B 钢笔工具
  Ctrl+K 剪切轨道 / Space 播放暂停
  Q 波纹删除前段 / W 波纹删除后段

Trip 2 [workflow]  导出设置
  文件 → 导出 → 媒体
  格式 H.264 / 预设 匹配源-高比特率
  勾选「使用最高渲染质量」
  导出后自动打开输出目录

Trip 3 [status]  色彩流程  [needs-update]
  Lumetri 面板 → 基本校正 → 创意 LUT
  当前 LUT 已过期，需要更新为 V27 版本
```

### 场景 2：数据分析脚本参数记忆

```
资源：sales_report.py
Trip 1 [reference]  参数说明
  --input    输入 Excel 路径（必填）
  --output   输出目录（默认 ./output）
  --mode     batch | single（默认 single）
  --format   pdf | xlsx | both（默认 both）

Trip 2 [note]  依赖环境
  Python 3.10+ / pandas / openpyxl / matplotlib
  激活虚拟环境：conda activate data-env

Trip 3 [note]  常见错误
  编码问题：Excel 读取加 encoding='utf-8-sig'
  中文字体：matplotlib 需设置 rcParams['font.sans-serif']
```

### 场景 3：网址操作流程

```
资源：内部报表系统
Trip 1 [workflow]  登录流程
  企业账号 → SSO 跳转 → 选择「数据分析」工作区
  不要选「管理后台」，权限不够会报错

Trip 2 [reference]  常用页面路径
  /dashboard       仪表盘首页
  /reports/monthly 月度报表
  /export/data     数据导出（需管理员权限）
```

### 场景 4：动作链步骤说明

```
资源：晨间工作流（action_chain）
Trip 1 [workflow]  包含的步骤
  1. 打开企业邮箱
  2. 打开日历
  3. 启动 VS Code
  4. 打开当前项目文件夹
  5. 打开项目 Wiki 页面
  注：步骤 3 和 4 可以并行，步骤 5 依赖网络
```

### 场景 5：状态标记

```
资源：批量重命名工具
Trip 1 [status]  待更新 [todo]
  当前正则规则不支持中文括号
  需要增加 () 的匹配模式

资源：设计素材库
Trip 1 [status]  已完成 [done]
  2026-06-15 完成素材整理，共 342 个文件
  按「图标/插画/照片/字体」四个子文件夹分类
```

## 三、设计思路

### 3.1 数据模型

```typescript
/** 一条 Trip 笔记 */
interface Trip {
  id: string;                      // 唯一 ID（`${itemId}:${timestamp}`）
  itemId: string;                  // 关联的 OrbitItem ID
  title: string;                   // 简短标题（≤ 50 字）
  content: string;                 // Markdown 正文（≤ 4000 字）
  category: TripCategory;          // 分类
  status: TripStatus;              // 状态标记（可选）
  tags: string[];                  // 自定义标签（用于搜索）
  pinned: boolean;                 // 是否置顶
  createdAt: number;               // 创建时间戳
  updatedAt: number;               // 更新时间戳
  lastViewedAt?: number;           // 最近查看时间戳
}

type TripCategory =
  | "shortcut"                     // 快捷键
  | "workflow"                     // 操作流程
  | "note"                         // 普通笔记
  | "status"                       // 状态标记
  | "reference";                   // 参考资料

type TripStatus =
  | "todo"                         // 待处理
  | "in-progress"                  // 进行中
  | "done"                         // 已完成
  | "needs-update";                // 需要更新
```

**设计决策**：

- **多 Trip 支持**：一个资源可以挂多条 Trip（快捷键一条、流程一条、状态一条），而不是只有一条大杂烩笔记。这样用户可以按需查看，不用每次翻一长段文本。
- **Markdown 正文**：支持代码块（记脚本参数）、列表（记快捷键）、标题分级（记多步骤流程）。存储为纯 Markdown 字符串，渲染由前端处理。
- **category + status 双维度**：category 是内容类型（快捷键/流程/笔记/状态/参考），status 是状态标记（待办/进行中/完成/需更新）。前者用于分类展示，后者用于状态追踪。
- **pinned 字段**：常用 Trip 置顶，避免频繁使用的提示被时间排序淹没。

### 3.2 存储架构

Trip 数据有两条存储路径，按运行环境自动切换：

```
GUI（Tauri 桌面）：
  Rust 后端 SQLite → trips 表
  字段：id, item_id, title, content, category, status, tags, pinned, created_at, updated_at, last_viewed_at
  索引：item_id（按资源查）、tags（按标签搜）、updated_at（按时间排）

webUI（浏览器预览）：
  localStorage → orbitstart.trips.{itemId}.{tripId}
  与 GUI 数据不互通，仅用于开发预览
```

**为什么用 SQLite 而不是插件 storage**：

插件 `ctx.storage` 是 key-value 存储（localStorage 后端），不支持按 `itemId` 批量查询、不支持索引、数据量大时性能差。Trip 数据天然是结构化的关系数据（一个 item 对应多条 trip），SQLite 更合适。

### 3.3 架构定位：核心集成 + 插件增强

```
┌─────────────────────────────────────────────────┐
│  OrbitStart Core (App.tsx)                      │
│                                                 │
│  resource-row (资源行)                          │
│  ├── 启动按钮                                    │
│  ├── tile-actions                               │
│  │   ├── [Trips 按钮] ← 核心新增                │
│  │   ├── 收藏按钮                                │
│  │   ├── 编辑按钮                                │
│  │   └── 删除按钮                                │
│  │                                              │
│  ├── TripPanel 组件 ← 核心新增                  │
│  │   ├── Trip 列表（按 category 分组）           │
│  │   ├── Trip 内容查看（Markdown 渲染）          │
│  │   └── Trip 编辑器（新增/编辑/删除）           │
│  │                                              │
│  └── 命令面板搜索 ← 插件增强                    │
│      └── trips 搜索 provider（搜索 trip 内容）   │
│                                                 │
├─────────────────────────────────────────────────┤
│  trips-plugin (Web Worker)                      │
│  ├── ctx.search.registerProvider                │
│  │   搜索所有 trip 的 title + content + tags    │
│  │   返回匹配结果，点击跳转到对应资源            │
│  ├── ctx.commands.registerCommand               │
│  │   "搜索所有 Trips" → 打开全局 trip 搜索       │
│  │   "导出 Trips" → JSON 导出                    │
│  └── ctx.storage                                │
│      存储插件配置（默认 category、模板列表等）   │
└─────────────────────────────────────────────────┘
```

**为什么是核心 + 插件混合架构**：

- Trips 按钮需要嵌入到 `resource-row` 的 `tile-actions` 区域，这需要修改核心 `App.tsx` 的渲染逻辑——插件 Worker 无法注入 DOM。
- Trip 数据需要按 `itemId` 查询，用 SQLite 比 localStorage 更高效——这需要 Rust 后端新增表和命令。
- 搜索增强（搜索 trip 内容）完全在插件能力范围内，通过 `ctx.search.registerProvider` 实现。

### 3.4 交互设计

**入口 1：资源行 Trips 按钮**

在 `tile-actions` 区域、收藏按钮左侧新增一个 Trips 按钮。按钮上有角标显示该资源的 trip 数量。无 trip 时按钮为灰色描边，有 trip 时为琥珀色填充。

点击行为：
- 无 trip → 直接打开编辑器，创建第一条 trip
- 有 trip → 打开 TripPanel 浮层，展示 trip 列表

**入口 2：TripPanel 浮层**

TripPanel 以浮层形式出现在资源行下方（类似上下文菜单的展开），包含：

- 顶部：资源标题 + trip 总数 + 「新增 Trip」按钮
- 列表区：按 category 分组展示，每条 trip 显示标题 + 内容预览 + 状态标签 + 更新时间
- 点击某条 trip → 展开内容详情（Markdown 渲染），显示编辑/删除按钮
- 置顶 trip 始终在最前

**入口 3：命令面板搜索**

用户在命令面板输入关键词时，trips 插件的 search provider 会搜索所有 trip 的 title + content + tags。匹配结果显示为：

```
[Trip] Premiere Pro · 常用快捷键
       C 裁剪工具 / V 选择工具 / B 钢笔工具...
```

点击结果 → 跳转到对应资源的 TripPanel 并高亮该 trip。

**入口 4：Trip 编辑器**

编辑器是一个模态弹窗，包含：
- 标题输入框（必填，≤ 50 字）
- 分类选择器（shortcut / workflow / note / status / reference）
- 状态选择器（仅 category=status 时显示）
- Markdown 正文编辑区（支持实时预览）
- 标签输入（逗号分隔）
- 置顶开关
- 保存 / 取消按钮

### 3.5 Trip 模板系统

预置 5 种模板，用户创建 trip 时可选择从模板开始：

| 模板 | 预填 category | 预填内容结构 |
|------|---------------|-------------|
| 快捷键速查 | shortcut | `## 常用快捷键\n\n` + 空列表 |
| 操作流程 | workflow | `## 步骤\n\n1. \n2. \n3. ` |
| 参数说明 | reference | `## 参数\n\n| 参数 | 说明 | 默认值 |\n|------|------|--------|\n` |
| 状态记录 | status | `## 当前状态\n\n` + 状态选择器 |
| 自由笔记 | note | 空白 |

用户也可在插件配置中自定义模板，通过 `ctx.storage` 保存。

## 四、实现路径

### Phase 1：核心数据层（Rust + SQLite）

**目标**：建立 trips 数据的持久化存储和 Tauri 命令

**改动文件**：`src-tauri/src/main.rs`

1. 新建 trips 表：

```sql
CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'note',
  status TEXT,
  tags TEXT NOT NULL DEFAULT '[]',     -- JSON array
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_viewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_trips_item_id ON trips(item_id);
CREATE INDEX IF NOT EXISTS idx_trips_updated_at ON trips(updated_at DESC);
```

2. 新增 Tauri 命令：

```rust
#[tauri::command]
fn list_trips(item_id: String) -> Result<Vec<Trip>, String>
// 按 item_id 查询所有 trips，pinned 优先，updated_at 降序

#[tauri::command]
fn create_trip(item_id: String, title: String, content: String, category: String, status: Option<String>, tags: Vec<String>) -> Result<Trip, String>
// 创建新 trip，id 自动生成，时间戳自动填充

#[tauri::command]
fn update_trip(id: String, title: Option<String>, content: Option<String>, category: Option<String>, status: Option<String>, tags: Option<Vec<String>>, pinned: Option<bool>) -> Result<Trip, String>
// 更新指定字段，updated_at 自动刷新

#[tauri::command]
fn delete_trip(id: String) -> Result<(), String>

#[tauri::command]
fn search_trips(query: String) -> Result<Vec<TripSearchResult>, String>
// 全文搜索 title + content + tags，返回匹配 trip + 关联 item 信息

#[tauri::command]
fn trip_count_for_items(item_ids: Vec<String>) -> Result<HashMap<String, i64>, String>
// 批量查询多个资源的 trip 数量（用于资源行角标显示）
```

3. 新增数据结构：

```rust
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trip {
    id: String,
    item_id: String,
    title: String,
    content: String,
    category: String,
    status: Option<String>,
    tags: Vec<String>,
    pinned: bool,
    created_at: i64,
    updated_at: i64,
    last_viewed_at: Option<i64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TripSearchResult {
    trip: Trip,
    item_title: String,
    item_icon: String,
    item_kind: String,
}
```

### Phase 2：核心 UI 层（React 组件）

**目标**：在资源行添加 Trips 按钮和 TripPanel 浮层

**新增文件**：`src/components/TripPanel.tsx`、`src/components/TripEditor.tsx`

**改动文件**：`src/App.tsx`、`src/styles.css`、`src/lib/native.ts`

1. `src/lib/native.ts` 新增封装：

```typescript
export async function listTrips(itemId: string): Promise<Trip[]> {
  return await invokeNative<Trip[]>("list_trips", { itemId });
}
export async function createTrip(params: CreateTripParams): Promise<Trip> {
  return await invokeNative<Trip>("create_trip", params);
}
export async function updateTrip(id: string, updates: UpdateTripParams): Promise<Trip> {
  return await invokeNative<Trip>("update_trip", { id, ...updates });
}
export async function deleteTrip(id: string): Promise<void> {
  return await invokeNative<void>("delete_trip", { id });
}
export async function searchTrips(query: string): Promise<TripSearchResult[]> {
  return await invokeNative<TripSearchResult[]>("search_trips", { query });
}
export async function tripCountForItems(itemIds: string[]): Promise<Record<string, number>> {
  return await invokeNative<Record<string, number>>("trip_count_for_items", { itemIds });
}
```

2. `src/App.tsx` 资源行改动（`tile-actions` 区域）：

```tsx
// 新增状态
const [tripPanelItem, setTripPanelItem] = useState<OrbitItem | null>(null);
const [tripCounts, setTripCounts] = useState<Record<string, number>>({});

// 初始化时批量加载 trip 数量
useEffect(() => {
  if (items.length > 0) {
    tripCountForItems(items.map(i => i.id)).then(setTripCounts);
  }
}, [items]);

// tile-actions 区域新增按钮（在收藏按钮前）
{!batchMode && (
  <div className="tile-actions">
    <button
      className={`trip-action ${tripCounts[item.id] ? "has-trips" : ""}`}
      title="Trips"
      onClick={() => setTripPanelItem(item)}
    >
      <Lightbulb size={15} />
      {tripCounts[item.id] > 0 && (
        <span className="trip-badge">{tripCounts[item.id]}</span>
      )}
    </button>
    {/* ...existing favorite/edit/delete buttons */}
  </div>
)}

// 在 resource-list 底部渲染 TripPanel
{tripPanelItem && (
  <TripPanel
    item={tripPanelItem}
    onClose={() => setTripPanelItem(null)}
    onTripsChanged={() => {
      // 刷新 trip 数量
      tripCountForItems([tripPanelItem.id]).then(counts => {
        setTripCounts(prev => ({ ...prev, ...counts }));
      });
    }}
  />
)}
```

3. `src/components/TripPanel.tsx` 核心结构：

```tsx
export function TripPanel({ item, onClose, onTripsChanged }: TripPanelProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    listTrips(item.id).then(setTrips);
  }, [item.id]);

  // 按 category 分组
  const grouped = useMemo(() => {
    const groups: Record<string, Trip[]> = {};
    for (const trip of trips) {
      const key = trip.pinned ? "pinned" : trip.category;
      (groups[key] ??= []).push(trip);
    }
    return groups;
  }, [trips]);

  return (
    <div className="trip-panel-backdrop" onClick={onClose}>
      <div className="trip-panel" onClick={e => e.stopPropagation()}>
        <header>
          <h3>{item.title} 的 Trips</h3>
          <span>{trips.length} 条记录</span>
          <button onClick={() => setEditingTrip({} as Trip)}>+ 新增 Trip</button>
          <button onClick={onClose}>×</button>
        </header>
        <div className="trip-list">
          {trips.length === 0 ? (
            <EmptyState onCreate={() => setEditingTrip({} as Trip)} />
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <TripCategoryGroup
                key={category}
                category={category}
                trips={items}
                expandedId={expandedId}
                onExpand={setExpandedId}
                onEdit={setEditingTrip}
                onDelete={async (id) => {
                  await deleteTrip(id);
                  setTrips(prev => prev.filter(t => t.id !== id));
                  onTripsChanged();
                }}
              />
            ))
          )}
        </div>
        {editingTrip && (
          <TripEditor
            item={item}
            trip={editingTrip}
            onSave={async (data) => {
              if (editingTrip.id) {
                await updateTrip(editingTrip.id, data);
              } else {
                await createTrip({ itemId: item.id, ...data });
              }
              const refreshed = await listTrips(item.id);
              setTrips(refreshed);
              setEditingTrip(null);
              onTripsChanged();
            }}
            onCancel={() => setEditingTrip(null)}
          />
        )}
      </div>
    </div>
  );
}
```

4. `src/components/TripEditor.tsx` 核心结构：

```tsx
export function TripEditor({ item, trip, onSave, onCancel }: TripEditorProps) {
  const [title, setTitle] = useState(trip.title ?? "");
  const [content, setContent] = useState(trip.content ?? "");
  const [category, setCategory] = useState<TripCategory>(trip.category ?? "note");
  const [status, setStatus] = useState<TripStatus>(trip.status ?? "todo");
  const [tags, setTags] = useState((trip.tags ?? []).join(", "));
  const [pinned, setPinned] = useState(trip.pinned ?? false);
  const [showPreview, setShowPreview] = useState(false);

  // 模板选择
  const templates = TRIP_TEMPLATES;
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      content,
      category,
      status: category === "status" ? status : undefined,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      pinned,
    });
  };

  return (
    <div className="trip-editor-backdrop">
      <div className="trip-editor">
        <header>
          <h3>{trip.id ? "编辑 Trip" : "新建 Trip"}</h3>
          <span>{item.title}</span>
        </header>

        {!trip.id && (
          <div className="template-picker">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                className={selectedTemplate === tpl.id ? "selected" : ""}
                onClick={() => {
                  setSelectedTemplate(tpl.id);
                  setCategory(tpl.category);
                  if (!content) setContent(tpl.content);
                }}
              >
                {tpl.label}
              </button>
            ))}
          </div>
        )}

        <label>标题</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
               placeholder="如：常用快捷键" maxLength={50} />

        <div className="editor-row">
          <div>
            <label>分类</label>
            <select value={category} onChange={e => setCategory(e.target.value as TripCategory)}>
              <option value="shortcut">快捷键</option>
              <option value="workflow">操作流程</option>
              <option value="note">笔记</option>
              <option value="status">状态</option>
              <option value="reference">参考</option>
            </select>
          </div>
          {category === "status" && (
            <div>
              <label>状态</label>
              <select value={status} onChange={e => setStatus(e.target.value as TripStatus)}>
                <option value="todo">待处理</option>
                <option value="in-progress">进行中</option>
                <option value="done">已完成</option>
                <option value="needs-update">需更新</option>
              </select>
            </div>
          )}
          <div>
            <label>置顶</label>
            <input type="checkbox" checked={pinned}
                   onChange={e => setPinned(e.target.checked)} />
          </div>
        </div>

        <div className="editor-toolbar">
          <button onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? "编辑" : "预览"}
          </button>
        </div>

        {showPreview ? (
          <div className="trip-preview markdown-body"
               dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
        ) : (
          <textarea value={content} onChange={e => setContent(e.target.value)}
                    placeholder="支持 Markdown 格式..."
                    rows={12} maxLength={4000} />
        )}

        <label>标签（逗号分隔）</label>
        <input value={tags} onChange={e => setTags(e.target.value)}
               placeholder="如：导出,视频,H.264" />

        <footer>
          <button onClick={onCancel}>取消</button>
          <button onClick={handleSave} disabled={!title.trim()}>保存</button>
        </footer>
      </div>
    </div>
  );
}
```

5. `src/styles.css` 新增样式（约 300 行）：

```css
/* Trips 按钮 */
.trip-action {
  position: relative;
  /* 与现有 favorite-action 同尺寸 */
}
.trip-action.has-trips {
  background: rgba(239, 159, 39, 0.15);
  border-color: #EF9F27;
  color: #854F0B;
}
.trip-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #EF9F27;
  color: #fff;
  font-size: 10px;
  font-weight: 500;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* TripPanel 浮层 */
.trip-panel-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}
.trip-panel {
  background: var(--bg-primary);
  border-radius: 16px;
  width: min(640px, 90vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Trip 列表项 */
.trip-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
}
.trip-item:hover { background: var(--bg-secondary); }
.trip-item-expanded { background: var(--bg-secondary); }
.trip-category-bar {
  width: 4px;
  border-radius: 2px;
  flex-shrink: 0;
  align-self: stretch;
}

/* Trip 编辑器 */
.trip-editor-backdrop { /* 同 panel backdrop */ }
.trip-editor {
  background: var(--bg-primary);
  border-radius: 16px;
  width: min(560px, 90vw);
  max-height: 80vh;
  overflow-y: auto;
  padding: 24px;
}
```

### Phase 3：插件搜索增强

**目标**：trips 内容可被命令面板搜索

**新增文件**：`plugins/trips-search/plugin.json`、`plugins/trips-search/main.ts`

```json
{
  "id": "trips-search",
  "name": "Trips Search",
  "version": "0.1.0",
  "description": "搜索所有资源上的 Trip 提示内容。",
  "enabled": true,
  "builtin": false,
  "permissions": [
    { "id": "ui:toast", "label": "显示提示消息", "risk": "low" }
  ],
  "contributes": {
    "commands": 1,
    "searchProviders": 1,
    "themes": 0,
    "views": 0
  }
}
```

```typescript
// main.ts
import type { OrbitPlugin } from "./orbitstart-plugin-api";

const plugin: OrbitPlugin = {
  activate(ctx) {
    // 注册搜索 provider
    ctx.search.registerProvider("trips-search.content", async (query) => {
      if (!query.trim() || query.length < 2) return [];

      // 通过宿主 API 搜索 trips
      // 注意：当前 ctx 没有 invoke 能力，需要通过 host-request 扩展
      // 暂时用 fetch 到本地 Tauri API 或通过 customEvent 请求宿主搜索
      // Phase 3 实现时需要扩展 Worker bridge 支持 invoke 代理

      // 临时方案：通过 postMessage 请求宿主搜索
      const results = await requestHostSearch(query);

      return results.map(r => ({
        id: `trip-${r.trip.id}`,
        title: `[Trip] ${r.itemTitle} · ${r.trip.title}`,
        subtitle: r.trip.content.slice(0, 80).replace(/[#*\n]/g, " "),
        icon: "Lightbulb",
        source: "trips-search",
        actionLabel: "查看 Trip",
        run: () => {
          ctx.ui.toast(`Trip: ${r.trip.title} — 请在资源面板查看详情`);
          // 未来：通过 host API 跳转到对应资源并打开 TripPanel
        }
      }));
    });

    // 注册命令
    ctx.commands.registerCommand({
      id: "trips-search.export",
      title: "导出所有 Trips",
      subtitle: "将所有 Trip 提示导出为 JSON 文件",
      icon: "Download",
      keywords: ["trips", "export", "导出"],
      run: () => {
        ctx.ui.toast("Trips 导出功能开发中");
      }
    });
  }
};

export default plugin;
```

**注意**：Phase 3 需要扩展 Worker bridge，让插件能够通过 `host-request` 调用 Tauri 的 `search_trips` 命令。当前 `resolveHostRequest` 只支持 `storage:*` 和 `settings:*`，需要新增 `trips:search` 等 API。

### Phase 4：模板系统与高级功能

**目标**：预置模板、自定义模板、批量导入导出

1. 预置模板定义（`src/lib/tripTemplates.ts`）：

```typescript
export const TRIP_TEMPLATES = [
  {
    id: "shortcut",
    label: "快捷键速查",
    category: "shortcut" as const,
    content: "## 常用快捷键\n\n| 按键 | 功能 |\n|------|------|\n|  |  |\n"
  },
  {
    id: "workflow",
    label: "操作流程",
    category: "workflow" as const,
    content: "## 步骤\n\n1. \n2. \n3. \n\n## 注意事项\n\n- \n"
  },
  {
    id: "reference",
    label: "参数说明",
    category: "reference" as const,
    content: "## 参数\n\n| 参数 | 说明 | 默认值 |\n|------|------|--------|\n|  |  |  |\n"
  },
  {
    id: "status",
    label: "状态记录",
    category: "status" as const,
    content: "## 当前状态\n\n\n## 下一步计划\n\n"
  },
  {
    id: "note",
    label: "自由笔记",
    category: "note" as const,
    content: ""
  }
];
```

2. Markdown 渲染：使用轻量级 Markdown 解析器（如 marked 的精简版，或手写简易解析器，避免引入大依赖）。支持：标题、列表、表格、代码块、加粗/斜体。

3. 批量操作：
   - 导出所有 Trips 为 JSON
   - 从 JSON 导入 Trips
   - 按资源批量删除 Trips（资源删除时级联删除关联 trips）

### Phase 5：与资源生命周期联动

**目标**：资源删除时自动清理关联 trips

**改动文件**：`src-tauri/src/main.rs` 的 `delete_item` 函数

```rust
fn delete_item(id: String) -> Result<(), String> {
    let conn = open_db()?;
    // 先删除关联的 trips
    conn.execute("DELETE FROM trips WHERE item_id = ?1", params![&id])
        .map_err(|e| format!("Failed to cleanup trips: {e}"))?;
    // 再删除资源本身
    conn.execute("DELETE FROM items WHERE id = ?1", params![&id])
        .map_err(|e| format!("Failed to delete item: {e}"))?;
    Ok(())
}
```

## 五、分阶段交付计划

| 阶段 | 内容 | 改动范围 | 预计工作量 |
|------|------|---------|-----------|
| Phase 1 | SQLite 表 + Tauri 命令 | `src-tauri/src/main.rs` | 中 |
| Phase 2 | Trips 按钮 + TripPanel + TripEditor | `App.tsx`, 新增 2 组件, `styles.css`, `native.ts` | 大 |
| Phase 3 | 插件搜索增强 | `plugins/trips-search/`, Worker bridge 扩展 | 中 |
| Phase 4 | 模板系统 + Markdown 渲染 | `src/lib/tripTemplates.ts`, Markdown 渲染 | 小 |
| Phase 5 | 资源删除级联清理 | `src-tauri/src/main.rs` | 小 |

**推荐实施顺序**：Phase 1 → Phase 5（顺手做）→ Phase 2 → Phase 4 → Phase 3

Phase 2 是用户可见价值最大的阶段，应优先完成。Phase 3 的搜索增强是锦上添花，可在核心体验打磨好之后再做。

## 六、与现有系统的集成点

| 集成点 | 方式 | 影响 |
|--------|------|------|
| 资源行 (`resource-row`) | `tile-actions` 新增 Trips 按钮 | 不影响现有收藏/编辑/删除按钮 |
| 资源删除 (`delete_item`) | 级联删除关联 trips | 防止孤儿数据 |
| 命令面板搜索 | 插件 search provider | trips 内容出现在搜索结果中 |
| JSON 备份导出 | `exportCatalogJson` 包含 trips | 备份完整性 |
| JSON 备份导入 | `importCatalogJson` 恢复 trips | 跨设备迁移 |
| 浏览器预览模式 | localStorage 回退 | webUI 也能用（数据不互通） |

## 七、边界与约束

- Trip 正文限制 4000 字（足够记快捷键和流程，防止变成文档编辑器）
- 每个资源最多 50 条 Trip（防止滥用，超过应考虑用文档工具）
- Markdown 仅支持子集（标题/列表/表格/代码块/加粗），不支持图片和链接（避免安全风险）
- 搜索结果最多返回 20 条（性能保护）
- Trip 数据不参与资源中心的 `items` 导出格式（独立段 `trips` 字段），避免破坏现有导出兼容性

## 八、文件清单

```
src-tauri/src/main.rs           # 新增 trips 表 + 6 个 Tauri 命令
src/lib/native.ts               # 新增 6 个 trip 封装函数
src/lib/tripTemplates.ts        # 新增模板定义
src/lib/markdown.ts             # 新增轻量 Markdown 渲染
src/components/TripPanel.tsx    # 新增 Trip 面板组件
src/components/TripEditor.tsx   # 新增 Trip 编辑器组件
src/App.tsx                     # 资源行添加 Trips 按钮 + 状态管理
src/styles.css                  # 新增 ~300 行 trips 样式
src/types.ts                    # 新增 Trip / TripCategory / TripStatus 类型
plugins/trips-search/           # 新增搜索增强插件（Phase 3）
plugins/trips-search/plugin.json
plugins/trips-search/main.ts
plugins/trips-search/orbitstart-plugin-api.d.ts
```
