# OrbitStart Hyperframes 视频 Outline

## 当前状态

本轮已先完成图标统一，再重新截图。

- 左上角标题栏图标与侧边栏品牌图标已统一为新图标：`E:\OrbitStart\design\app-icons\orbitstart-first-icon-ui.png`
- Tauri 打包图标已同步为：`E:\OrbitStart\src-tauri\icons\icon.ico`
- 开发预览 favicon 已同步为：`E:\OrbitStart\public\favicon.png`
- 主题截图已重新生成，旧 Local Galaxy 图标不再出现在左上角品牌位。

本文件按你修改后的 `script.md` 更新，重点新增“多主题”段落。

## 对齐点

本轮仍先完成脚本和节奏设计，暂不进入完整 HTML 实现。确认后再写：

`E:\OrbitStart\orbitstart-video\presentation\index.html`

需要确认的 5 件事：

1. 口播稿是否采用 `script.md` 当前版本。
2. 分镜节奏是否采用本 outline。
3. 模板是否确认使用 Open Design 的 `video-hyperframes`。
4. 素材是否使用当前重新截图后的页面图、15 个主题图和生成转场图。
5. 开发模式是否按“可点击 HTML 预览 + 后续可录屏/转 Remotion”的方式推进。

## 模板基线

主模板：

`E:\OrbitStart\orbitstart-video\template\video-hyperframes-example.html`

页面规格：

- 16:9
- 1920x1080 设计基准
- 每个叙事点对应一个 `<section class="frame">`
- 每帧保留 `data-duration`
- 文件底部保留 `HYPERFRAMES_META`
- 支持自动播放、方向键、点击切换和暂停

## 主题素材确认

当前已装载并截图 15 套主题：

- 高级主题：Local Galaxy、Zentou Wireframe、People's Platform、Creative Mode
- 基础主题 - 亮色：Atelier Zero、Atelier Charcoal、Atelier Mint、Atelier Sky、Atelier Pink、Atelier Grey、Atelier Lavender
- 基础主题 - 暗色：Atelier Rust、Atelier Coal、Atelier Abyss、Atelier Amber

总览图：

`E:\OrbitStart\orbitstart-video\assets\screenshots\themes\all-themes-contact-sheet.png`

## 节奏结构

### Frame 01：问题

信息密度：低

核心句：`入口不该散落`

素材：`assets/generated/orbitstart-orbit-transition.png`

作用：对应脚本里“将近 100 个程序”的开场，把注意力消耗讲清楚，不急着展示功能。

### Frame 02：产品身份

信息密度：中

核心句：`收纳是一项艺术`

素材：`assets/screenshots/dashboard.png`

作用：用新版左上角图标和资源中心截图建立产品身份，突出“本地优先的 Windows 启动工作台”和“收纳盒”隐喻。

### Frame 03：资源中心

信息密度：中

核心句：`应用、文件、网址、脚本，统一索引`

素材：`assets/screenshots/dashboard.png`

作用：解释每个入口都有名称、分组、标签、别名、启动次数和最近使用记录。

### Frame 04：搜索与命令

信息密度：中

核心句：`直达目标，无需到处翻找`

素材：`assets/screenshots/command-palette.png`

作用：突出命令面板把资源、命令和插件结果放到同一入口里。

### Frame 05：本地导入

信息密度：中

核心句：`扫描本地程序，导入浏览器书签`

素材：`assets/screenshots/dashboard.png`

作用：说明桌面、开始菜单快捷方式和 Edge/Chrome 书签可以被收进工作台。

### Frame 06：动作链

信息密度：中

核心句：`一个入口，启动一组工作流`

素材：`assets/screenshots/dashboard.png`

作用：把 OrbitStart 从“启动器”推进到“工作流入口”，对应开发、剪辑、学习、科研等多工具场景。

### Frame 07：引擎与插件

信息密度：中偏高

核心句：`插件是引擎，也是边界`

素材：`assets/screenshots/command-palette.png`

作用：说明 manifest、命令注册、搜索结果、权限声明、启用/停用，同时保留“早期可扩展阶段”的边界。

### Frame 08：轨道控制

信息密度：中

核心句：`可控的桌面外壳`

素材：`assets/screenshots/settings.png`

作用：覆盖密度、全局热键、安全模式、关闭行为和主页动作。

### Frame 09：主题工作室

信息密度：中

核心句：`Local Galaxy：你的本地星系`

素材：

- `assets/screenshots/theme-studio.png`
- `assets/screenshots/themes/theme-studio-all.png`

作用：从 Local Galaxy 进入主题系统，说明主题由 token 驱动，不只是单一深色皮肤。

### Frame 10：基础主题

信息密度：中

核心句：`基础主题，适应不同环境`

素材：

- `assets/screenshots/themes/atelier-zero.png`
- `assets/screenshots/themes/atelier-sky.png`
- `assets/screenshots/themes/atelier-grey.png`
- `assets/screenshots/themes/atelier-coal.png`
- `assets/screenshots/themes/atelier-abyss.png`

作用：对应脚本 9.2，展示亮色、冷色、灰度和暗色基础主题，强调不同光照环境下都能使用。

### Frame 11：高级主题

信息密度：中

核心句：`多样主题，满足不同审美`

素材：

- `assets/screenshots/themes/local-galaxy.png`
- `assets/screenshots/themes/orbit-dark.png`
- `assets/screenshots/themes/ink-blue.png`
- `assets/screenshots/themes/creative-mode.png`
- `assets/screenshots/themes/all-themes-contact-sheet.png`

作用：对应脚本 9.3，展示 Local Galaxy 之外的高风格主题，强调不是只有星空风格一种表达。

### Frame 12：本地数据

信息密度：中

核心句：`数据留在本地，资源入口可备份`

素材：`assets/screenshots/settings.png`

作用：强调 `%APPDATA%\OrbitStart`、本地目录组织和 JSON 备份。

### Frame 13：状态与反馈

信息密度：低

核心句：`安静运行，可追踪反馈`

素材：`assets/screenshots/logs.png`

作用：说明运行日志记录引擎事件、扫描结果和系统反馈。

### Frame 14：收束

信息密度：低

核心句：`OrbitStart：探索无限，始于本地`

素材：

- `assets/generated/orbitstart-orbit-transition.png`
- `assets/screenshots/themes/all-themes-contact-sheet.png`
- `assets/generated/local-galaxy-silk-depth.png`

作用：从“散落入口”回到“本地、清楚、可控的工作台”，以新图标和多主题截图收束，而不是只回到 Local Galaxy。

## 建议时长

| Frame | 建议时长 |
| --- | --- |
| 01 | 8 秒 |
| 02 | 10 秒 |
| 03 | 9 秒 |
| 04 | 9 秒 |
| 05 | 8 秒 |
| 06 | 9 秒 |
| 07 | 10 秒 |
| 08 | 9 秒 |
| 09 | 10 秒 |
| 10 | 10 秒 |
| 11 | 10 秒 |
| 12 | 8 秒 |
| 13 | 7 秒 |
| 14 | 7 秒 |

总时长约 124 秒。若口播速度偏慢，可把 Frame 09-11 各延长 2 秒，总时长约 2 分 10 秒。

## 素材清单

### 已就位

- 新图标源图：`E:\OrbitStart\design\app-icons\orbitstart-first-icon-ui.png`
- 新 Tauri 图标：`E:\OrbitStart\src-tauri\icons\icon.ico`
- 新 favicon：`E:\OrbitStart\public\favicon.png`
- 主流程截图：`E:\OrbitStart\orbitstart-video\assets\screenshots\dashboard.png`
- 设置截图：`E:\OrbitStart\orbitstart-video\assets\screenshots\settings.png`
- 命令面板截图：`E:\OrbitStart\orbitstart-video\assets\screenshots\command-palette.png`
- 主题工作室截图：`E:\OrbitStart\orbitstart-video\assets\screenshots\theme-studio.png`
- 日志截图：`E:\OrbitStart\orbitstart-video\assets\screenshots\logs.png`
- 全主题截图目录：`E:\OrbitStart\orbitstart-video\assets\screenshots\themes`
- GPT-image 转场图：`E:\OrbitStart\orbitstart-video\assets\generated\orbitstart-orbit-transition.png`
- Local Galaxy 质感图：`E:\OrbitStart\orbitstart-video\assets\generated\local-galaxy-silk-depth.png`

### 使用注意

- 主题段落不要只展示 Local Galaxy，应明确出现基础亮色、基础暗色和高级主题三类。
- 左上角品牌位必须使用新图标截图，避免旧 Local Galaxy 图标混入最终视频素材。
- 多主题镜头用于说明“适配不同环境和审美”，不要把主题系统讲成单纯换皮肤。

