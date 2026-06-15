# OrbitStart

OrbitStart 是一个本地优先、可扩展的 Windows 启动工作台，你可以把看作一个拥有很多收纳盒的收纳柜，它可以将应用、网址、文件、工作区、脚本、插件和动作入口汇聚到一个统一的资源中心。它的理念不是替代系统桌面，而是为用户建立一个更清晰、更高效的「个人启动中枢」：你可以按照真实任务来组织数字资源，而不是让资源散落在桌面、开始菜单、浏览器书签和不同文件夹里。

例如，做剪辑工作时，可以创建一个「剪辑」标签，把 Premiere Pro、Photoshop、DaVinci Resolve、素材文件夹、字体库、音效网站、视频素材网站和常用导出目录放在一起；做数据分析时，可以创建一个「数据分析」标签，把 Word、Excel、Python/R 脚本、数据查看软件、统计分析工具、作图软件和在线可视化网站集中管理；做课程学习时，也可以把课件文件夹、笔记软件、教材 PDF、网课链接、翻译工具和常用检索网站整理成一个「学习」工作区。这样一来，我们便不需要在大量应用、网页和文件之间反复查找，只需要通过搜索、分类、收藏或标签快速进入对应任务环境。

使用 OrbitStart 后，电脑中的数字资源会从零散的入口变成有组织的工作流。无论是学习、剪辑、开发、科研、办公还是资料管理，用户都可以更快找到需要的工具和内容，减少重复切换和查找成本，让日常操作更加集中、高效、顺畅和可控。

## 当前状态

当前版本：`0.4.0`

OrbitStart 目前是一个基于 Tauri 2、React 18、TypeScript 和 SQLite 的 Windows 桌面应用。核心功能已经可用，插件系统和主题系统处于早期可扩展阶段，适合继续迭代为个人启动器、工作流入口或本地效率工具。

## 主要功能

- 资源中心：管理应用、网址、文件、文件夹、工作区、脚本和动作链。
- 快速搜索：通过名称、路径、别名、标签和插件结果查找资源。
- 标签分组：内置应用、工作区、网址、脚本、插件分组，并支持自定义分组。
- 收藏与统计：支持收藏资源、启动次数和最近启动时间记录。
- 批量管理：批量选择资源后移动分组或删除。
- 拖拽创建：将桌面快捷方式、文件、文件夹或脚本拖入窗口即可创建资源。
- Windows 扫描：扫描桌面和开始菜单快捷方式，并尽量提取真实应用图标。
- 浏览器书签导入：支持从 Edge/Chrome 书签文件导入网址资源。
- 动作链：一个入口按顺序启动多个应用、文件夹或网页。
- 插件管理：查看插件清单、权限、状态、详情，并可启用或停用插件。
- 主题工作室：内置多套主题，默认主题为 Local Galaxy，并支持主题 token 扩展。
- 桌面外壳：自定义标题栏、托盘菜单、全局快捷键、右键菜单和外部链接拦截。
- 数据备份：导出或导入本地 JSON 备份。

## 技术栈

- 桌面框架：Tauri 2
- 前端：React 18、TypeScript、Vite
- 本地存储：SQLite，运行时数据位于 `%APPDATA%\OrbitStart`
- 图标：Lucide React 和本地提取的应用图标
- 自动化测试：Playwright

## 项目结构

```text
OrbitStart/
  src/                    前端应用、桌面外壳、插件 API、主题资源映射
  src/components/         复用组件
  src/data/               浏览器预览和内置 catalog 数据
  src/desktop/            桌面行为：快捷键、右键菜单、窗口控制、外部打开
  src/lib/                Tauri native 调用封装
  src/plugin/             插件宿主 API
  src/theme/              Local Galaxy 资产映射
  src-tauri/              Tauri/Rust 后端、SQLite、系统托盘、窗口和原生命令
  design/                 设计文档和 Local Galaxy 工程化素材
  docs/                   插件、主题和验证文档
  plugins/                示例插件
  registry/               插件和主题 registry 示例
  tests/                  Playwright 和自定义测试
  themes/                 示例主题包
  tools/                  开发工具脚本
```

## 运行源码

环境要求：

- Windows 10/11
- Node.js 18 或更高版本
- Rust stable
- Tauri 2 所需的 Windows WebView2 运行环境

安装依赖：

```powershell
npm.cmd install
```

启动前端开发服务器：

```powershell
npm.cmd run dev
```

启动 Tauri 桌面应用：

```powershell
npm.cmd run tauri:dev
```

## 构建

```powershell
npm.cmd run build
npm.cmd run tauri:build
```

常见构建产物：

```text
src-tauri\target\release\orbitstart.exe
src-tauri\target\release\bundle\nsis\OrbitStart_0.4.0_x64-setup.exe
src-tauri\target\release\bundle\msi\OrbitStart_0.4.0_x64_en-US.msi
```

## 测试

```powershell
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:custom
```

如果只做静态验证，至少运行：

```powershell
npm.cmd run build
cargo check --manifest-path src-tauri\Cargo.toml
```

## 数据位置

OrbitStart 采用本地优先策略，默认不会把用户资源上传到远端服务。运行时数据位于：

```text
%APPDATA%\OrbitStart
```

主要内容：

```text
orbit.db        本地 SQLite 数据库
plugins\        用户本地插件
themes\         用户本地主题
backups\        JSON 备份
```

## 插件系统

插件以 manifest 为中心，目前已稳定的能力包括：

- 注册命令
- 提供搜索结果
- 显示 toast 反馈
- 声明权限和贡献项
- 启用、停用和安全模式隔离

创建示例插件：

```powershell
npm.cmd run package:plugin -- -PluginPath .\plugins\hello-command
```

更多说明见：

- `docs\PLUGIN_API.md`
- `docs\PLUGIN_DEVELOPMENT.md`

## 主题系统

主题通过 token 控制界面颜色、字体、圆角、阴影和状态样式。Local Galaxy 主题使用工程化素材映射，非 Local Galaxy 主题优先走纯色和 CSS token，避免素材混用导致视觉污染。

更多说明见：

- `docs\THEME_DEVELOPMENT.md`
- `design\local-galaxy\VISUAL_GUIDE.md`
- `design\local-galaxy\USAGE_MAP.md`

## Git 忽略策略

仓库应提交源码、文档、示例插件、主题、设计素材和配置文件；不提交以下内容：

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `output/`
- `.playwright-cli/`
- 本地日志、stackdump、IDE 配置和 agent 私有目录

这些规则已经写入 `.gitignore`。

## 已知边界

- 第三方插件执行隔离仍处于早期阶段，当前更接近 manifest 驱动和宿主 API 原型。
- Everything 搜索、窗口切换等高级能力已有插件入口，但还没有完整原生 provider。
- 自动更新、签名和公开 release channel 还未完成。
- 当前主要面向 Windows，其他平台需要额外适配和测试。

## License

OrbitStart 使用 MIT License。详见 `LICENSE`。
