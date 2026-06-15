# Local Galaxy Usage Map

Updated: 2026-06-14

| 素材名 | 当前用途 | 正确用途 | 是否需要移动 | opacity | 组件位置 |
| --- | --- | --- | --- | --- | --- |
| `主背景图.png` | 主题背景底图 | 只作为整页背景底层，不作为控件背景 | 否 | 0.68-0.76 | `LocalGalaxyBackdrop` / `.galaxy-layer-main` |
| `星云叠加层.png` | 背景柔光叠层 | 整页背景的低强度星云层 | 已降低强度 | 0.12-0.16 | `LocalGalaxyBackdrop` / `.galaxy-layer-nebula` |
| `顶部流光.png` | 顶部氛围层 | 顶部弱光，不穿过标题和按钮 | 已上移并降低强度 | 0.10-0.16 | `LocalGalaxyBackdrop` / `.galaxy-layer-top-flow` |
| `大轨道线装饰.png` | 可选背景远景装饰 | 低 opacity 远景轨道线，不压内容 | 已降低强度 | 0.08-0.10 | `LocalGalaxyBackdrop` / `.galaxy-layer-orbit` |
| `细星点纹理.png` | 背景星点纹理 | 极淡背景纹理 | 否 | 0.12-0.18 | `LocalGalaxyBackdrop` / `.galaxy-layer-stars` |
| `图标底座：青绿色.png` | 派生源文件 | 仅用于生成 resource icon shell，不直接进 UI | 是，已降级为 source/reserved | source | `localGalaxyAssets.icons.baseCyan` |
| `图标底座：紫蓝色.png` | 派生源文件 | 仅用于生成 resource icon shell，不直接进 UI | 是，已降级为 source/reserved | source | `localGalaxyAssets.icons.basePurple` |
| `icon-shell-teal-64.png` | 资源卡片图标底座 | app/file/folder 等资源图标 shell，真实图标叠加在上面 | 否 | 1 | `ResourceCard` / `.resource-icon` background |
| `icon-shell-violet-64.png` | 资源卡片图标底座 | website/script/action_chain 等资源图标 shell，真实图标叠加在上面 | 否 | 1 | `ResourceCard` / `.resource-icon` background |
| `icon-shell-teal-128.png` | 高分辨率备用 shell | 高 DPI 或后续设置项预览备用 | 否 | 1 | asset map，暂未正式 UI 调用 |
| `icon-shell-violet-128.png` | 高分辨率备用 shell | 高 DPI 或后续设置项预览备用 | 否 | 1 | asset map，暂未正式 UI 调用 |
| `收藏星标素材.png` | 派生源文件 | 仅用于生成 favorite active 小图标，不作为装饰 | 是，已降级为 source/reserved | source | `localGalaxyAssets.icons.favoriteStar` |
| `favorite-star-16.png` | favorite 小尺寸备用 | favorite=true 的小型收藏状态 | 否 | 1 | asset map，暂未正式 UI 调用 |
| `favorite-star-20.png` | 收藏激活状态图标 | 仅 favorite=true 的资源卡片收藏按钮 | 否 | 1 | `ResourceCard` / `.favorite-action.is-favorite img` |
| `favorite-star-24.png` | favorite 高分辨率备用 | 高 DPI 或后续详情页收藏状态备用 | 否 | 1 | asset map，暂未正式 UI 调用 |
| `日志页列表背景纹理.png` | 日志面板内部纹理 | 仅 `.logs-panel::before`，不铺满页面，不作为行背景 | 已移动到面板伪元素 | 0.10 | `LogsPanel` / `.logs-panel::before` |
| `搜索框高光边缘.png` | 搜索框交互效果 | 只用于 search focus | 否 | 0.48 | `.search-shell:focus-within::before` |
| `分类标签激活光.png` | active tab 交互效果 | 只用于 active tab | 否 | 0.38 | `.group-tabs button.selected::before` |
| `青绿色柔光.png` | 主按钮 hover 背光 | 只用于主按钮 hover/focus 类交互 | 否 | 0.28 on hover | `.primary-action:hover::after` |
| `暗金柔光.png` | Logo 区弱背光 | 低强度 Logo 区辅助光 | 否 | 0.16 | `.brand-mark::before` |
| `星形指南针装饰.png` | Logo 区弱装饰 | 低 opacity 小装饰，不压内容 | 否 | 0.18 | `.brand-mark::after` |
| `设置页左侧星图装饰.png` | 设置菜单装饰 | 设置页左侧低强度装饰 | 否 | 0.18 | `.view-settings .settings-menu::after` |
| `加载扫描轨道图.png` | 空状态装饰 | 只用于空状态/扫描类区域 | 否 | 0.22 | `.empty-state::before` |
| `通用面板细边框.png` | Asset Lab 对比素材 | 不作为主面板/卡片/搜索框边框 | 否，保持禁用 | reserved | asset map only |
| `面板角饰.png` | 备用装饰 | 仅大面板角落备用，不默认启用 | 否，保持禁用 | reserved | asset map only |
| `横向徽章.png` | 备用徽章素材 | 需要裁切后才适合正式 UI | 否，保持禁用 | reserved | asset map only |

## Checks

- Resource icon shell only appears through `--asset-icon-base` on `.resource-icon`.
- Real app icons remain rendered above the shell through the `Icon` component.
- Favorite image icon only appears when `item.favorite === true`; inactive state still uses the Lucide line star.
- Log texture only appears on `.logs-panel::before`.
- Main panel/search/card borders remain CSS borders and shadows; image borders are not used as primary UI borders.
