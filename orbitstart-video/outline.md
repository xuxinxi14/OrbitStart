# OrbitStart Hyperframes 视频 Outline

## 修订目标

本轮根据反馈重组视频：

- 不再使用“我有多少程序”“当前机器有多少资源”等个人化或临时数据。
- 叙事从“作者自述”改为“面向普通观众的产品演示”。
- 所有产品截图必须完整呈现，使用 `object-fit: contain`，不为了构图裁掉边缘。
- 支持鼠标单击、方向键、空格播放、鼠标滚轮前进/后退。
- 片尾版本号改为 `OrbitStart 0.4.5`。

## 参考经验

重新组织时采用的原则：

- 开场先讲观众能感知的问题，再给产品定位。
- 产品演示要展示真实使用场景，而不是堆叠功能名。
- 每个镜头聚焦一个动作：导入、整理、搜索、启动工作流、控制、反馈。
- 保留截图完整性。截图是证据，不是背景装饰。

## 模板基线

实现文件：

`E:\OrbitStart\orbitstart-video\presentation\index.html`

页面规格：

- 16:9
- 1920x1080 设计基准
- 12 帧
- 每帧一个叙事点
- 图片默认完整显示
- 支持 `?frame=05` 指定帧
- 支持 `?auto=1` 自动播放

## 节奏结构

### Frame 01：问题

核心句：`工作入口，不该到处散落`

信息密度：低

素材：`assets/generated/orbitstart-orbit-transition.png`

作用：建立“多入口切换造成启动成本”的普遍问题，不再使用个人电脑上的具体数量。

### Frame 02：产品定位

核心句：`本地优先的启动工作台`

信息密度：中

素材：`assets/screenshots/dashboard.png`

作用：说明 OrbitStart 是本地优先的 Windows 启动工作台。截图必须完整显示。

### Frame 03：本地导入

核心句：`先接住已有入口`

信息密度：中

素材：`assets/user-supplied/local-import.png`

作用：展示扫描本地程序与导入前确认，强调从真实使用环境开始。

### Frame 04：资源整理

核心句：`把入口变成资源节点`

信息密度：中

素材：`assets/user-supplied/action-chain.png`

作用：展示完整资源中心，让应用、网站、文件、脚本变成可整理的入口地图。

### Frame 05：搜索与命令

核心句：`用搜索进入下一步`

信息密度：中

素材：`assets/screenshots/command-palette.png`

作用：展示命令面板如何统一资源、命令和插件结果。

### Frame 06：动作链

核心句：`一次启动一组工作流`

信息密度：中

素材：`assets/user-supplied/action-chain.png`

作用：把产品从“启动器”推进到“工作流入口”，用节点图解释连续动作。

### Frame 07：插件与边界

核心句：`扩展能力，也定义边界`

信息密度：中

素材：

- `assets/icon/orbitstart-icon.png`
- `assets/screenshots/command-palette.png`

作用：说明 manifest、命令注册、搜索结果、权限声明、启用/停用。

### Frame 08：轨道控制

核心句：`把桌面外壳交还给用户`

信息密度：中

素材：`assets/screenshots/settings.png`

作用：说明全局热键、安全模式、关闭行为和主页动作等设置项。

### Frame 09：主题系统

核心句：`不止一套星空皮肤`

信息密度：中

素材：

- `assets/screenshots/themes/local-galaxy.png`
- `assets/screenshots/themes/atelier-zero.png`
- `assets/screenshots/themes/creative-mode.png`
- `assets/screenshots/themes/atelier-abyss.png`

作用：展示多主题能力，明确 Local Galaxy 只是其中一种风格。

### Frame 10：本地数据

核心句：`资源入口可以迁移和备份`

信息密度：中

素材：`assets/screenshots/settings.png`

作用：说明数据围绕本地目录组织，并支持导出备份。

### Frame 11：状态反馈

核心句：`安静运行，也要可追踪`

信息密度：中

素材：`assets/screenshots/logs.png`

作用：说明日志用于记录引擎事件、扫描结果和系统反馈。

### Frame 12：收束

核心句：`OrbitStart：探索无限，始于本地`

信息密度：低

素材：

- `assets/generated/orbitstart-orbit-transition.png`
- `assets/generated/local-galaxy-silk-depth.png`
- `assets/screenshots/themes/all-themes-contact-sheet.png`
- `assets/icon/orbitstart-icon.png`

作用：用品牌图标、多主题和本地工作台概念收束，片尾显示 `OrbitStart 0.4.5`。

## 建议时长

| Frame | 建议时长 |
| --- | --- |
| 01 | 7.5 秒 |
| 02 | 8.5 秒 |
| 03 | 7.5 秒 |
| 04 | 8.5 秒 |
| 05 | 8 秒 |
| 06 | 8.5 秒 |
| 07 | 8.5 秒 |
| 08 | 7.8 秒 |
| 09 | 9 秒 |
| 10 | 7.8 秒 |
| 11 | 7 秒 |
| 12 | 7 秒 |

总时长约 96 秒。

## 素材清单

- 新图标：`E:\OrbitStart\orbitstart-video\assets\icon\orbitstart-icon.png`
- 主流程截图：`E:\OrbitStart\orbitstart-video\assets\screenshots\dashboard.png`
- 本地导入截图：`E:\OrbitStart\orbitstart-video\assets\user-supplied\local-import.png`
- 动作链/真实资源中心截图：`E:\OrbitStart\orbitstart-video\assets\user-supplied\action-chain.png`
- 命令面板截图：`E:\OrbitStart\orbitstart-video\assets\screenshots\command-palette.png`
- 设置截图：`E:\OrbitStart\orbitstart-video\assets\screenshots\settings.png`
- 日志截图：`E:\OrbitStart\orbitstart-video\assets\screenshots\logs.png`
- 多主题总览：`E:\OrbitStart\orbitstart-video\assets\screenshots\themes\all-themes-contact-sheet.png`
- 主题缩略墙：`local-galaxy.png`、`atelier-zero.png`、`creative-mode.png`、`atelier-abyss.png`
- GPT-image 转场图：`E:\OrbitStart\orbitstart-video\assets\generated\orbitstart-orbit-transition.png`
- Local Galaxy 质感图：`E:\OrbitStart\orbitstart-video\assets\generated\local-galaxy-silk-depth.png`

## 使用注意

- 产品截图只作证据展示，不作裁切背景。
- 面向普通观众，不使用作者本人、当前电脑、当前资源数量作为核心卖点。
- 每帧只讲一个动作，避免同时解释过多功能。
- 鼠标滚轮向下进入下一帧，向上返回上一帧。
