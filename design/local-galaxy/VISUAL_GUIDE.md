# Local Galaxy 视觉规范指南

## 🎨 核心设计语言

### 关键词
```
深邃 · 复古 · 唯美 · 丝滑
```

### 设计隐喻
```
本地星系 → 你的个人资源宇宙
资源节点 → 应用、文件、网址
星际跳跃 → 快速启动
轨道控制 → 系统设置
引擎系统 → 插件架构
```

---

## 📐 排版系统

### 字体族
```css
--font-ui: "Segoe UI", "Microsoft YaHei UI", sans-serif
--font-title: "Noto Serif SC", "Source Han Serif SC", serif
--font-mono: "IBM Plex Mono", "Cascadia Mono", monospace
```

### 字号阶梯
| 用途 | 字号 | 字重 | 字间距 |
|------|------|------|--------|
| 主标题 | 34px | 700 | 0.02em |
| 副标题 | 13px | 400 | 0.03em |
| 章节标题 | 20px | 600 | 0.01em |
| EYEBROW | 11px | 800 | 0.08em |
| 品牌名 | 14px | 800 | 0.05em |
| 品牌副标 | 10px | 600 | 0.12em |
| 正文 | 14px | 400 | 0.015em |

### 字重使用规则
- **800**：品牌标识、EYEBROW 标签、主按钮
- **700**：主标题、资源名称
- **600**：章节标题、面板标题、品牌副标题
- **400**：正文、描述性文字

---

## 🌈 色彩系统

### 基础色
```css
--bg-deep: #050812      /* 深空背景 */
--bg-space: #080d1a     /* 太空层 */
--bg-panel: rgba(12, 18, 34, 0.88)  /* 面板背景 */
```

### 文字色
```css
--text-main: #f4ebd3    /* 主文字（温暖奶白） */
--text-soft: #c9bfa8    /* 柔和文字 */
--text-muted: #8f9aaf   /* 次要文字 */
```

### 强调色
```css
--gold: #d6a85c         /* 暗金（品牌主色） */
--teal: #27d7c6         /* 青绿（交互色） */
--violet: #7a6cff       /* 紫罗兰（脚本/动作链） */
--star: #fff2c6         /* 星光色（高亮） */
```

### 色彩使用场景
| 颜色 | 主要用途 |
|------|----------|
| 暗金 | 品牌元素、EYEBROW、边框、图标 |
| 青绿 | 主按钮、激活状态、focus、应用图标底座 |
| 紫罗兰 | 脚本、网址、动作链图标底座 |
| 星光 | hover 高亮、品牌区发光 |

---

## ✨ 视觉效果

### 发光系统
```css
/* 主标题柔和光晕 */
text-shadow: 0 2px 12px rgba(39, 215, 198, 0.12);

/* EYEBROW 发光 */
text-shadow: 0 0 8px rgba(214, 168, 92, 0.3);

/* 品牌名高光 */
text-shadow: 0 1px 8px rgba(255, 242, 198, 0.2);

/* 青绿发光 */
box-shadow: 0 0 24px rgba(39, 215, 198, 0.2);

/* 暗金发光 */
box-shadow: 0 0 24px rgba(214, 168, 92, 0.18);
```

### 过渡时间
```css
/* 标准过渡 */
transition: all 160ms ease-out;

/* 快速反馈 */
transition: all 150ms ease-out;
```

### 交互反馈
```css
/* 轻微上浮 */
transform: translateY(-1px);  /* 小按钮 */
transform: translateY(-2px);  /* 卡片 */

/* 不透明度变化 */
opacity: 0 → 0.48;  /* 素材淡入 */
```

---

## 🖼️ 素材使用指南

### 背景层（全页）
| 素材 | 不透明度 | 混合模式 | 用途 |
|------|----------|----------|------|
| 主背景图.png | 0.76-0.82 | normal | 主题背景 |
| 星云叠加层.png | 0.12-0.16 | screen | 柔和星云 |
| 细星点纹理.png | 0.12-0.18 | screen | 星点纹理 |

### 效果素材（局部）
| 素材 | 不透明度 | 混合模式 | 触发条件 |
|------|----------|----------|----------|
| 顶部流光.png | 0.12-0.16 | screen | 始终显示 |
| 分隔线高光.png | 0.28 | screen | 标题栏下方 |
| 搜索框高光边缘.png | 0 → 0.48 | screen | focus |
| 分类标签激活光.png | 0.38 | screen | 激活状态 |
| 青绿色柔光.png | 0 → 0.28 | screen | hover |
| 暗金柔光.png | 0.16 | screen | Logo 区 |

### 装饰素材
| 素材 | 不透明度 | 混合模式 | 位置 |
|------|----------|----------|------|
| 星形指南针装饰.png | 0.18 | screen | Logo 区右上 |
| 小型雷达状态图.png | 0.52 | screen | 状态卡右侧 |
| 大轨道线装饰.png | 0.08-0.1 | screen | 右上背景 |
| 设置页左侧星图装饰.png | 0.18 | screen | 设置菜单 |
| 加载扫描轨道图.png | 0.22 | screen | 空状态 |

### 图标系统
| 类型 | 青绿底座 | 紫蓝底座 |
|------|----------|----------|
| 应用 | ✓ | |
| 文件 | ✓ | |
| 文件夹 | ✓ | |
| 网址 | | ✓ |
| 脚本 | | ✓ |
| 动作链 | | ✓ |

---

## 📝 文案规范

### 术语系统
| 概念 | 标准用语 | ❌ 避免 |
|------|----------|---------|
| 插件 | 引擎 | 插件、Plugin |
| 收藏 | 星标 | 收藏、Favorite |
| 资源 | 资源节点 | 条目、项目 |
| 数量 | X 个 / X 颗（星标） | X 项 |
| 快速导航 | 快速跃迁 | 快捷方式 |
| 状态 | 轨道状态 | 运行状态 |

### 动词风格
| 操作 | 推荐表达 | ❌ 避免 |
|------|----------|---------|
| 导入 | 连接、导入 | 扫描、加载 |
| 启动 | 跳跃、启动 | 打开、运行 |
| 搜索 | 探索、搜索 | 查找 |
| 配置 | 轨道控制 | 设置 |

### 副标题模式
```
[主要功能] · [附加说明/诗意描述]

示例：
- 星际资源导航站 · 探索你的个人宇宙
- 插件引擎 · 主题工作室 · 数据星图
- 追踪每一次资源跳跃与插件脉冲
```

---

## 🎯 设计检查清单

### 新增组件必检项
- [ ] 使用 `--font-title` 字体的标题有 `letter-spacing: 0.01-0.02em`
- [ ] EYEBROW 标签使用 `letter-spacing: 0.08em` + `text-transform: uppercase`
- [ ] 重要标题有柔和的 `text-shadow`
- [ ] 交互元素有 160ms 过渡
- [ ] hover 状态包含 `translateY(-1px)` 和发光效果
- [ ] 使用暗金/青绿色作为强调色
- [ ] 面板背景使用半透明 + 径向渐变
- [ ] 按钮/卡片有 `border-radius: var(--radius)`

### 文案必检项
- [ ] 避免使用"插件"，统一为"引擎"
- [ ] 数字 + 量词组合（X 个节点，X 颗星标）
- [ ] 副标题包含诗意或功能性描述
- [ ] 英文标签已本地化
- [ ] 符合 Local Galaxy 主题隐喻

---

## 🌟 设计原则

### 1. 深邃感
- 深色背景为主（#050812）
- 柔和星云叠加层
- 细微的星点纹理
- 渐变从深到浅

### 2. 复古感
- 衬线字体用于标题
- 暗金色系（#d6a85c）
- 雷达、星盘装饰元素
- 复古未来主义气质

### 3. 唯美感
- 诗意化文案（星标、节点、跃迁）
- 柔和的文字发光
- 飘逸的字间距
- 温暖的色温（奶白文字）

### 4. 丝滑感
- 160ms 标准过渡
- 轻微的上浮动画
- 柔和的背景模糊
- 渐进式视觉反馈

---

## 🚀 快速参考

### 新增按钮样式
```css
.my-button {
  min-height: 42px;
  padding: 0 15px;
  border: 1px solid var(--border-gold);
  border-radius: var(--radius);
  background: rgba(255, 242, 198, 0.055);
  color: var(--text-soft);
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: all 160ms ease-out;
}

.my-button:hover {
  border-color: var(--border-teal);
  background: rgba(39, 215, 198, 0.1);
  color: var(--text);
  transform: translateY(-1px);
  box-shadow: var(--shadow-glow-teal);
}
```

### 新增标题样式
```css
.my-title {
  color: var(--text);
  font-family: var(--font-title);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.2;
}
```

### 新增面板样式
```css
.my-panel {
  border: 1px solid var(--border-gold);
  border-radius: var(--radius);
  background: 
    radial-gradient(circle at 86% 8%, rgba(214, 168, 92, 0.14), transparent 22%),
    linear-gradient(180deg, rgba(12, 18, 34, 0.88), rgba(5, 8, 18, 0.82));
  box-shadow: var(--shadow-panel), inset 0 1px 0 rgba(255, 242, 198, 0.08);
}
```

---

**设计系统版本**：Local Galaxy v1.0  
**最后更新**：2026-06-14  
**维护者**：OrbitStart Design Team

🌌 探索无限，始于本地
