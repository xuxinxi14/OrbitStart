# 资源卡片长按拖动排序 · 落地方案

> 日期：2026-06-22
> 版本：OrbitStart 0.5.0
> 目标：实现 iOS 桌面式的长按拖动卡片排序，位置稳定持久化
> 选型：dnd-kit（React 18 兼容 / 支持 grid / MIT / 2026 年仍活跃维护）

---

## 1. 目标与非目标

### 目标
- 长按资源卡片 300ms 后进入"拖拽态"，可拖动到任意位置重排
- 松手后位置持久化到 SQLite，重启不丢失
- 拖拽视觉质感：卡片放大 1.05 + 阴影加深 + 半透明 + 平滑回弹
- 与现有点击启动、Trips/收藏/编辑/删除按钮无冲突
- 顺带修复 P1 反馈第 4 项（点击卡片后位置乱跑）

### 非目标（本期不做）
- 跨分组拖拽（卡片从一个分组拖到另一个分组）—— 留给下个版本
- 拖拽到分组栏创建分组 —— 留给下个版本
- 命令面板内拖拽排序 —— 命令面板仍用 recency 排序
- 移动端触屏支持 —— OrbitStart 是 Windows 桌面应用，鼠标为主

---

## 2. 技术选型对比

| 库 | Stars/状态 | 优势 | 劣势 | 结论 |
|----|-----------|------|------|------|
| **dnd-kit** | 活跃维护（2026-06 仍更新）/ MIT | 支持 grid / TS 原生 / 模块化 tree-shake / 长按激活 / 键盘无障碍 | API 偏底层，需自己写视觉层 | ✅ **采用** |
| react-beautiful-dnd | 33k / ❌ 2024-10 Atlassian 官方停止维护 | API 简单、开箱即用动画好 | 已弃用、不维护、React 18 严格模式下有 bug | ❌ 弃用 |
| Pragmatic drag and drop | Atlassian 官方推荐替代 rbd | 性能好、轻量 | 生态新、文档少、API 更底层 | 备选 |
| react-grid-layout | 活跃 | 专做可拖拽网格、支持可变尺寸 | 偏"仪表盘"场景，API 重，过度设计 | ❌ 过重 |

**最终选择 dnd-kit**，理由：
1. 明确支持 grid 网格布局
2. `activationConstraint.delay` 原生支持长按激活
3. React 18 + TypeScript 原生
4. 纯前端库，不碰 Tauri/文件系统，风险低
5. 活跃维护，MIT 协议

---

## 3. 架构设计

### 3.1 整体分层

```
┌─────────────────────────────────────────────────┐
│  UI 层（React）                                   │
│  DndContext + useSortable 包裹 resource-list     │
│  长按激活 → 拖拽 → arrayMove → onDragEnd         │
└────────────────┬────────────────────────────────┘
                 │ reorderItems(ids)
┌────────────────▼────────────────────────────────┐
│  数据桥接层（native.ts）                          │
│  reorderItems(id, fromIndex, toIndex)            │
│  localStorage fallback                           │
└────────────────┬────────────────────────────────┘
                 │ invoke("reorder_items")
┌────────────────▼────────────────────────────────┐
│  后端层（main.rs）                                │
│  reorder_items 命令：批量 UPDATE items.sort_order │
└─────────────────────────────────────────────────┘
```

### 3.2 排序策略（关键决策）

当前 `searchEngine.ts` 空查询按 `recency → launchCount → favorite → title` 排序，这是"卡片乱跑"问题的根因。引入手动排序后，策略调整为：

| 场景 | 排序策略 | 理由 |
|------|----------|------|
| 资源中心主视图（空查询） | **手动 sort_order 优先** → title 字母序兜底 | 位置稳定，用户掌控 |
| 资源中心搜索时 | 按相关度评分（scoreItem） | 搜索结果按匹配度排 |
| 资源中心筛选分组时 | 手动 sort_order 优先 | 筛选不改顺序 |
| 命令面板（palette） | recency → launchCount → favorite → title | 快速访问最近用的 |
| 新建资源 | sort_order = 0，现有资源 sort_order 全部 +1 | 新资源插到最前面 |

**关键**：手动排序只在资源中心生效，命令面板保持 recency 排序不变。这样既给了用户位置控制权，又不牺牲快速访问能力。

---

## 4. 数据结构变更

### 4.1 SQLite（main.rs `init_db`）

```sql
-- items 表新增列
ALTER TABLE items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- 排序索引
CREATE INDEX IF NOT EXISTS idx_items_sort_order ON items(sort_order);
```

`init_db` 中用 `CREATE TABLE IF NOT EXISTS` 建表，新增列需用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`（rusqlite 0.32 支持幂等迁移）。

### 4.2 Rust 结构体（main.rs `OrbitItem`）

```rust
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrbitItem {
    // ... 现有字段 ...
    #[serde(default)]
    sort_order: i64,
}
```

### 4.3 TypeScript 类型（src/types.ts）

```ts
export interface OrbitItem {
  // ... 现有字段 ...
  sortOrder?: number;
}
```

### 4.4 查询调整

`catalog_snapshot` / `get_item` 等读取命令的 SQL 加 `ORDER BY sort_order ASC, title COLLATE NOCASE ASC`。
`create_item` 时 `sort_order` 设为 0，同时 `UPDATE items SET sort_order = sort_order + 1`。

---

## 5. 后端命令设计

### 5.1 新增 `reorder_items` 命令

```rust
#[tauri::command]
fn reorder_items(app: tauri::AppHandle, ordered_ids: Vec<String>) -> Result<(), String> {
    let conn = open_db()?;
    let now = now_string();
    let tx = conn.transaction();
    // 按传入顺序重写 sort_order，0-based
    for (index, id) in ordered_ids.iter().enumerate() {
        tx.execute(
            "UPDATE items SET sort_order = ?1, updated_at = ?2 WHERE id = ?3",
            params![index as i64, now, id],
        )
        .map_err(|error| format!("Failed to reorder item: {error}"))?;
    }
    tx.commit().map_err(|error| format!("Failed to commit reorder: {error}"))?;
    let _ = app.emit("orbit://refresh-resources", ());
    Ok(())
}
```

注册到 `generate_handler!`。

### 5.2 create_item 调整

新建资源时 `sort_order = 0`，现有资源全部 +1：

```rust
conn.execute("UPDATE items SET sort_order = sort_order + 1", [])?;
conn.execute("INSERT INTO items (..., sort_order, ...) VALUES (..., 0, ...)", params![...])?;
```

---

## 6. 前端实现

### 6.1 依赖安装

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

三个包总计 gzip 后约 15-20KB，可接受。

### 6.2 新增 `SortableResourceRow` 组件

抽出当前 App.tsx 第 1886-1943 行的 `<article className="resource-row">` 为独立组件，包裹 `useSortable`：

```tsx
// src/components/SortableResourceRow.tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  item: OrbitItem;
  // ... 其他 props 透传
}

export function SortableResourceRow({ item, ...props }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    activationConstraint: { delay: 300, tolerance: 5 }  // 长按 300ms 激活
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 100 : undefined,
    scale: isDragging ? "1.05" : undefined
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`resource-row ${isDragging ? "dragging" : ""}`}
      data-resource-id={item.id}
      {...attributes}
      {...listeners}
    >
      {/* 原有内容 */}
    </article>
  );
}
```

### 6.3 DndContext 包裹 resource-list

在 App.tsx 的 `renderDashboard` 中改造 `.resource-list`：

```tsx
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";

const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { delay: 300, tolerance: 5 }  // 长按激活
  })
);

const [localOrder, setLocalOrder] = useState<string[]>([]);

// 同步 items → localOrder
useEffect(() => {
  setLocalOrder(items.map(item => item.id));
}, [items]);

const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  setLocalOrder(prev => {
    const oldIndex = prev.indexOf(active.id as string);
    const newIndex = prev.indexOf(over.id as string);
    const next = arrayMove(prev, oldIndex, newIndex);
    // 立即持久化（防抖）
    void debouncedReorder(next);
    return next;
  });
};

// 渲染
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <SortableContext items={localOrder} strategy={rectSortingStrategy}>
    <div className="resource-list">
      {sortedItems.map(item => (
        <SortableResourceRow key={item.id} item={item} {...props} />
      ))}
    </div>
  </SortableContext>
</DndContext>
```

### 6.4 排序逻辑调整

`filteredItems` 的排序改为：搜索时按 score，空查询时按 localOrder（手动顺序）：

```tsx
const sortedItems = useMemo(() => {
  if (query.trim()) {
    // 搜索时按相关度，不走手动排序
    return filteredItems; // buildSortedResults 已处理
  }
  // 空查询：按 localOrder（手动顺序）
  const orderMap = new Map(localOrder.map((id, index) => [id, index]));
  return [...filteredItems].sort((a, b) => {
    const aOrder = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
}, [filteredItems, query, localOrder]);
```

### 6.5 持久化（防抖）

拖拽时频繁触发 `reorder_items` 会卡，用防抖（300ms）批量提交：

```tsx
const debouncedReorder = useMemo(
  () => debounce(async (orderedIds: string[]) => {
    try {
      await reorderItems(orderedIds);
    } catch (error) {
      console.error("Failed to persist reorder", error);
    }
  }, 300),
  []
);
```

### 6.6 searchEngine.ts 调整

`buildSortedResults` 的空查询分支**保持 recency 排序不变**（这是命令面板用的），资源中心不走 `buildSortedResults`，改用上面的 `sortedItems` 逻辑。

---

## 7. 视觉设计（CSS）

### 7.1 拖拽态样式

```css
/* src/styles.css 新增 */

.resource-row.dragging {
  z-index: 100;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.32), 0 0 0 1px var(--accent);
  cursor: grabbing;
  transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
              box-shadow 180ms ease-out;
}

.resource-row.dragging .resource-launch,
.resource-row.dragging .tile-actions {
  pointer-events: none;  /* 拖拽时禁用内部按钮 */
}

/* 拖拽占位符（被拖卡片的原位置） */
.resource-row.dragging::before {
  content: "";
  position: absolute;
  inset: 0;
  border: 2px dashed var(--line);
  border-radius: 12px;
  background: transparent;
  z-index: -1;
}
```

### 7.2 长按激活视觉提示

长按 300ms 期间给一个微妙的"准备拿起"反馈：

```css
.resource-row {
  transition: transform 160ms ease-out, box-shadow 160ms ease-out;
}

/* dnd-kit 长按期间会加 data-属性，可用 :active 配合 */
.resource-row:active {
  transform: scale(1.01);
}
```

### 7.3 主题适配

`.resource-row.dragging` 用 CSS 变量（`var(--accent)` / `var(--line)`），自动适配 local-galaxy / creative-mode / aurora-focus / ink-blue / orbit-dark 全部主题，无需写主题分支。

---

## 8. 冲突规避

### 8.1 与点击启动的冲突

**问题**：长按 300ms 期间如果鼠标移动，dnd-kit 不会触发拖拽（tolerance 5px 容差），但也不应触发点击启动。

**方案**：
- `activationConstraint: { delay: 300, tolerance: 5 }` —— 300ms 内移动超过 5px 则取消激活，视为普通点击
- `SortableResourceRow` 的 `listeners` 只绑在 `.resource-launch` 按钮上，不绑在整个 article（避免点 Trips/收藏/编辑/删除按钮时误触拖拽）
- 或者更稳妥：listeners 绑在 article，但 `.tile-actions` 按钮 `onPointerDown={e => e.stopPropagation()}` 阻止冒泡

### 8.2 与 Trips/收藏/编辑/删除按钮的冲突

```tsx
<button
  onPointerDown={(e) => e.stopPropagation()}  // 阻止触发拖拽
  onClick={() => setTripPanelItem(item)}
>
  <Lightbulb size={15} />
</button>
```

所有 `.tile-actions` 内的按钮都加 `onPointerDown stopPropagation`。

### 8.3 与右键菜单的冲突

右键菜单通过 `onContextMenu` 触发，与 dnd-kit 的 pointer 事件不冲突，无需特殊处理。

### 8.4 与批量模式的冲突

批量模式下（`batchMode = true`）禁用拖拽：

```tsx
<DndContext sensors={batchMode ? [] : sensors} ...>
```

或直接不渲染 DndContext，回退到普通列表。

---

## 9. 改动文件清单

| 文件 | 改动类型 | 内容 |
|------|----------|------|
| `package.json` | 修改 | 加 `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/utilities` 三个依赖 |
| `src-tauri/src/main.rs` | 修改 | `init_db` 加 `sort_order` 列 + 索引；`OrbitItem` 结构体加字段；`create_item` 设 sort_order=0；新增 `reorder_items` 命令；注册到 `generate_handler!`；查询加 `ORDER BY sort_order` |
| `src/types.ts` | 修改 | `OrbitItem` 加 `sortOrder?: number` |
| `src/lib/native.ts` | 修改 | 新增 `reorderItems(orderedIds: string[])` 桥接函数 + localStorage fallback |
| `src/components/SortableResourceRow.tsx` | **新增** | 抽出 resource-row 为独立组件，包裹 `useSortable` |
| `src/App.tsx` | 修改 | 引入 DndContext/SortableContext；`renderDashboard` 的 `.resource-list` 改造；新增 `localOrder` state + `handleDragEnd` + 防抖持久化；`filteredItems` 排序逻辑改为手动优先；批量模式禁用拖拽 |
| `src/lib/searchEngine.ts` | **不改** | 命令面板仍用 recency 排序，资源中心不再走 `buildSortedResults` |
| `src/styles.css` | 修改 | 新增 `.resource-row.dragging` 拖拽态样式 + 占位符样式 |

---

## 10. 实施步骤

### Step 1：数据层（1-2 小时）
1. main.rs `init_db` 加 `ALTER TABLE items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`
2. `OrbitItem` 结构体加 `sort_order` 字段
3. `create_item` 设 sort_order=0 + 现有 +1
4. 所有 `SELECT * FROM items` 加 `ORDER BY sort_order ASC, title COLLATE NOCASE ASC`
5. 新增 `reorder_items` 命令并注册
6. `cargo check` 验证

### Step 2：桥接层（30 分钟）
1. types.ts 加 `sortOrder?: number`
2. native.ts 加 `reorderItems` 函数 + fallback

### Step 3：前端交互（2-3 小时）
1. `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
2. 新建 `SortableResourceRow.tsx`
3. App.tsx 引入 DndContext，改造 renderDashboard
4. localOrder state + handleDragEnd + 防抖持久化
5. 排序逻辑调整为手动优先

### Step 4：视觉打磨（1-2 小时）
1. styles.css 加 `.resource-row.dragging` 样式
2. 调整 transition / shadow / scale / opacity
3. 占位符虚线框
4. 长按 :active 微反馈

### Step 5：冲突处理 + 测试（1 小时）
1. tile-actions 按钮 stopPropagation
2. 批量模式禁用拖拽
3. 手动测试：长按拖动 / 点击启动 / 点 Trips/收藏/编辑/删除 / 搜索时排序 / 重启后位置保持

**合计预估：6-8 小时（约 1 天）**

---

## 11. 验收标准

1. ✅ 长按卡片 300ms 后卡片"拿起"（scale 1.05 + 阴影），可拖动
2. ✅ 拖动到目标位置，其他卡片平滑让位（dnd-kit 的 transform 动画）
3. ✅ 松手后位置固定，刷新页面/重启应用后位置保持
4. ✅ 短按（<300ms）卡片正常启动资源，不触发拖拽
5. ✅ 拖拽时 Trips/收藏/编辑/删除按钮不响应（pointer-events: none）
6. ✅ 非拖拽时 Trips/收藏/编辑/删除按钮正常工作
7. ✅ 搜索时按相关度排序，退出搜索恢复手动排序
8. ✅ 批量模式下禁用拖拽
9. ✅ 新建资源自动插到最前面
10. ✅ tsc + vite build + cargo check 全通过

---

## 12. 风险与规避

| 风险 | 等级 | 规避 |
|------|------|------|
| 长按与点击启动误判 | 中 | `activationConstraint.delay=300 + tolerance=5`，300ms 内移动 >5px 视为点击 |
| tile-actions 按钮误触拖拽 | 中 | 按钮 `onPointerDown stopPropagation` |
| 频繁 reorder 卡顿 | 低 | 防抖 300ms + SQLite 事务批量 UPDATE |
| 现有资源无 sort_order 导致乱序 | 低 | `ALTER TABLE ADD COLUMN DEFAULT 0`，首次启动后所有资源 sort_order=0，按 title 兜底排序 |
| dnd-kit 与 React 18 严格模式兼容 | 低 | dnd-kit 官方已支持 React 18 |
| 包体积增加 | 低 | 三个包 gzip 后约 15-20KB，可接受 |

---

> 本方案为设计文档，未实际修改代码。确认后按 Step 1-5 顺序实施。
