# OrbitStart 插件 API 现状评估

> 评估时间：2026-06-21
> 评估对象：OrbitStart v0.4.8 插件系统
> 结论：**可以"安装"插件，但不能真正"开发"有自定义逻辑的插件**

> 2026-06-21 实施更新：方案 B 已作为主线落地。当前代码已支持本地第三方插件
> `main.js/main.ts` 的 Web Worker 隔离执行，并通过 `postMessage` 桥接
> `ctx.commands`、`ctx.search`、`ctx.ui.toast`、`ctx.settings` 和
> `ctx.storage`。下文保留为实施前状态评估，用于说明改造原因。

## 一、架构总览

OrbitStart 采用 **manifest-first** 插件模型（Obsidian 风格）：

```
%APPDATA%\OrbitStart\plugins\
  └── my-plugin\
      ├── plugin.json    ← 声明清单（唯一被读取的文件）
      ├── main.ts        ← 插件源码（当前不会被加载）
      └── README.md
```

加载链路：
1. Rust 后端 `read_local_plugin_manifests()` 扫描插件目录，读取每个 `plugin.json`
2. manifest 与 SQLite 中的启用状态合并，通过 `all_plugins()` 返回给前端
3. 前端 `createOrbitPluginHost(plugins)` 创建 `PluginContext`
4. **断点**：`createOrbitPluginHost` 不会动态 import `main.ts`，只根据 manifest 字段自动生成一个通用的 "Hello" 命令和一个 manifest-search provider

## 二、已实现能力（可用）

| 能力 | 位置 | 状态 |
|------|------|------|
| manifest 发现 | `main.rs:659` `read_local_plugin_manifests()` | ✅ |
| 启用/禁用持久化 | `main.rs:691` `all_plugins()` + SQLite `plugin_states` 表 | ✅ |
| 权限声明与展示 | manifest `permissions` 字段 + 插件管理 UI | ✅ |
| 插件事件日志 | `log_plugin_event()` + SQLite `plugin_logs` 表 | ✅ |
| Safe mode | 禁用所有第三方插件 | ✅ |
| 插件模板生成 | `main.rs:2905` `create_plugin_template()` 命令 | ✅ |
| 打包脚本 | `tools/package-plugin.ps1`（zip 打包） | ✅ |

## 三、API 表面（部分可用）

`src/plugin/api.ts` 中 `PluginContext` 暴露的接口：

```typescript
ctx.commands.registerCommand(command)   // ✅ 可调用，但只在内置插件路径生效
ctx.search.registerProvider(id, fn)      // ✅ 可调用，但只在内置插件路径生效
ctx.ui.toast(message)                    // ✅ 可用
ctx.settings                             // ❌ unknown，未实现
ctx.storage                              // ❌ unknown，未实现
```

**关键问题**：`createOrbitPluginHost()` 中对第三方插件（`!builtin`）的处理是：

```typescript
for (const plugin of plugins.filter(p => p.enabled && !p.builtin)) {
  ctx.commands.registerCommand({
    id: `${plugin.id}.hello`,
    title: `${plugin.name}: Hello`,
    run: () => ctx.ui.toast(`${plugin.name} 已响应命令`)
  });
  // ...一个固定的 manifest-search provider
}
```

它**不加载 `main.ts`**，而是为每个第三方插件硬编码生成一个通用的 "Hello" 命令。你在 `main.ts` 里写的 `activate(ctx)` 自定义逻辑——注册真正的命令、真正的搜索逻辑——**完全不会运行**。

## 四、关键缺口

### 1. main.ts 执行运行时缺失（最核心）
- 没有 worker / sidecar / iframe 隔离执行环境
- 没有 `import()` 动态加载插件源码
- 没有 `activate(ctx)` / `deactivate()` 生命周期调用
- 文档 `docs/PLUGIN_DEVELOPMENT.md` 明确标注 "isolated worker execution for main.ts" 为 Planned next

### 2. API 能力不完整
- `settings`：接口定义里是 `unknown`，没有读写实现
- `storage`：同上
- `views`：manifest 有 `contributes.views` 字段，但没有 view 注册 API
- `themes`：manifest 有 `contributes.themes` 字段，但插件无法贡献主题
- `importers`：无数据导入扩展点

### 3. 安全模型未落地
- manifest 声明权限，但没有运行时权限校验（因为没有执行环境）
- 打包只是 zip，没有签名验证
- 没有 network 权限提示

## 五、制作插件的容易程度

### 现在能做的（5 分钟）
1. 在 `%APPDATA%\OrbitStart\plugins\` 下建文件夹
2. 写一个 `plugin.json`（复制 hello-command 改 id/name）
3. 重启 OrbitStart → 插件出现在管理页，能启用/禁用，命令面板会出现一个 "你的插件名: Hello" 命令

### 现在做不到的
- 写一个能真正做事情的插件（比如：翻译选中词、压缩图片、启动 Docker 容器）
- 让插件注册自定义搜索逻辑（比如：搜索 Notion 页面、搜索本地代码库）
- 让插件访问本地文件系统、网络、系统剪贴板（除内置 clipboard 外）
- 让插件贡献自定义 UI 视图

### 评估结论

| 维度 | 评分 | 说明 |
|------|------|------|
| manifest 安装体验 | ★★★★☆ | 放文件即识别，UI 完善 |
| API 设计合理性 | ★★★☆☆ | 接口形状对（参考 Obsidian），但缺执行层 |
| 实际可开发性 | ★☆☆☆☆ | main.ts 不执行，无法写有意义的插件 |
| 文档完整度 | ★★★☆☆ | 有 PLUGIN_API.md 和 PLUGIN_DEVELOPMENT.md，但未明确标注"main.ts 不执行"这个关键限制 |
| 安全模型 | ★★☆☆☆ | manifest 权限声明存在，但无运行时隔离 |

## 六、让插件真正可用的最小改造路径

如果要让 `main.ts` 真正执行，最小可行方案（按复杂度递增）：

### 方案 A：动态 import（最快，安全性低）
在 `createOrbitPluginHost()` 中对每个第三方插件：
```typescript
const module = await import(`file://${pluginPath}/main.ts`);
const plugin = module.default;
plugin.activate(ctx);
```
- 优点：改动小（~20 行）
- 缺点：插件代码与主进程同源，无隔离，恶意插件可访问全部 DOM/Tauri API

### 方案 B：Web Worker 隔离（推荐）
- 插件 main.ts 在 Web Worker 中执行
- 通过 `postMessage` 桥接 `ctx.commands` / `ctx.search` / `ctx.ui`
- 权限声明映射为 Worker 可调用的 API 白名单
- 优点：隔离 + 异步不阻塞 UI
- 缺点：需要实现消息协议（~200-400 行）

### 方案 C：iframe 沙箱（最安全）
- 每个插件一个 `sandbox` iframe
- 通过 `postMessage` 通信
- CSP 限制网络访问
- 优点：最强隔离
- 缺点：实现最重，且 Tauri WebView 环境下 iframe 有额外限制

## 七、相关文件索引

| 文件 | 作用 |
|------|------|
| `src/plugin/api.ts` | 插件宿主 API + PluginContext |
| `src/types.ts` | OrbitPluginManifest / OrbitPlugin 接口定义 |
| `src-tauri/src/main.rs:659` | `read_local_plugin_manifests()` 本地插件扫描 |
| `src-tauri/src/main.rs:2905` | `create_plugin_template()` 模板生成命令 |
| `src-tauri/src/main.rs:2776` | `ensure_local_templates()` 首次启动种子插件 |
| `plugins/hello-command/` | 示例插件（main.ts 不会被执行） |
| `tools/package-plugin.ps1` | 打包脚本 |
| `docs/PLUGIN_API.md` | API 文档 |
| `docs/PLUGIN_DEVELOPMENT.md` | 开发指南 |
