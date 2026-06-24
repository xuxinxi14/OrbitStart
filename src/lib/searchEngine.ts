/**
 * OrbitStart Enhanced Search Engine v2
 *
 * Scoring-based ranking with multi-factor weighted search.
 * Supports: exact/prefix/fuzzy matching, pinyin initial letters,
 * favorite/recent/launch-count boosting, tag/group/type weighting,
 * and keyboard-navigable result selection.
 */

import type { OrbitItem, OrbitCommand, ItemKind } from "../types";
import type { SearchResult } from "../types";

// ---------------------------------------------------------------------------
// 1. Pinyin Initial Letter Map (compact, high-frequency coverage)
// ---------------------------------------------------------------------------

/** Maps common Chinese characters to their pinyin initial letter(s). */
const PY_INITIALS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    // A
    安: "a", 按: "a", 爱: "ai",
    // B
    不: "b", 本: "b", 编: "b", 播: "b", 帮: "b", 备: "b", 笔: "b", 表: "b", 背: "b", 版: "b", 包: "b", 边: "b", 变: "b", 别: "b",
    // C
    常: "c", 查: "c", 创: "c", 程: "c", 存: "c", 菜: "c", 测: "c", 窗: "c", 从: "c", 操: "c", 此: "c", 次: "c", 出: "ch",
    // D
    的: "d", 大: "d", 打: "d", 导: "d", 读: "d", 地: "d", 代: "d", 第: "d", 对: "dui", 多: "duo", 当: "dang", 定: "ding",
    // E
    二: "e",
    // F
    分: "f", 复: "f", 方: "f", 发: "fa", 放: "fang", 非: "fei", 反: "fan", 风: "feng", 服: "fu", 法: "fa", 附: "fu",
    // G
    工: "g", 关: "g", 管: "g", 更: "g", 高: "g", 公: "g", 过: "guo", 格: "ge", 规: "gui", 各: "ge", 构: "gou", 改: "gai", 功: "gong",
    // H
    后: "h", 好: "h", 会: "hui", 和: "he", 换: "huan", 回: "hui", 活: "huo", 画: "hua", 还: "huan", 合: "he", 环: "huan", 红: "hong",
    // I (none in common Chinese)
    // J
    建: "j", 进: "j", 就: "jiu", 加: "jia", 记: "ji", 截: "jie", 检: "jian", 解: "jie", 集: "ji", 局: "ju", 交: "jiao", 具: "ju", 绝: "jue", 简: "jian", 几: "ji", 今: "jin", 即: "ji",
    // K
    看: "k", 可: "k", 快: "kuai", 控: "kong", 开: "kai", 卡: "ka", 扩: "kuo", 克: "ke",
    // L
    了: "l", 来: "lai", 拉: "la", 连: "lian", 录: "lu", 流: "liu", 离: "li", 立: "li", 另: "ling", 类: "lei", 理: "li", 两: "liang", 量: "liang", 路: "lu", 论: "lun", 列: "lie", 临: "lin",
    // M
    名: "m", 面: "mian", 每: "mei", 模: "mo", 目: "mu", 没: "mei", 满: "man", 密: "mi", 默: "mo", 慢: "man",
    // N
    你: "n", 那: "na", 内: "nei", 能: "neng", 拿: "na", 年: "nian", 农: "nong",
    // O (none)
    // P
    拼: "pin", 平: "ping", 盘: "pan", 配: "pei", 频: "pin", 批: "pi", 普: "pu", 屏: "ping", 片: "pian", 怕: "pa", 拍: "pai",
    // Q
    前: "q", 去: "qu", 启: "qi", 取: "qu", 全: "quan", 请: "qing", 切: "qie", 清: "qing", 群: "qun", 其: "qi", 起: "qi", 确: "que", 强: "qiang", 区: "qu", 权: "quan",
    // R
    入: "ru", 任: "ren", 日: "ri", 认: "ren", 容: "rong", 热: "re", 如: "ru", 让: "rang",
    // S
    是: "s", 上: "sh", 设: "she", 所: "suo", 扫: "sao", 刷: "shua", 手: "shou", 数: "shu", 生: "sheng", 时: "shi", 使: "shi", 实: "shi", 收: "shou", 说: "shuo", 算: "suan", 删: "shan", 识: "shi", 适: "shi", 素: "su", 速: "su", 属: "shu",
    // T
    同: "t", 通: "tong", 图: "tu", 台: "tai", 特: "te", 提: "ti", 调: "tiao", 天: "tian", 体: "ti", 条: "tiao", 弹: "tan", 停: "ting", 替: "ti",
    // U / V (none)
    // W
    我: "w", 文: "wen", 网: "wang", 位: "wei", 为: "wei", 外: "wai", 无: "wu", 微: "wei", 完: "wan", 问: "wen", 卫: "wei", 往: "wang", 物: "wu", 未: "wei", 维: "wei",
    // X
    下: "x", 选: "xuan", 新: "xin", 小: "xiao", 显: "xian", 信: "xin", 修: "xiu", 行: "xing", 现: "xian", 向: "xiang", 详: "xiang", 序: "xu", 卸: "xie", 写: "xie", 限: "xian", 些: "xie", 需: "xu", 像: "xiang", 系: "xi",
    // Y
    一: "y", 用: "yong", 有: "you", 以: "yi", 也: "ye", 已: "yi", 远: "yuan", 原: "yuan", 运: "yun", 页: "ye", 预: "yu", 义: "yi", 移: "yi", 验: "yan", 样: "yang", 映: "ying", 源: "yuan", 语: "yu", 引: "yin", 隐: "yin", 元: "yuan",
    // Z
    中: "z", 在: "zai", 这: "zhe", 做: "zuo", 自: "zi", 最: "zui", 只: "zhi", 组: "zu", 转: "zhuan", 制: "zhi", 注: "zhu", 主: "zhu", 找: "zhao", 增: "zeng", 重: "zhong", 站: "zhan", 正: "zheng", 指: "zhi", 置: "zhi", 总: "zong", 字: "zi", 资: "zi", 暂: "zan", 状: "zhuang", 抓: "zhua", 装: "zhuang", 整: "zheng", 准: "zhun"
  })
);

/** Extract pinyin initial letters from a Chinese string (e.g., "记事本" -> "jsb"). */
export function getPinyinInitials(text: string): string {
  return [...text]
    .map((ch) => PY_INITIALS.get(ch) ?? "")
    .join("");
}

// ---------------------------------------------------------------------------
// 2. Fuzzy Matching (Levenshtein distance with early exit)
// ---------------------------------------------------------------------------

/** Compute Levenshtein edit distance between two strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Early exit for large differences
  if (Math.abs(m - n) > Math.max(m, n) * 0.6) return Math.max(m, n);

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ai = a[i - 1];
    for (let j = 1; j <= n; j++) {
      const cost = ai === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,     // insert
        prev[j] + 1,         // delete
        prev[j - 1] + cost   // replace
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Check if query fuzzy-matches target.
 * Returns similarity ratio [0..1] where 1 = perfect match.
 */
export function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q || !t) return 0;

  // Exact match
  if (t.includes(q)) return 1;
  if (q.includes(t) && q.length <= t.length * 2) return 0.85;

  // Prefix match
  if (t.startsWith(q)) return 0.95;
  if (q.startsWith(t)) return 0.8;

  // Subsequence match (query chars appear in order within target)
  let ti = 0;
  let matched = 0;
  for (let qi = 0; qi < q.length && ti < t.length; qi++) {
    while (ti < t.length && t[ti] !== q[qi]) ti++;
    if (ti < t.length) { matched++; ti++; }
  }
  if (matched === q.length) {
    // All query chars found in order — score based on compactness
    return 0.6 + (matched / t.length) * 0.25;
  }

  // Levenshtein fallback — only for short queries
  if (q.length <= 8) {
    const dist = levenshtein(q, t);
    const maxLen = Math.max(q.length, t.length);
    const ratio = 1 - dist / maxLen;
    return ratio > 0.45 ? ratio : 0;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// 3. Scoring Constants (weights tuned for launcher UX)
// ---------------------------------------------------------------------------

const W = {
  /** Base score for any match */
  MATCH_BASE: 10,

  // Match quality bonuses
  EXACT_TITLE: 100,          // query == title (case-insensitive)
  PREFIX_TITLE: 70,          // title starts with query
  ALIAS_EXACT: 65,           // query matches an alias exactly
  ALIAS_PREFIX: 50,          // alias starts with query
  FUZZY_TITLE: 30,           // fuzzy match on title
  TAG_MATCH: 20,             // query found in tags
  GROUP_MATCH: 15,           // query found in group name
  SUBTITLE_MATCH: 12,        // query found in subtitle
  TARGET_MATCH: 8,           // query found in target path/url
  PY_INITIAL_MATCH: 35,      // pinyin initials of title match query
  PY_INITIAL_PARTIAL: 18,    // partial pinyin initial match

  // Popularity / usage boosts
  // FAVORITE_BOOST is intentionally small — it acts as a tiebreaker so that
  // when two items have similar relevance, the favorited one floats up.
  // It must NOT be large enough to override a relevance-tier difference
  // (e.g. prefix match favorited should NOT beat exact match non-favorited).
  // Range: kept below TAG_MATCH so a fuzzy+favorite can't beat a prefix match.
  FAVORITE_BOOST: 15,        // favorited items nudge up only on near-equal relevance
  LAUNCH_COUNT_BOOST: 2,     // per launch count (capped at 40)
  RECENT_USE_DECAY: 200,     // bonus that decays over time (seconds)

  // Type preference (slight bias toward apps/websites)
  TYPE_WEIGHT: { app: 5, website: 5, folder: 3, file: 2, script: 2, action_chain: 4 } as Record<string, number>
} as const;

const MAX_LAUNCH_BONUS = 40;
const RECENT_HALF_LIFE_HOURS = 168; // 7 days half-life

/** Compute recency bonus from lastLaunchedAt timestamp. */
export function recencyBonus(lastLaunchedAt?: string): number {
  if (!lastLaunchedAt) return 0;
  const seconds = Number(lastLaunchedAt);
  if (!Number.isFinite(seconds)) return 0; // non-numeric = relative text like "刚刚"
  const deltaHours = Math.max(0, Date.now() / 1000 - seconds) / 3600;
  const decay = Math.pow(0.5, deltaHours / RECENT_HALF_LIFE_HOURS);
  return W.RECENT_USE_DECAY * decay;
}

// ---------------------------------------------------------------------------
// 4. Core Search Functions
// ---------------------------------------------------------------------------

/** A search result with an internal score for sorting. */
export interface ScoredSearchResult extends SearchResult {
  _score: number;
}

/**
 * Score an OrbitItem against a search query.
 * Returns a numeric score (higher = better match).
 *
 * Empty-query scoring intentionally returns a uniform base — actual ordering
 * on empty query is handled by buildSortedResults using a richer comparator
 * (recency → launch count → favorite → title), so the favorite flag does
 * NOT dominate the empty-query list here.
 */
export function scoreItem(item: OrbitItem, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return W.MATCH_BASE;

  let score = 0;
  let hasTextMatch = false;
  const titleLower = item.title.toLowerCase();
  const subtitleLower = (item.subtitle ?? "").toLowerCase();
  const targetLower = (item.target ?? "").toLowerCase();
  const aliasesLower = (item.aliases ?? []).map((a) => a.toLowerCase());
  const tagsLower = (item.tags ?? []).map((t) => t.toLowerCase());
  const groupsLower = (item.group ?? "").toLowerCase().split(",").map((g) => g.trim());

  // --- Title matching ---
  if (titleLower === q) {
    score += W.EXACT_TITLE;
    hasTextMatch = true;
  } else if (titleLower.startsWith(q)) {
    score += W.PREFIX_TITLE;
    hasTextMatch = true;
  } else {
    const fuzzy = fuzzyMatch(q, item.title);
    if (fuzzy > 0) {
      score += fuzzy * W.FUZZY_TITLE;
      hasTextMatch = true;
    }
  }

  // --- Alias matching ---
  for (const alias of aliasesLower) {
    if (alias === q) {
      score += W.ALIAS_EXACT;
      hasTextMatch = true;
      break;
    } else if (alias.startsWith(q)) {
      score = Math.max(score, W.ALIAS_PREFIX);
      hasTextMatch = true;
      break;
    } else if (alias.includes(q)) {
      score = Math.max(score, W.ALIAS_PREFIX * 0.7);
      hasTextMatch = true;
    }
  }

  // --- Pinyin initial matching on title ---
  const pyInitials = getPinyinInitials(item.title);
  if (pyInitials && pyInitials.length >= q.length) {
    if (pyInitials === q || pyInitials.startsWith(q)) {
      score += W.PY_INITIAL_MATCH;
      hasTextMatch = true;
    } else if (pyInitials.includes(q)) {
      score += W.PY_INITIAL_PARTIAL;
      hasTextMatch = true;
    }
  }
  // Also check pinyin on aliases
  for (const alias of item.aliases ?? []) {
    const aliasPy = getPinyinInitials(alias);
    if (aliasPy && (aliasPy.startsWith(q) || aliasPy.includes(q))) {
      score += W.PY_INITIAL_PARTIAL;
      hasTextMatch = true;
      break;
    }
  }

  // --- Tag / Group / Subtitle / Target (lower tier) ---
  for (const tag of tagsLower) {
    if (tag.includes(q) || q.includes(tag)) {
      score += W.TAG_MATCH;
      hasTextMatch = true;
      break;
    }
  }
  for (const grp of groupsLower) {
    if (grp.includes(q) || q.includes(grp)) {
      score += W.GROUP_MATCH;
      hasTextMatch = true;
      break;
    }
  }
  if (subtitleLower.includes(q)) {
    score += W.SUBTITLE_MATCH;
    hasTextMatch = true;
  }
  if (targetLower.includes(q) && !titleLower.includes(q)) {
    score += W.TARGET_MATCH;
    hasTextMatch = true;
  }

  if (!hasTextMatch) {
    return 0; // No text match -> fails search threshold
  }

  // --- Usage boosts ---
  if (item.favorite) score += W.FAVORITE_BOOST;
  score += Math.min(item.launchCount ?? 0, MAX_LAUNCH_BONUS / W.LAUNCH_COUNT_BOOST) * W.LAUNCH_COUNT_BOOST;
  score += recencyBonus(item.lastLaunchedAt);

  // --- Type weight ---
  score += W.TYPE_WEIGHT[item.kind] ?? 0;

  return Math.max(score, W.MATCH_BASE);
}

/**
 * Score an OrbitCommand against a search query.
 */
export function scoreCommand(command: OrbitCommand, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return W.MATCH_BASE;

  let score = W.MATCH_BASE;
  const titleLower = command.title.toLowerCase();
  const kwLower = (command.keywords ?? []).map((k) => k.toLowerCase());
  const subLower = (command.subtitle ?? "").toLowerCase();

  if (titleLower === q) score += W.EXACT_TITLE;
  else if (titleLower.startsWith(q)) score += W.PREFIX_TITLE;
  else score += fuzzyMatch(q, command.title) * W.FUZZY_TITLE;

  for (const kw of kwLower) {
    if (kw === q) { score += W.ALIAS_EXACT; break; }
    else if (kw.startsWith(q)) { score += W.ALIAS_PREFIX; break; }
  }

  // Pinyin on command titles
  const pyInitials = getPinyinInitials(command.title);
  if (pyInitials && (pyInitials.startsWith(q) || pyInitials.includes(q))) score += W.PY_INITIAL_PARTIAL;

  if (subLower.includes(q)) score += W.SUBTITLE_MATCH;

  return score;
}

/**
 * Minimum score threshold to be included in results.
 * Items below this are considered non-matches.
 */
export const SCORE_THRESHOLD = W.MATCH_BASE + 1;

// ---------------------------------------------------------------------------
// 5. Unified Search API (drop-in replacement for matchesItem/matchesCommand)
// ---------------------------------------------------------------------------

/**
 * Check if an item matches the query (for filtering purposes).
 * Uses fuzzy + pinyin matching — much more permissive than simple includes().
 *
 * Empty query matches ALL items — the threshold is only applied when there
 * is an actual query to filter against. On empty query, scoreItem returns
 * MATCH_BASE (10) which is below SCORE_THRESHOLD (11); without this guard,
 * all items would be filtered out.
 */
export function matchesItemEnhanced(item: OrbitItem, query: string): boolean {
  if (!query.trim()) return true;
  return scoreItem(item, query) >= SCORE_THRESHOLD;
}

/**
 * Check if a command matches the query.
 * Same empty-query rule as matchesItemEnhanced.
 */
export function matchesCommandEnhanced(command: OrbitCommand, query: string): boolean {
  if (!query.trim()) return true;
  return scoreCommand(command, query) >= SCORE_THRESHOLD;
}

// ---------------------------------------------------------------------------
// 6. Sorted Result Builders (with scoring)
// ---------------------------------------------------------------------------

/**
 * Build scored & sorted search results from items + commands + plugin results.
 * Results are sorted by score descending (best match first).
 */
export function buildSortedResults(params: {
  items: OrbitItem[];
  commands: OrbitCommand[];
  paletteQuery: string;
  itemFilter?: (item: OrbitItem) => boolean;
  toItemResult: (item: OrbitItem) => SearchResult;
  toCommandResult: (command: OrbitCommand) => SearchResult;
  extraPluginResults?: SearchResult[];
}): ScoredSearchResult[] {
  const { items, commands, paletteQuery, itemFilter, toItemResult, toCommandResult, extraPluginResults } = params;
  const q = paletteQuery.trim().toLowerCase();

  if (!q) {
    // Empty query: surface what the user actually uses, not just favorites.
    // Priority order (each tier only breaks ties within the previous tier):
    //   1. recency bonus  — most recently launched first
    //   2. launch count   — frequently used next
    //   3. favorite flag  — tiebreaker only (NOT primary sort)
    //   4. title          — stable alphabetical fallback
    // This avoids the old behavior where every favorited item was force-sorted
    // to the top regardless of whether the user ever launches it.
    const itemResults = (itemFilter ? items.filter(itemFilter) : items)
      .slice()
      .sort((a, b) => {
        const aRecent = recencyBonus(a.lastLaunchedAt);
        const bRecent = recencyBonus(b.lastLaunchedAt);
        if (Math.abs(aRecent - bRecent) > 0.5) return bRecent - aRecent;
        const aLaunch = a.launchCount ?? 0;
        const bLaunch = b.launchCount ?? 0;
        if (aLaunch !== bLaunch) return bLaunch - aLaunch;
        const aFav = a.favorite ? 1 : 0;
        const bFav = b.favorite ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav;
        return a.title.localeCompare(b.title, "zh-Hans-CN");
      })
      .map((item) => ({ ...toItemResult(item), _score: scoreItem(item, "") }));

    const cmdResults = commands.map((cmd) => ({
      ...toCommandResult(cmd),
      _score: scoreCommand(cmd, "")
    }));

    return [...itemResults.slice(0, 10), ...cmdResults].slice(0, 16);
  }

  // Scored search
  const itemResults: ScoredSearchResult[] = []
  const candidateItems = itemFilter ? items.filter(itemFilter) : items;

  for (const item of candidateItems) {
    const s = scoreItem(item, paletteQuery);
    if (s >= SCORE_THRESHOLD) {
      itemResults.push({ ...toItemResult(item), _score: s });
    }
  }

  const cmdResults: ScoredSearchResult[] = [];
  for (const cmd of commands) {
    const s = scoreCommand(cmd, paletteQuery);
    if (s >= SCORE_THRESHOLD) {
      cmdResults.push({ ...toCommandResult(cmd), _score: s });
    }
  }

  // Merge and sort by score descending
  const merged = [
    ...itemResults,
    ...cmdResults,
    ...(extraPluginResults ?? []).map((r) => ({ ...r, _score: W.MATCH_BASE }))
  ];

  merged.sort((a, b) => b._score - a._score);
  return merged.slice(0, 16); // Cap at 16 results for performance
}
