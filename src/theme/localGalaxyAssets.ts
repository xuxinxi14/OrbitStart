export type LocalGalaxyAssetCategory = "backgrounds" | "effects" | "ornaments" | "icons" | "textures" | "frames";
export type LocalGalaxyAssetStage = "safe" | "enhancement" | "ornament" | "reserved";

export interface LocalGalaxyAsset {
  id: string;
  fileName: string;
  src: string;
  category: LocalGalaxyAssetCategory;
  stage: LocalGalaxyAssetStage;
  transparent: boolean;
  recommendedUse: string;
  recommendedOpacity: string;
  recommendedBlendMode: string;
  directUi: boolean;
  needsPreprocessing: boolean;
}

export const localGalaxyAssetList: LocalGalaxyAsset[] = [
  {
    id: "mainBackground",
    fileName: "主背景图.png",
    src: new URL("../../design/local-galaxy/assets/backgrounds/主背景图.png", import.meta.url).href,
    category: "backgrounds",
    stage: "safe",
    transparent: false,
    recommendedUse: "整页主题背景",
    recommendedOpacity: "1",
    recommendedBlendMode: "normal",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "emptyIllustration",
    fileName: "空状态插画.png",
    src: new URL("../../design/local-galaxy/assets/backgrounds/空状态插画.png", import.meta.url).href,
    category: "backgrounds",
    stage: "reserved",
    transparent: false,
    recommendedUse: "空状态大图或关于页插画",
    recommendedOpacity: "1",
    recommendedBlendMode: "normal",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "nebulaOverlay",
    fileName: "星云叠加层.png",
    src: new URL("../../design/local-galaxy/assets/backgrounds/星云叠加层.png", import.meta.url).href,
    category: "backgrounds",
    stage: "safe",
    transparent: true,
    recommendedUse: "整页柔和星云叠层",
    recommendedOpacity: "0.16-0.35",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "topFlow",
    fileName: "顶部流光.png",
    src: new URL("../../design/local-galaxy/assets/effects/顶部流光.png", import.meta.url).href,
    category: "effects",
    stage: "safe",
    transparent: true,
    recommendedUse: "顶部标题区域流光",
    recommendedOpacity: "0.35-0.70",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "dividerGlow",
    fileName: "分隔线高光.png",
    src: new URL("../../design/local-galaxy/assets/effects/分隔线高光.png", import.meta.url).href,
    category: "effects",
    stage: "safe",
    transparent: true,
    recommendedUse: "分隔线和标题栏高光",
    recommendedOpacity: "0.35-0.65",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "cyanGlow",
    fileName: "青绿色柔光.png",
    src: new URL("../../design/local-galaxy/assets/effects/青绿色柔光.png", import.meta.url).href,
    category: "effects",
    stage: "enhancement",
    transparent: true,
    recommendedUse: "搜索 focus、主按钮 hover、状态点背光",
    recommendedOpacity: "0.06-0.18",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: true
  },
  {
    id: "goldGlow",
    fileName: "暗金柔光.png",
    src: new URL("../../design/local-galaxy/assets/effects/暗金柔光.png", import.meta.url).href,
    category: "effects",
    stage: "enhancement",
    transparent: true,
    recommendedUse: "Logo 区、收藏状态、面板暖色背光",
    recommendedOpacity: "0.08-0.22",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "searchEdge",
    fileName: "搜索框高光边缘.png",
    src: new URL("../../design/local-galaxy/assets/effects/搜索框高光边缘.png", import.meta.url).href,
    category: "effects",
    stage: "enhancement",
    transparent: true,
    recommendedUse: "搜索框 focus 边缘",
    recommendedOpacity: "0.45-0.75",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: true
  },
  {
    id: "activeTabGlow",
    fileName: "分类标签激活光.png",
    src: new URL("../../design/local-galaxy/assets/effects/分类标签激活光.png", import.meta.url).href,
    category: "effects",
    stage: "enhancement",
    transparent: true,
    recommendedUse: "active tab 背景光",
    recommendedOpacity: "0.45-0.75",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: true
  },
  {
    id: "logo",
    fileName: "OrbitStart Local Galaxy 图标.png",
    src: new URL("../../design/local-galaxy/assets/icons/OrbitStart Local Galaxy 图标.png", import.meta.url).href,
    category: "icons",
    stage: "safe",
    transparent: false,
    recommendedUse: "应用 Logo 和关于页主视觉",
    recommendedOpacity: "1",
    recommendedBlendMode: "normal",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "baseCyan",
    fileName: "图标底座：青绿色.png",
    src: new URL("../../design/local-galaxy/assets/icons/图标底座：青绿色.png", import.meta.url).href,
    category: "icons",
    stage: "reserved",
    transparent: true,
    recommendedUse: "资源图标底座源文件，仅用于生成派生 shell",
    recommendedOpacity: "source",
    recommendedBlendMode: "normal",
    directUi: false,
    needsPreprocessing: true
  },
  {
    id: "shellTeal128",
    fileName: "icon-shell-teal-128.png",
    src: new URL("../../design/local-galaxy/assets/icons/icon-shell-teal-128.png", import.meta.url).href,
    category: "icons",
    stage: "safe",
    transparent: true,
    recommendedUse: "资源卡片 icon shell 高分辨率版本",
    recommendedOpacity: "1",
    recommendedBlendMode: "normal",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "shellTeal64",
    fileName: "icon-shell-teal-64.png",
    src: new URL("../../design/local-galaxy/assets/icons/icon-shell-teal-64.png", import.meta.url).href,
    category: "icons",
    stage: "safe",
    transparent: true,
    recommendedUse: "44px 左右资源卡片 icon shell",
    recommendedOpacity: "1",
    recommendedBlendMode: "normal",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "basePurple",
    fileName: "图标底座：紫蓝色.png",
    src: new URL("../../design/local-galaxy/assets/icons/图标底座：紫蓝色.png", import.meta.url).href,
    category: "icons",
    stage: "reserved",
    transparent: true,
    recommendedUse: "资源图标底座源文件，仅用于生成派生 shell",
    recommendedOpacity: "source",
    recommendedBlendMode: "normal",
    directUi: false,
    needsPreprocessing: true
  },
  {
    id: "shellViolet128",
    fileName: "icon-shell-violet-128.png",
    src: new URL("../../design/local-galaxy/assets/icons/icon-shell-violet-128.png", import.meta.url).href,
    category: "icons",
    stage: "safe",
    transparent: true,
    recommendedUse: "资源卡片 icon shell 高分辨率版本",
    recommendedOpacity: "1",
    recommendedBlendMode: "normal",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "shellViolet64",
    fileName: "icon-shell-violet-64.png",
    src: new URL("../../design/local-galaxy/assets/icons/icon-shell-violet-64.png", import.meta.url).href,
    category: "icons",
    stage: "safe",
    transparent: true,
    recommendedUse: "44px 左右资源卡片 icon shell",
    recommendedOpacity: "1",
    recommendedBlendMode: "normal",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "favoriteStar",
    fileName: "收藏星标素材.png",
    src: new URL("../../design/local-galaxy/assets/icons/收藏星标素材.png", import.meta.url).href,
    category: "icons",
    stage: "reserved",
    transparent: true,
    recommendedUse: "收藏状态源文件，仅用于生成派生 favorite icon",
    recommendedOpacity: "source",
    recommendedBlendMode: "normal",
    directUi: false,
    needsPreprocessing: true
  },
  {
    id: "favoriteStar16",
    fileName: "favorite-star-16.png",
    src: new URL("../../design/local-galaxy/assets/icons/favorite-star-16.png", import.meta.url).href,
    category: "icons",
    stage: "safe",
    transparent: true,
    recommendedUse: "favorite=true 小型按钮状态",
    recommendedOpacity: "1",
    recommendedBlendMode: "normal",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "favoriteStar20",
    fileName: "favorite-star-20.png",
    src: new URL("../../design/local-galaxy/assets/icons/favorite-star-20.png", import.meta.url).href,
    category: "icons",
    stage: "safe",
    transparent: true,
    recommendedUse: "favorite=true 资源卡片收藏状态",
    recommendedOpacity: "1",
    recommendedBlendMode: "normal",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "favoriteStar24",
    fileName: "favorite-star-24.png",
    src: new URL("../../design/local-galaxy/assets/icons/favorite-star-24.png", import.meta.url).href,
    category: "icons",
    stage: "safe",
    transparent: true,
    recommendedUse: "favorite=true 高分辨率收藏状态",
    recommendedOpacity: "1",
    recommendedBlendMode: "normal",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "logTexture",
    fileName: "日志页列表背景纹理.png",
    src: new URL("../../design/local-galaxy/assets/textures/日志页列表背景纹理.png", import.meta.url).href,
    category: "textures",
    stage: "safe",
    transparent: false,
    recommendedUse: "运行日志列表区域纹理",
    recommendedOpacity: "0.10-0.22",
    recommendedBlendMode: "soft-light",
    directUi: true,
    needsPreprocessing: true
  },
  {
    id: "starTexture",
    fileName: "细星点纹理.png",
    src: new URL("../../design/local-galaxy/assets/textures/细星点纹理.png", import.meta.url).href,
    category: "textures",
    stage: "safe",
    transparent: true,
    recommendedUse: "极淡星点纹理",
    recommendedOpacity: "0.10-0.25",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "radarStatus",
    fileName: "小型雷达状态图.png",
    src: new URL("../../design/local-galaxy/assets/ornaments/小型雷达状态图.png", import.meta.url).href,
    category: "ornaments",
    stage: "safe",
    transparent: true,
    recommendedUse: "状态卡雷达点缀",
    recommendedOpacity: "0.35-0.65",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: true
  },
  {
    id: "compassStar",
    fileName: "星形指南针装饰.png",
    src: new URL("../../design/local-galaxy/assets/ornaments/星形指南针装饰.png", import.meta.url).href,
    category: "ornaments",
    stage: "enhancement",
    transparent: true,
    recommendedUse: "空白区或 Logo 区低强度装饰",
    recommendedOpacity: "0.20-0.45",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: true
  },
  {
    id: "largeOrbit",
    fileName: "大轨道线装饰.png",
    src: new URL("../../design/local-galaxy/assets/ornaments/大轨道线装饰.png", import.meta.url).href,
    category: "ornaments",
    stage: "ornament",
    transparent: true,
    recommendedUse: "背景远景轨道线",
    recommendedOpacity: "0.12-0.28",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "vintageAstrolabe",
    fileName: "复古星盘装饰.png",
    src: new URL("../../design/local-galaxy/assets/ornaments/复古星盘装饰.png", import.meta.url).href,
    category: "ornaments",
    stage: "ornament",
    transparent: true,
    recommendedUse: "侧边栏底部或设置装饰区",
    recommendedOpacity: "0.18-0.35",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "settingsStarMap",
    fileName: "设置页左侧星图装饰.png",
    src: new URL("../../design/local-galaxy/assets/ornaments/设置页左侧星图装饰.png", import.meta.url).href,
    category: "ornaments",
    stage: "ornament",
    transparent: true,
    recommendedUse: "设置页左侧装饰",
    recommendedOpacity: "0.25-0.55",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "scanOrbit",
    fileName: "加载扫描轨道图.png",
    src: new URL("../../design/local-galaxy/assets/ornaments/加载扫描轨道图.png", import.meta.url).href,
    category: "ornaments",
    stage: "ornament",
    transparent: true,
    recommendedUse: "扫描、导入或空状态",
    recommendedOpacity: "0.45-0.80",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: false
  },
  {
    id: "panelCorner",
    fileName: "面板角饰.png",
    src: new URL("../../design/local-galaxy/assets/frames/面板角饰.png", import.meta.url).href,
    category: "frames",
    stage: "ornament",
    transparent: true,
    recommendedUse: "大面板角落装饰",
    recommendedOpacity: "0.18-0.35",
    recommendedBlendMode: "screen",
    directUi: true,
    needsPreprocessing: true
  },
  {
    id: "thinPanelFrame",
    fileName: "通用面板细边框.png",
    src: new URL("../../design/local-galaxy/assets/frames/通用面板细边框.png", import.meta.url).href,
    category: "frames",
    stage: "reserved",
    transparent: true,
    recommendedUse: "仅用于 Asset Lab 对比，不作为主面板边框",
    recommendedOpacity: "0.55-0.90",
    recommendedBlendMode: "normal",
    directUi: false,
    needsPreprocessing: true
  },
  {
    id: "horizontalBadge",
    fileName: "横向徽章.png",
    src: new URL("../../design/local-galaxy/assets/icons/横向徽章.png", import.meta.url).href,
    category: "icons",
    stage: "ornament",
    transparent: true,
    recommendedUse: "横向徽章或精选插件卡片",
    recommendedOpacity: "0.70-1",
    recommendedBlendMode: "normal",
    directUi: false,
    needsPreprocessing: true
  }
];

export const localGalaxyAssets = {
  backgrounds: {
    main: localGalaxyAssetList.find((asset) => asset.id === "mainBackground")!,
    nebula: localGalaxyAssetList.find((asset) => asset.id === "nebulaOverlay")!,
    emptyIllustration: localGalaxyAssetList.find((asset) => asset.id === "emptyIllustration")!
  },
  effects: {
    topFlow: localGalaxyAssetList.find((asset) => asset.id === "topFlow")!,
    dividerGlow: localGalaxyAssetList.find((asset) => asset.id === "dividerGlow")!,
    cyanGlow: localGalaxyAssetList.find((asset) => asset.id === "cyanGlow")!,
    goldGlow: localGalaxyAssetList.find((asset) => asset.id === "goldGlow")!,
    searchEdge: localGalaxyAssetList.find((asset) => asset.id === "searchEdge")!,
    activeTabGlow: localGalaxyAssetList.find((asset) => asset.id === "activeTabGlow")!
  },
  icons: {
    logo: localGalaxyAssetList.find((asset) => asset.id === "logo")!,
    baseCyan: localGalaxyAssetList.find((asset) => asset.id === "baseCyan")!,
    basePurple: localGalaxyAssetList.find((asset) => asset.id === "basePurple")!,
    shellTeal128: localGalaxyAssetList.find((asset) => asset.id === "shellTeal128")!,
    shellTeal64: localGalaxyAssetList.find((asset) => asset.id === "shellTeal64")!,
    shellViolet128: localGalaxyAssetList.find((asset) => asset.id === "shellViolet128")!,
    shellViolet64: localGalaxyAssetList.find((asset) => asset.id === "shellViolet64")!,
    favoriteStar: localGalaxyAssetList.find((asset) => asset.id === "favoriteStar")!,
    favoriteStar16: localGalaxyAssetList.find((asset) => asset.id === "favoriteStar16")!,
    favoriteStar20: localGalaxyAssetList.find((asset) => asset.id === "favoriteStar20")!,
    favoriteStar24: localGalaxyAssetList.find((asset) => asset.id === "favoriteStar24")!,
    horizontalBadge: localGalaxyAssetList.find((asset) => asset.id === "horizontalBadge")!
  },
  textures: {
    stars: localGalaxyAssetList.find((asset) => asset.id === "starTexture")!,
    logs: localGalaxyAssetList.find((asset) => asset.id === "logTexture")!
  },
  ornaments: {
    radar: localGalaxyAssetList.find((asset) => asset.id === "radarStatus")!,
    compass: localGalaxyAssetList.find((asset) => asset.id === "compassStar")!,
    orbit: localGalaxyAssetList.find((asset) => asset.id === "largeOrbit")!,
    astrolabe: localGalaxyAssetList.find((asset) => asset.id === "vintageAstrolabe")!,
    settingsStarMap: localGalaxyAssetList.find((asset) => asset.id === "settingsStarMap")!,
    scanOrbit: localGalaxyAssetList.find((asset) => asset.id === "scanOrbit")!
  },
  frames: {
    corner: localGalaxyAssetList.find((asset) => asset.id === "panelCorner")!,
    thinPanel: localGalaxyAssetList.find((asset) => asset.id === "thinPanelFrame")!
  }
} as const;

export const localGalaxyAssetsById = Object.fromEntries(
  localGalaxyAssetList.map((asset) => [asset.id, asset])
) as Record<string, LocalGalaxyAsset>;
