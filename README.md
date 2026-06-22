# OrbitStart
<img width="788" height="804" alt="图标cai" src="https://github.com/user-attachments/assets/489ebaf1-20fa-4a70-8b8d-988bbfec3044" />

<div align="center">

**A local-first resource workspace for Windows.**

把应用、文件夹、网址、脚本、书签、工作区和动作入口收进一个本地启动工作台。

![Version](https://img.shields.io/badge/version-0.5.7-2f81f7)
![Platform](https://img.shields.io/badge/platform-Windows-0078d4)
![Built with Tauri](https://img.shields.io/badge/Tauri-2.x-24c8db)
![License](https://img.shields.io/badge/license-MIT-green)

**Release 下载** · **本地优先** · **多主题** · **Windows 桌面外壳**

</div>

---

<!--
<p align="center">
  <img src="docs/images/dashboard.png" alt="OrbitStart dashboard" width="900" />
</p>
-->

<!--
<p align="center">
  <img src="docs/images/theme-studio.png" alt="OrbitStart theme studio" width="900" />
</p>
-->

<!--
<p align="center">
  <img src="docs/images/import-preview.png" alt="OrbitStart import preview" width="900" />
</p>
-->

## What Is OrbitStart?

OrbitStart 是一个面向 Windows 的本地资源工作台。它不是单纯的应用启动器，也不是浏览器书签管理器，而是把日常工作里分散的入口统一成一个可搜索、可分组、可收藏、可导入、可主题化的资源中心。

你可以把它理解成一个个人数字资源台：

- 常用软件：微信、浏览器、VS Code、Photoshop、Excel。
- 本地文件：项目文件夹、数据目录、论文目录、素材库。
- 在线入口：GitHub、ChatGPT、控制台、课程链接、文档网站。
- 自动化入口：PowerShell、Python、批处理脚本。
- 工作区入口：一个动作链按顺序打开多个应用、文件夹和网页。


## Why It Exists

Windows 桌面、开始菜单、浏览器书签和文件夹各自解决了一部分入口问题，但长期使用后资源会变得分散。OrbitStart 尝试解决的是这些问题：

- 桌面快捷方式越来越乱。
- 浏览器书签只能管理网页，不能管理本地应用和文件。
- 普通启动器偏搜索，不一定适合长期整理工作流。
- 不同任务场景需要不同资源组合，例如剪辑、科研、学习、开发、数据分析。
- 常用入口需要启动记录、收藏、标签和导入备份，而不只是一个快捷方式。

## Download

OrbitStart 面向普通用户的使用方式是从 **GitHub Releases** 下载 Windows 安装包。

1. 打开本仓库的 **Releases** 页面。
2. 下载最新版安装包，通常命名类似：

   ```text
   OrbitStart_0.5.7_x64-setup.exe
   ```

3. 运行安装包并按提示完成安装。

> 普通用户不需要安装 Node.js、Rust、Tauri 或任何开发环境。

## Highlights

- **Local-first**：资源目录、插件状态、主题设置和备份都保存在本机。
- **统一资源模型**：应用、文件、文件夹、网址、脚本和动作链使用同一套管理方式。
- **快速搜索**：按标题、路径、别名、标签、分组和插件结果查找资源。
- **标签与收藏**：内置分组、自定义分组、星标资源和启动次数统计。
- **快速导入**：扫描桌面/开始菜单快捷方式，导入 Edge/Chrome 书签。
- **动作链**：用一个入口顺序打开多个目标。
- **多主题**：Local Galaxy、Zentou Wireframe、People's Platform、Creative Mode 和 Atelier 系列主题。
- **桌面化基础**：自定义标题栏、系统托盘、全局快捷键、自定义右键菜单、关闭到托盘。
- **插件雏形**：manifest-first 插件结构、权限展示、启用/停用、安全模式和日志。

## Product Preview

### Resource Workspace

集中管理常用资源，并按真实任务进行整理。

<img width="712" height="503" alt="e3ccf32b6054aaa1ad1dfb5ed868f44" src="https://github.com/user-attachments/assets/c1b1466c-b30e-4464-a105-94b0bf63300c" />

### Theme Studio

内置多套主题，支持通过主题 token 切换视觉风格。

<img width="1416" height="1639" alt="all-themes-contact-sheet" src="https://github.com/user-attachments/assets/e0eeb14e-0080-4fbf-92b2-4927b943cc23" />

### Import Flow

扫描本地程序和浏览器书签，在导入前预览、筛选和排除卸载项。

<img width="311" height="314" alt="image" src="https://github.com/user-attachments/assets/ead9c276-3c63-4275-8fda-4524d3928bdf" />

## Typical Workflows

**视频剪辑**

把 Premiere Pro、Photoshop、DaVinci Resolve、素材文件夹、字体网站、音效库和项目目录放进同一个剪辑分组。

**编程开发**

把 VS Code、GitHub 仓库、本地项目文件夹、API 文档、本地服务地址和终端脚本集中管理。

**学习与课程**

把课件、教材 PDF、Obsidian 笔记、网课链接、翻译工具和检索网站收进一个学习工作区。

**科研与文献**

把 Zotero、Obsidian Vault、PubMed、Google Scholar、论文文件夹和分析脚本整理到同一入口。

**日常工具中心**

把微信、浏览器、Everything、Clash Verge、ChatGPT 和常用文件夹设为星标资源。

## Data And Privacy

OrbitStart 默认使用本地数据目录：

```text
%APPDATA%\OrbitStart
```

主要内容包括：

```text
orbit.db        本地 SQLite 数据库
plugins\        本地插件目录
themes\         本地主题目录
backups\        JSON 备份目录
```

当前版本没有云同步逻辑。资源数据默认留在用户本机。

## Extension Model

OrbitStart 的插件系统目前采用 manifest-first 方式：

- 插件通过 `plugin.json` 声明名称、版本、权限和贡献能力。
- 插件可在插件管理页启用或停用。
- 安全模式会临时禁用第三方本地插件。
- 插件事件会写入本地日志。

当前插件系统仍处于早期阶段。它已经具备 manifest、权限、启停和日志等基础结构，但第三方插件隔离运行时、签名验证、完整插件 API 还在后续路线中。

## Themes

主题通过 CSS tokens 定义颜色、字体、圆角、阴影和状态样式。Local Galaxy 额外使用本地 bitmap 素材构建深空、暗金、青绿高光的桌面视觉层。

当前内置主题包括：

- Local Galaxy
- Zentou Wireframe
- People's Platform
- Creative Mode
- Atelier Zero / Charcoal / Mint / Sky / Pink / Grey / Lavender
- Atelier Rust / Coal / Abyss / Amber

## Roadmap

- 更强的搜索排序、拼音/缩写/模糊匹配。
- 更完整的工作区模式和动作链能力。
- Everything、Obsidian、浏览器 profile 等深度集成。
- 插件隔离运行时、插件 API 和插件包验证。
- 更完善的新手引导、示例资源包和主题包分享。
- 自动更新、签名发布和更完整的 Release channel。
<img width="493" height="441" alt="image" src="https://github.com/user-attachments/assets/c43d33ef-4615-45a0-9c67-3749f5720a52" />

## Current Boundaries

- 当前主要面向 Windows。
- 插件系统仍偏早期，不能等同于成熟插件生态。
- Everything 搜索、窗口切换等高级能力目前更接近扩展入口，尚未形成完整原生 provider。
- 动作链已能顺序打开多个目标，但还没有条件、延时、参数模板或错误恢复。

## Tech Snapshot

- Desktop: Tauri 2
- Frontend: React 18, TypeScript, Vite
- Storage: SQLite
- UI icons: lucide-react + extracted local app icons
- Test tooling: Playwright
- License: MIT

## License

OrbitStart is released under the [MIT License](LICENSE).
