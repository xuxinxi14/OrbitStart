#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{hash_map::DefaultHasher, HashMap};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command as ProcessCommand;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

#[cfg(desktop)]
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OrbitGroup {
    id: String,
    title: String,
    icon: String,
    description: String,
    custom: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrbitItem {
    id: String,
    title: String,
    subtitle: String,
    kind: String,
    group: String,
    target: String,
    aliases: Vec<String>,
    tags: Vec<String>,
    icon: String,
    accent: String,
    favorite: bool,
    launch_count: u32,
    last_launched_at: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrbitItemInput {
    title: String,
    subtitle: String,
    kind: String,
    group: String,
    target: String,
    aliases: Vec<String>,
    tags: Vec<String>,
    icon: String,
    accent: String,
    favorite: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OrbitCommand {
    id: String,
    title: String,
    subtitle: String,
    plugin_id: String,
    icon: String,
    keywords: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginPermission {
    id: String,
    label: String,
    risk: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginContributes {
    commands: u32,
    search_providers: u32,
    themes: u32,
    views: u32,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginManifest {
    id: String,
    name: String,
    version: String,
    description: String,
    enabled: bool,
    #[serde(default)]
    builtin: bool,
    #[serde(default)]
    permissions: Vec<PluginPermission>,
    contributes: PluginContributes,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThemeManifest {
    id: String,
    name: String,
    author: String,
    description: String,
    #[serde(default)]
    builtin: bool,
    tokens: HashMap<String, String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginLog {
    id: String,
    plugin_id: String,
    level: String,
    message: String,
    created_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    active_theme_id: String,
    safe_mode: bool,
    density: String,
    global_hotkey: String,
    close_behavior: String,
    data_dir: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CatalogSnapshot {
    items: Vec<OrbitItem>,
    groups: Vec<OrbitGroup>,
    commands: Vec<OrbitCommand>,
    plugins: Vec<PluginManifest>,
    themes: Vec<ThemeManifest>,
    settings: AppSettings,
    logs: Vec<PluginLog>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogExport {
    version: u32,
    exported_at: String,
    items: Vec<OrbitItem>,
    #[serde(default)]
    plugins: Vec<PluginManifest>,
    #[serde(default)]
    active_theme_id: Option<String>,
}

#[derive(Clone, Serialize)]
struct ExportResult {
    path: String,
    json: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct ShortcutInfo {
    title: String,
    shortcut: String,
    target_path: String,
    arguments: String,
    working_directory: String,
    icon_location: String,
    icon_base64: String,
}

fn now_string() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    seconds.to_string()
}

fn app_data_dir() -> Result<PathBuf, String> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let path = base.join("OrbitStart");
    fs::create_dir_all(&path).map_err(|error| format!("Failed to create data directory: {error}"))?;
    Ok(path)
}

fn plugins_dir() -> Result<PathBuf, String> {
    let path = app_data_dir()?.join("plugins");
    fs::create_dir_all(&path).map_err(|error| format!("Failed to create plugin directory: {error}"))?;
    Ok(path)
}

fn themes_dir() -> Result<PathBuf, String> {
    let path = app_data_dir()?.join("themes");
    fs::create_dir_all(&path).map_err(|error| format!("Failed to create theme directory: {error}"))?;
    Ok(path)
}

fn db_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("orbit.db"))
}

fn open_db() -> Result<Connection, String> {
    let conn = Connection::open(db_path()?).map_err(|error| format!("Failed to open database: {error}"))?;
    init_db(&conn)?;
    Ok(conn)
}

fn init_db(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            subtitle TEXT NOT NULL,
            kind TEXT NOT NULL,
            group_id TEXT NOT NULL,
            target TEXT NOT NULL UNIQUE,
            aliases_json TEXT NOT NULL,
            tags_json TEXT NOT NULL,
            icon TEXT NOT NULL,
            accent TEXT NOT NULL,
            favorite INTEGER NOT NULL DEFAULT 0,
            launch_count INTEGER NOT NULL DEFAULT 0,
            last_launched_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS groups (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            icon TEXT NOT NULL,
            description TEXT NOT NULL,
            custom INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS plugin_states (
            id TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL,
            manifest_json TEXT NOT NULL,
            builtin INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS plugin_logs (
            id TEXT PRIMARY KEY,
            plugin_id TEXT NOT NULL,
            level TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )
    .map_err(|error| format!("Failed to initialize database: {error}"))?;

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM items", [], |row| row.get(0))
        .map_err(|error| format!("Failed to count items: {error}"))?;

    if count == 0 {
        for item in seed_items() {
            insert_item(conn, &item)?;
        }
    }

    seed_groups(conn)?;
    seed_plugin_states(conn)?;
    ensure_default_settings(conn)?;
    ensure_local_templates()?;
    Ok(())
}

fn ensure_default_settings(conn: &Connection) -> Result<(), String> {
    for (key, value) in [
        ("active_theme_id", "local-galaxy"),
        ("safe_mode", "false"),
        ("density", "comfortable"),
        ("global_hotkey", "Ctrl+Alt+Space"),
        ("close_behavior", "tray"),
    ] {
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|error| format!("Failed to initialize setting {key}: {error}"))?;
    }
    Ok(())
}

fn setting(conn: &Connection, key: &str, fallback: &str) -> Result<String, String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| row.get(0))
        .optional()
        .map_err(|error| format!("Failed to read setting {key}: {error}"))
        .map(|value| value.unwrap_or_else(|| fallback.to_string()))
}

fn set_setting_value(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|error| format!("Failed to update setting {key}: {error}"))?;
    Ok(())
}

fn app_settings(conn: &Connection) -> Result<AppSettings, String> {
    Ok(AppSettings {
        active_theme_id: setting(conn, "active_theme_id", "local-galaxy")?,
        safe_mode: setting(conn, "safe_mode", "false")? == "true",
        density: setting(conn, "density", "comfortable")?,
        global_hotkey: setting(conn, "global_hotkey", "Ctrl+Alt+Space")?,
        close_behavior: setting(conn, "close_behavior", "tray")?,
        data_dir: app_data_dir()?.to_string_lossy().to_string(),
    })
}

fn seed_items() -> Vec<OrbitItemInput> {
    vec![
        OrbitItemInput {
            title: "Notepad".to_string(),
            subtitle: "Windows text editor".to_string(),
            kind: "app".to_string(),
            group: "apps".to_string(),
            target: "C:\\Windows\\System32\\notepad.exe".to_string(),
            aliases: vec!["text".to_string(), "txt".to_string(), "notepad".to_string()],
            tags: vec!["system".to_string(), "editor".to_string()],
            icon: "NotebookText".to_string(),
            accent: "#5cc8ff".to_string(),
            favorite: true,
        },
        OrbitItemInput {
            title: "OrbitStart workspace".to_string(),
            subtitle: "E:\\OrbitStart".to_string(),
            kind: "folder".to_string(),
            group: "work".to_string(),
            target: "E:\\OrbitStart".to_string(),
            aliases: vec!["orbit".to_string(), "project".to_string()],
            tags: vec!["project".to_string()],
            icon: "FolderKanban".to_string(),
            accent: "#8bd450".to_string(),
            favorite: true,
        },
        OrbitItemInput {
            title: "GitHub".to_string(),
            subtitle: "https://github.com".to_string(),
            kind: "website".to_string(),
            group: "web".to_string(),
            target: "https://github.com".to_string(),
            aliases: vec!["git".to_string(), "repo".to_string()],
            tags: vec!["web".to_string(), "dev".to_string()],
            icon: "Github".to_string(),
            accent: "#ffffff".to_string(),
            favorite: false,
        },
        OrbitItemInput {
            title: "Morning workspace".to_string(),
            subtitle: "Launches a small starter chain".to_string(),
            kind: "action_chain".to_string(),
            group: "work".to_string(),
            target: "C:\\Windows\\System32\\notepad.exe\nhttps://github.com\nE:\\OrbitStart".to_string(),
            aliases: vec!["chain".to_string(), "workspace".to_string()],
            tags: vec!["automation".to_string(), "template".to_string()],
            icon: "Workflow".to_string(),
            accent: "#ff7a90".to_string(),
            favorite: false,
        },
    ]
}

fn default_groups() -> Vec<OrbitGroup> {
    vec![
        OrbitGroup { id: "all".to_string(), title: "全部".to_string(), icon: "Orbit".to_string(), description: "所有资源".to_string(), custom: false },
        OrbitGroup { id: "apps".to_string(), title: "应用".to_string(), icon: "AppWindow".to_string(), description: "程序和快捷方式".to_string(), custom: false },
        OrbitGroup { id: "work".to_string(), title: "工作区".to_string(), icon: "PanelsTopLeft".to_string(), description: "项目和动作链".to_string(), custom: false },
        OrbitGroup { id: "web".to_string(), title: "网址".to_string(), icon: "Globe".to_string(), description: "网站、书签和在线控制台".to_string(), custom: false },
        OrbitGroup { id: "scripts".to_string(), title: "脚本".to_string(), icon: "TerminalSquare".to_string(), description: "脚本和自动化入口".to_string(), custom: false },
        OrbitGroup { id: "plugins".to_string(), title: "插件".to_string(), icon: "Blocks".to_string(), description: "插件提供的资源".to_string(), custom: false },
    ]
}

fn seed_groups(conn: &Connection) -> Result<(), String> {
    let now = now_string();
    for group in default_groups() {
        conn.execute(
            "INSERT OR IGNORE INTO groups (id, title, icon, description, custom, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![group.id, group.title, group.icon, group.description, if group.custom { 1 } else { 0 }, now],
        )
        .map_err(|error| format!("Failed to seed group: {error}"))?;
    }
    Ok(())
}

fn all_groups(conn: &Connection) -> Result<Vec<OrbitGroup>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, title, icon, description, custom
            FROM groups
            ORDER BY
              CASE id
                WHEN 'all' THEN 0
                WHEN 'apps' THEN 1
                WHEN 'work' THEN 2
                WHEN 'web' THEN 3
                WHEN 'scripts' THEN 4
                WHEN 'plugins' THEN 5
                ELSE 20
              END,
              title COLLATE NOCASE ASC
            "#,
        )
        .map_err(|error| format!("Failed to prepare groups query: {error}"))?;
    let rows = stmt
        .query_map([], |row| {
            let custom: i64 = row.get(4)?;
            Ok(OrbitGroup {
                id: row.get(0)?,
                title: row.get(1)?,
                icon: row.get(2)?,
                description: row.get(3)?,
                custom: custom != 0,
            })
        })
        .map_err(|error| format!("Failed to query groups: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to map groups: {error}"))
}

fn permission(id: &str, label: &str, risk: &str) -> PluginPermission {
    PluginPermission { id: id.to_string(), label: label.to_string(), risk: risk.to_string() }
}

fn contributes(commands: u32, search_providers: u32, themes: u32, views: u32) -> PluginContributes {
    PluginContributes { commands, search_providers, themes, views }
}

fn plugin(
    id: &str,
    name: &str,
    description: &str,
    permissions: Vec<PluginPermission>,
    contributes: PluginContributes,
) -> PluginManifest {
    PluginManifest {
        id: id.to_string(),
        name: name.to_string(),
        version: "0.4.0".to_string(),
        description: description.to_string(),
        enabled: true,
        builtin: true,
        permissions,
        contributes,
    }
}

fn default_plugins() -> Vec<PluginManifest> {
    vec![
        plugin(
            "core-command-palette",
            "Command Palette",
            "统一命令入口、资源搜索和插件结果聚合。",
            vec![permission("ui:overlay", "显示命令面板", "low")],
            contributes(1, 1, 0, 1),
        ),
        plugin(
            "core-items",
            "Items",
            "管理应用、文件、文件夹、脚本和动作链。",
            vec![permission("db:items", "读写本地资源目录", "medium")],
            contributes(2, 1, 0, 1),
        ),
        plugin(
            "core-websites",
            "Websites",
            "网址、浏览器书签和在线控制台入口。",
            vec![permission("shell:open-url", "打开网址", "medium")],
            contributes(2, 1, 0, 1),
        ),
        plugin(
            "core-shortcuts",
            "Windows Shortcuts",
            "扫描桌面和开始菜单快捷方式，并保留原始 .lnk 启动能力。",
            vec![
                permission("fs:read", "读取快捷方式路径", "medium"),
                permission("shell:open", "启动文件和程序", "medium"),
            ],
            contributes(1, 1, 0, 0),
        ),
        plugin(
            "core-bookmarks",
            "Browser Bookmarks",
            "从 Edge/Chrome 书签文件导入网站入口。",
            vec![permission("fs:read-browser", "读取本机浏览器书签文件", "medium")],
            contributes(1, 1, 0, 0),
        ),
        plugin(
            "core-actions",
            "Action Chains",
            "用一个入口顺序启动多个程序、文件夹和网址。",
            vec![permission("shell:chain", "批量启动多个目标", "high")],
            contributes(2, 1, 0, 1),
        ),
        plugin(
            "core-themes",
            "Themes",
            "主题变量、实时预览和本地主题包。",
            vec![permission("theme:write", "应用主题变量", "low")],
            contributes(1, 0, 6, 1),
        ),
        plugin(
            "core-backup",
            "Backup",
            "JSON 导入导出和本地备份。",
            vec![permission("fs:write", "写入备份文件", "medium")],
            contributes(2, 0, 0, 0),
        ),
        plugin(
            "core-plugin-dev",
            "Plugin Dev Kit",
            "本地插件模板、manifest 校验和开发文档入口。",
            vec![permission("fs:write-plugins", "写入本地插件模板", "medium")],
            contributes(2, 0, 0, 1),
        ),
        plugin(
            "core-clipboard",
            "Clipboard Quick Note",
            "前端读取剪贴板文本并可作为资源备注使用。",
            vec![permission("clipboard:read", "读取剪贴板文本", "medium")],
            contributes(1, 1, 0, 0),
        ),
        plugin(
            "core-window-switcher",
            "Window Switcher",
            "集中管理桌面窗口导航入口。",
            vec![permission("windows:enumerate", "枚举窗口标题", "high")],
            contributes(1, 1, 0, 0),
        ),
        plugin(
            "core-everything",
            "Everything Search",
            "提供统一的本地文件搜索入口，可连接 Everything 服务扩展索引范围。",
            vec![permission("fs:search", "搜索本地文件", "medium")],
            contributes(1, 1, 0, 0),
        ),
    ]
}

fn seed_plugin_states(conn: &Connection) -> Result<(), String> {
    let now = now_string();
    for plugin in default_plugins() {
        let manifest_json = serde_json::to_string(&plugin)
            .map_err(|error| format!("Failed to serialize plugin manifest: {error}"))?;
        conn.execute(
            r#"
            INSERT INTO plugin_states (id, enabled, manifest_json, builtin, updated_at)
            VALUES (?1, ?2, ?3, 1, ?4)
            ON CONFLICT(id) DO UPDATE SET
                manifest_json = excluded.manifest_json,
                builtin = excluded.builtin,
                updated_at = excluded.updated_at
            "#,
            params![plugin.id, if plugin.enabled { 1 } else { 0 }, manifest_json, now],
        )
        .map_err(|error| format!("Failed to seed plugin state: {error}"))?;
    }
    Ok(())
}

fn read_local_plugin_manifests() -> Result<Vec<PluginManifest>, String> {
    let mut manifests = Vec::new();
    let dir = plugins_dir()?;
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(manifests);
    };

    for entry in entries.flatten() {
        let path = entry.path().join("plugin.json");
        if !path.is_file() {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        match serde_json::from_str::<PluginManifest>(&text) {
            Ok(mut manifest) => {
                manifest.builtin = false;
                manifests.push(manifest);
            }
            Err(error) => {
                let _ = log_plugin_event_raw("plugin-loader", "error", &format!("Invalid plugin manifest {}: {error}", path.display()));
            }
        }
    }
    Ok(manifests)
}

fn all_plugins(conn: &Connection) -> Result<Vec<PluginManifest>, String> {
    let settings = app_settings(conn)?;
    let mut plugins = default_plugins();
    plugins.extend(read_local_plugin_manifests()?);

    let mut merged = Vec::new();
    for mut plugin in plugins {
        let state: Option<(i64, String)> = conn
            .query_row(
                "SELECT enabled, manifest_json FROM plugin_states WHERE id = ?1",
                params![plugin.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| format!("Failed to read plugin state: {error}"))?;

        if let Some((enabled, _)) = state {
            plugin.enabled = enabled != 0;
        } else {
            let manifest_json = serde_json::to_string(&plugin)
                .map_err(|error| format!("Failed to serialize plugin manifest: {error}"))?;
            conn.execute(
                "INSERT INTO plugin_states (id, enabled, manifest_json, builtin, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![plugin.id, if plugin.enabled { 1 } else { 0 }, manifest_json, if plugin.builtin { 1 } else { 0 }, now_string()],
            )
            .map_err(|error| format!("Failed to save plugin manifest: {error}"))?;
        }

        if settings.safe_mode && !plugin.builtin {
            plugin.enabled = false;
        }
        merged.push(plugin);
    }
    merged.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(merged)
}

fn plugin_enabled(plugins: &[PluginManifest], id: &str) -> bool {
    plugins.iter().any(|plugin| plugin.id == id && plugin.enabled)
}

fn default_commands(plugins: &[PluginManifest]) -> Vec<OrbitCommand> {
    let mut commands = Vec::new();
    let mut push = |plugin_id: &str, id: &str, title: &str, subtitle: &str, icon: &str, keywords: &[&str]| {
        if plugin_enabled(plugins, plugin_id) {
            commands.push(OrbitCommand {
                id: id.to_string(),
                title: title.to_string(),
                subtitle: subtitle.to_string(),
                plugin_id: plugin_id.to_string(),
                icon: icon.to_string(),
                keywords: keywords.iter().map(|keyword| keyword.to_string()).collect(),
            });
        }
    };

    push("core-items", "core.addItem", "添加资源", "添加应用、文件、文件夹、网址、脚本或动作链", "PlusCircle", &["add", "new", "import"]);
    push("core-actions", "core.addActionChain", "新建动作链", "用多行目标创建一个工作区启动链", "Workflow", &["chain", "workspace", "automation"]);
    push("core-shortcuts", "core.scanShortcuts", "扫描桌面和开始菜单", "导入 Windows .lnk 快捷方式", "ScanSearch", &["scan", "shortcut"]);
    push("core-bookmarks", "core.scanBookmarks", "导入浏览器书签", "扫描 Edge 和 Chrome 书签", "Bookmark", &["bookmark", "browser", "edge", "chrome"]);
    push("core-backup", "core.exportJson", "导出 JSON", "导出本地资源、插件状态和主题设置", "Download", &["export", "backup"]);
    push("core-themes", "core.themeStudio", "打开主题工作室", "选择主题并实时预览变量", "Palette", &["theme", "style"]);
    push("core-plugin-dev", "core.createPluginTemplate", "创建插件模板", "在本地插件目录生成 Hello Command 模板", "FileCode2", &["plugin", "template", "sdk"]);
    push("core-plugin-dev", "core.openDataDir", "打开数据目录", "查看数据库、插件、主题和备份文件", "FolderOpen", &["data", "plugins", "themes"]);
    push("core-command-palette", "core.commandPalette", "打开命令面板", "统一搜索资源、命令和插件结果", "Search", &["search", "command"]);
    commands
}

fn default_theme(id: &str, name: &str, author: &str, description: &str, tokens: &[(&str, &str)]) -> ThemeManifest {
    ThemeManifest {
        id: id.to_string(),
        name: name.to_string(),
        author: author.to_string(),
        description: description.to_string(),
        builtin: true,
        tokens: tokens.iter().map(|(key, value)| (key.to_string(), value.to_string())).collect(),
    }
}

fn builtin_themes() -> Vec<ThemeManifest> {
    vec![
        default_theme(
            "local-galaxy",
            "Local Galaxy",
            "OrbitStart",
            "深空、暗金和青绿高光组成的默认桌面 GUI 主题。",
            &[
                ("--font-ui", "\"Segoe UI\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", system-ui, sans-serif"),
                ("--font-title", "\"Noto Serif SC\", \"Source Han Serif SC\", \"Microsoft YaHei UI\", serif"),
                ("--font-mono", "\"IBM Plex Mono\", \"Cascadia Mono\", \"Consolas\", monospace"),
                ("--bg-deep", "#050812"),
                ("--bg-space", "#080d1a"),
                ("--bg-panel", "rgba(12, 18, 34, 0.88)"),
                ("--bg-panel-soft", "rgba(17, 25, 45, 0.74)"),
                ("--bg-card", "rgba(13, 21, 38, 0.82)"),
                ("--text-main", "#f4ebd3"),
                ("--text-soft", "#c9bfa8"),
                ("--text-muted", "#8f9aaf"),
                ("--gold", "#d6a85c"),
                ("--gold-soft", "#b98d48"),
                ("--gold-dim", "rgba(214, 168, 92, 0.38)"),
                ("--teal", "#27d7c6"),
                ("--teal-soft", "#4fe7d8"),
                ("--teal-dim", "rgba(39, 215, 198, 0.28)"),
                ("--star", "#fff2c6"),
                ("--violet", "#7a6cff"),
                ("--nebula", "rgba(125, 96, 190, 0.22)"),
                ("--border-gold", "rgba(214, 168, 92, 0.42)"),
                ("--border-teal", "rgba(39, 215, 198, 0.36)"),
                ("--border-soft", "rgba(255, 242, 198, 0.12)"),
                ("--shadow-panel", "0 18px 60px rgba(0, 0, 0, 0.38)"),
                ("--shadow-glow-teal", "0 0 24px rgba(39, 215, 198, 0.20)"),
                ("--shadow-glow-gold", "0 0 24px rgba(214, 168, 92, 0.18)"),
                ("--bg", "#050812"),
                ("--surface", "rgba(12, 18, 34, 0.88)"),
                ("--surface-strong", "rgba(8, 13, 26, 0.96)"),
                ("--surface-soft", "rgba(255, 242, 198, 0.055)"),
                ("--line", "rgba(255, 242, 198, 0.12)"),
                ("--text", "#f4ebd3"),
                ("--soft", "#c9bfa8"),
                ("--muted", "#8f9aaf"),
                ("--accent", "#27d7c6"),
                ("--accent-2", "#d6a85c"),
                ("--accent-3", "#ff7a90"),
                ("--ok", "#80e6a7"),
            ],
        ),
        default_theme(
            "orbit-dark",
            "Zentou Wireframe",
            "OrbitStart",
            "手绘风格的线框草图，包含方格纸背景、多标签页变体、便签注释。",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-title", "\"Playfair Display\", Georgia, \"Times New Roman\", serif"),
                ("--font-mono", "\"SF Mono\", ui-monospace, Menlo, monospace"),
                ("--bg-deep", "#F5F2EB"),
                ("--bg", "#FAF6EE"),
                ("--app-bg", "#FAF6EE"),
                ("--rail", "#F5F2EB"),
                ("--surface", "#ffffff"),
                ("--surface-2", "#FAF6EE"),
                ("--surface-3", "#F5F2EB"),
                ("--surface-strong", "#ffffff"),
                ("--surface-soft", "#F5F2EB"),
                ("--field", "#ffffff"),
                ("--field-strong", "#ffffff"),
                ("--line", "#1a1a1a"),
                ("--line-strong", "#000000"),
                ("--line-focus", "#e0533c"),
                ("--text", "#1a1a1a"),
                ("--soft", "#444444"),
                ("--muted", "#777777"),
                ("--gold", "#f2c046"),
                ("--teal", "#27ae60"),
                ("--teal-soft", "#2ecc71"),
                ("--danger", "#e0533c"),
                ("--accent", "#e0533c"),
                ("--accent-2", "#f2c046"),
                ("--accent-3", "#fca1a1"),
                ("--ok", "#27ae60"),
                ("--warning", "#f2c046"),
                ("--radius-sm", "4px"),
                ("--radius", "6px"),
                ("--radius-md", "6px"),
                ("--radius-lg", "8px"),
                ("--shadow-card", "2px 2px 0px #1a1a1a"),
                ("--shadow-elevated", "5px 5px 0px #1a1a1a"),
                ("--focus-ring", "0 0 0 3px rgba(224, 83, 60, 0.2)"),
            ],
        ),
        default_theme(
            "graphite-light",
            "Graphite Light",
            "OrbitStart",
            "浅色、低干扰，适合白天办公。",
            &[
                ("--font-ui", "\"Segoe UI\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", system-ui, sans-serif"),
                ("--font-title", "\"Segoe UI\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", system-ui, sans-serif"),
                ("--font-mono", "\"Cascadia Mono\", \"IBM Plex Mono\", \"Consolas\", monospace"),
                ("--bg-deep", "#eceff3"),
                ("--bg", "#f3f4f6"),
                ("--app-bg", "rgba(244, 246, 248, 0.98)"),
                ("--rail", "#f8fafc"),
                ("--surface", "rgba(255, 255, 255, 0.94)"),
                ("--surface-2", "rgba(255, 255, 255, 0.98)"),
                ("--surface-3", "rgba(239, 242, 246, 0.96)"),
                ("--surface-strong", "#ffffff"),
                ("--surface-soft", "rgba(17, 24, 39, 0.035)"),
                ("--field", "rgba(255, 255, 255, 0.78)"),
                ("--field-strong", "#ffffff"),
                ("--line", "rgba(22, 24, 29, 0.12)"),
                ("--line-strong", "rgba(22, 24, 29, 0.18)"),
                ("--line-focus", "rgba(20, 125, 115, 0.42)"),
                ("--text", "#17191f"),
                ("--soft", "rgba(23, 25, 31, 0.86)"),
                ("--muted", "rgba(23, 25, 31, 0.72)"),
                ("--gold", "#b86b13"),
                ("--teal", "#147d73"),
                ("--teal-soft", "#0f9f90"),
                ("--danger", "#c73f5c"),
                ("--accent", "#147d73"),
                ("--accent-2", "#b86b13"),
                ("--accent-3", "#c73f5c"),
                ("--ok", "#3d7f2e"),
                ("--warning", "#b86b13"),
                ("--shadow-card", "0 14px 34px rgba(17, 24, 39, 0.08)"),
                ("--shadow-elevated", "0 24px 90px rgba(17, 24, 39, 0.18)"),
                ("--focus-ring", "0 0 0 3px rgba(20, 125, 115, 0.14)"),
            ],
        ),
        default_theme(
            "ink-blue",
            "People's Platform",
            "OrbitStart",
            "人民平台：块状粗体风格，活动海报能量：奶油色背景上的蓝、橙、红配色。",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-body", "Inter, system-ui, sans-serif"),
                ("--font-title", "\"Alfa Slab One\", Impact, sans-serif"),
                ("--font-mono", "\"Cascadia Mono\", monospace"),
                ("--bg-deep", "#ECE6D5"),
                ("--bg", "#F7F3E7"),
                ("--app-bg", "#F7F3E7"),
                ("--rail", "#ECE6D5"),
                ("--surface", "#2b3fd4"),
                ("--surface-2", "#3446DF"),
                ("--surface-3", "#F48B29"),
                ("--surface-strong", "#1e2cb0"),
                ("--surface-soft", "rgba(247, 243, 231, 0.08)"),
                ("--field", "#ffffff"),
                ("--field-strong", "#fdfdfd"),
                ("--line", "#18181A"),
                ("--line-strong", "#18181A"),
                ("--line-focus", "#F48B29"),
                ("--text", "#ffffff"),
                ("--soft", "#ECE6D5"),
                ("--muted", "#ECE6D5"),
                ("--accent", "#F48B29"),
                ("--accent-2", "#E33D2D"),
                ("--accent-3", "#2b3fd4"),
                ("--ok", "#26A65B"),
                ("--warning", "#F48B29"),
                ("--danger", "#E33D2D"),
                ("--radius-sm", "4px"),
                ("--radius", "4px"),
                ("--radius-md", "4px"),
                ("--radius-lg", "4px"),
                ("--shadow-card", "4px 4px 0px #18181A"),
                ("--shadow-elevated", "8px 8px 0px #E33D2D"),
                ("--focus-ring", "0 0 0 3px rgba(244, 139, 41, 0.25)"),
            ],
        ),
        default_theme(
            "sky-blue",
            "Sky Blue",
            "OrbitStart",
            "Bright blue desktop theme with clean white panels.",
            &[
                ("--font-ui", "\"Segoe UI\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", system-ui, sans-serif"),
                ("--font-title", "\"Segoe UI\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", system-ui, sans-serif"),
                ("--font-mono", "\"Cascadia Mono\", \"IBM Plex Mono\", \"Consolas\", monospace"),
                ("--bg-deep", "#dff2ff"),
                ("--bg", "#eaf6ff"),
                ("--app-bg", "rgba(234, 246, 255, 0.98)"),
                ("--rail", "#f4fbff"),
                ("--surface", "rgba(255, 255, 255, 0.94)"),
                ("--surface-2", "rgba(245, 251, 255, 0.96)"),
                ("--surface-3", "rgba(225, 241, 252, 0.95)"),
                ("--surface-strong", "#ffffff"),
                ("--surface-soft", "rgba(15, 34, 52, 0.035)"),
                ("--field", "rgba(255, 255, 255, 0.76)"),
                ("--field-strong", "#ffffff"),
                ("--line", "rgba(20, 68, 102, 0.13)"),
                ("--line-strong", "rgba(20, 68, 102, 0.2)"),
                ("--line-focus", "rgba(2, 132, 199, 0.42)"),
                ("--text", "#0f172a"),
                ("--soft", "rgba(15, 23, 42, 0.86)"),
                ("--muted", "rgba(15, 23, 42, 0.72)"),
                ("--gold", "#b7791f"),
                ("--teal", "#0284c7"),
                ("--teal-soft", "#0ea5e9"),
                ("--danger", "#dc4766"),
                ("--accent", "#0284c7"),
                ("--accent-2", "#b7791f"),
                ("--accent-3", "#dc4766"),
                ("--ok", "#15803d"),
                ("--warning", "#b7791f"),
                ("--shadow-card", "0 14px 34px rgba(14, 86, 132, 0.1)"),
                ("--shadow-elevated", "0 24px 90px rgba(14, 86, 132, 0.2)"),
                ("--focus-ring", "0 0 0 3px rgba(2, 132, 199, 0.14)"),
            ],
        ),
        default_theme(
            "mint-light",
            "Mint Light",
            "OrbitStart",
            "Light green desktop theme with calm mint surfaces.",
            &[
                ("--font-ui", "\"Segoe UI\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", system-ui, sans-serif"),
                ("--font-title", "\"Segoe UI\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", system-ui, sans-serif"),
                ("--font-mono", "\"Cascadia Mono\", \"IBM Plex Mono\", \"Consolas\", monospace"),
                ("--bg-deep", "#e3f8ec"),
                ("--bg", "#ecfbf3"),
                ("--app-bg", "rgba(236, 251, 243, 0.98)"),
                ("--rail", "#f7fff9"),
                ("--surface", "rgba(255, 255, 255, 0.94)"),
                ("--surface-2", "rgba(247, 255, 251, 0.96)"),
                ("--surface-3", "rgba(226, 246, 236, 0.95)"),
                ("--surface-strong", "#ffffff"),
                ("--surface-soft", "rgba(16, 38, 30, 0.035)"),
                ("--field", "rgba(255, 255, 255, 0.76)"),
                ("--field-strong", "#ffffff"),
                ("--line", "rgba(22, 101, 52, 0.13)"),
                ("--line-strong", "rgba(22, 101, 52, 0.2)"),
                ("--line-focus", "rgba(5, 150, 105, 0.42)"),
                ("--text", "#102018"),
                ("--soft", "rgba(16, 32, 24, 0.86)"),
                ("--muted", "rgba(16, 32, 24, 0.72)"),
                ("--gold", "#a16207"),
                ("--teal", "#059669"),
                ("--teal-soft", "#10b981"),
                ("--danger", "#be3a58"),
                ("--accent", "#059669"),
                ("--accent-2", "#a16207"),
                ("--accent-3", "#be3a58"),
                ("--ok", "#15803d"),
                ("--warning", "#a16207"),
                ("--shadow-card", "0 14px 34px rgba(22, 101, 52, 0.1)"),
                ("--shadow-elevated", "0 24px 90px rgba(22, 101, 52, 0.2)"),
                ("--focus-ring", "0 0 0 3px rgba(5, 150, 105, 0.14)"),
            ],
        ),
        default_theme(
            "atelier-zero",
            "Atelier Zero",
            "OrbitStart",
            "Elegant paper-textured theme based on Warm Editorial.",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-body", "Inter, system-ui, sans-serif"),
                ("--font-title", "Georgia, \"Times New Roman\", serif"),
                ("--font-mono", "\"SF Mono\", ui-monospace, Menlo, monospace"),
                ("--bg-deep", "#fbf6ee"),
                ("--bg", "#fbf6ee"),
                ("--app-bg", "#fbf6ee"),
                ("--rail", "#fbf6ee"),
                ("--surface", "#fffdf8"),
                ("--surface-2", "#f1e3cf"),
                ("--surface-3", "#ded2c3"),
                ("--surface-strong", "#fffdf8"),
                ("--surface-soft", "#eee4d7"),
                ("--field", "#fffdf8"),
                ("--field-strong", "#fffdf8"),
                ("--line", "#eee4d7"),
                ("--line-strong", "#ded2c3"),
                ("--line-focus", "#9b5b32"),
                ("--text", "#201914"),
                ("--soft", "#4c4037"),
                ("--muted", "#7a6d63"),
                ("--accent", "#9b5b32"),
                ("--accent-2", "#2f5b4f"),
                ("--accent-3", "#b33a3a"),
                ("--ok", "#4f8a4f"),
                ("--warning", "#c9822f"),
                ("--danger", "#b33a3a"),
                ("--radius-sm", "10px"),
                ("--radius", "16px"),
                ("--radius-md", "16px"),
                ("--radius-lg", "24px"),
                ("--shadow-card", "none"),
                ("--shadow-elevated", "0 20px 52px rgba(32, 25, 20, 0.12)"),
                ("--focus-ring", "0 0 0 4px rgba(155, 91, 50, 0.24)"),
            ],
        ),
        default_theme(
            "creative-mode",
            "Creative Mode",
            "OrbitStart",
            "Bold Neo-Brutalist theme with confident multi-tone accents.",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-body", "Inter, system-ui, sans-serif"),
                ("--font-title", "\"Archivo Black\", Impact, sans-serif"),
                ("--font-mono", "\"SF Mono\", ui-monospace, Menlo, monospace"),
                ("--bg-deep", "#e8e3d3"),
                ("--bg", "#f3efe0"),
                ("--app-bg", "#f3efe0"),
                ("--rail", "#f3efe0"),
                ("--surface", "#ffffff"),
                ("--surface-2", "#ece6d5"),
                ("--surface-3", "#dcd6c5"),
                ("--surface-strong", "#ffffff"),
                ("--surface-soft", "#efe8d4"),
                ("--field", "#ffffff"),
                ("--field-strong", "#ffffff"),
                ("--line", "#000000"),
                ("--line-strong", "#000000"),
                ("--line-focus", "#e05929"),
                ("--text", "#000000"),
                ("--soft", "#222222"),
                ("--muted", "#555555"),
                ("--accent", "#1a8f53"),
                ("--accent-2", "#ea5e98"),
                ("--accent-3", "#e05929"),
                ("--ok", "#1a8f53"),
                ("--warning", "#f5b041"),
                ("--danger", "#e05929"),
                ("--radius-sm", "4px"),
                ("--radius", "4px"),
                ("--radius-md", "4px"),
                ("--radius-lg", "4px"),
                ("--shadow-card", "4px 4px 0px #000000"),
                ("--shadow-elevated", "8px 8px 0px #000000"),
                ("--focus-ring", "0 0 0 4px rgba(224, 89, 41, 0.24)"),
            ],
        ),
    ]
}

fn read_local_themes() -> Result<Vec<ThemeManifest>, String> {
    let mut themes = Vec::new();
    let dir = themes_dir()?;
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(themes);
    };

    for entry in entries.flatten() {
        let path = entry.path().join("theme.json");
        if !path.is_file() {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        if let Ok(mut theme) = serde_json::from_str::<ThemeManifest>(&text) {
            theme.builtin = false;
            themes.push(theme);
        }
    }
    Ok(themes)
}

fn all_themes() -> Result<Vec<ThemeManifest>, String> {
    let mut themes = builtin_themes();
    themes.extend(read_local_themes()?);
    Ok(themes)
}

fn make_id(prefix: &str, target: &str) -> String {
    let mut hasher = DefaultHasher::new();
    target.hash(&mut hasher);
    format!("{prefix}-{:x}", hasher.finish())
}

fn extension_lower(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase()
}

fn display_title_from_path(path: &Path) -> String {
    path.file_stem()
        .or_else(|| path.file_name())
        .and_then(|value| value.to_str())
        .unwrap_or("Dropped resource")
        .to_string()
}

fn associated_icon_base64(path: &Path) -> Option<String> {
    if !path.exists() {
        return None;
    }

    #[cfg(target_os = "windows")]
    {
        let script = r#"
param([string]$Path)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
if (-not (Test-Path -LiteralPath $Path)) { exit 0 }
$realPath = $Path
if ($Path.EndsWith('.lnk', [System.StringComparison]::OrdinalIgnoreCase)) {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($Path)
    if ($shortcut -and $shortcut.TargetPath) {
        $realPath = $shortcut.TargetPath
    }
}
if (-not (Test-Path -LiteralPath $realPath)) { exit 0 }
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($realPath)
if (-not $icon) { exit 0 }
$bitmap = $icon.ToBitmap()
$stream = New-Object System.IO.MemoryStream
$bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
$bytes = $stream.ToArray()
$stream.Dispose()
$bitmap.Dispose()
$icon.Dispose()
'data:image/png;base64,' + [Convert]::ToBase64String($bytes)
"#;
        let path_arg = path.to_string_lossy().to_string();
        let output = ProcessCommand::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script, &path_arg])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let icon = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if icon.starts_with("data:image/") {
            return Some(icon);
        }
    }

    None
}

fn run_sta_powershell(script: &str) -> Result<Option<String>, String> {
    let mut command = ProcessCommand::new("powershell");
    command.args([
        "-NoProfile",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);

    let output = command
        .output()
        .map_err(|error| format!("Failed to open picker: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Picker was closed before returning a value".to_string()
        } else {
            stderr
        });
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        Ok(None)
    } else {
        Ok(Some(value))
    }
}

fn pick_file_path(filter: &str, title: &str) -> Result<Option<String>, String> {
    let script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = '{title}'
$dialog.Filter = '{filter}'
$dialog.Multiselect = $false
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
  [Console]::Out.Write($dialog.FileName)
}}
"#
    );
    run_sta_powershell(&script)
}

fn pick_folder_path() -> Result<Option<String>, String> {
    let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select a folder'
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.Write($dialog.SelectedPath)
}
"#;
    run_sta_powershell(script)
}

fn image_mime_type(path: &Path) -> &'static str {
    match extension_lower(path).as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        _ => "image/png",
    }
}

fn image_file_to_data_url(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| format!("Failed to read image: {error}"))?;
    let encoded = general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{};base64,{}", image_mime_type(path), encoded))
}

fn item_input_from_dropped_path(path_text: &str) -> OrbitItemInput {
    let path = PathBuf::from(path_text);
    let extension = extension_lower(&path);
    let is_dir = fs::metadata(&path).map(|metadata| metadata.is_dir()).unwrap_or(false);
    let title = display_title_from_path(&path);
    let icon_base64 = associated_icon_base64(&path);
    let path_string = path.to_string_lossy().to_string();

    let (kind, group, icon, accent, category_tag) = if is_dir {
        ("folder", "work", "FolderOpen", "#8bd450", "folder")
    } else if ["ps1", "bat", "cmd", "sh", "py", "js", "ts", "vbs", "ahk"].contains(&extension.as_str()) {
        ("script", "scripts", "TerminalSquare", "#41e0a8", "script")
    } else if ["exe", "lnk", "appref-ms", "msi"].contains(&extension.as_str()) {
        ("app", "apps", "AppWindow", "#5cc8ff", "app")
    } else {
        ("file", "work", "FileText", "#f6b95b", "file")
    };

    let mut aliases = vec![title.clone(), path_string.clone()];
    if let Some(parent) = path.parent().and_then(|value| value.to_str()) {
        aliases.push(parent.to_string());
    }

    let mut tags = vec!["drag-drop".to_string(), category_tag.to_string()];
    if !extension.is_empty() {
        tags.push(extension.clone());
    }

    OrbitItemInput {
        title,
        subtitle: path_string.clone(),
        kind: kind.to_string(),
        group: group.to_string(),
        target: path_string,
        aliases,
        tags,
        icon: icon_base64.unwrap_or_else(|| icon.to_string()),
        accent: accent.to_string(),
        favorite: false,
    }
}

fn insert_item(conn: &Connection, input: &OrbitItemInput) -> Result<OrbitItem, String> {
    let id = make_id(&input.kind, &input.target);
    let now = now_string();
    conn.execute(
        r#"
        INSERT OR IGNORE INTO items (
            id, title, subtitle, kind, group_id, target, aliases_json, tags_json,
            icon, accent, favorite, launch_count, last_launched_at, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, NULL, ?12, ?12)
        "#,
        params![
            id,
            input.title,
            input.subtitle,
            input.kind,
            input.group,
            input.target,
            serde_json::to_string(&input.aliases).unwrap_or_else(|_| "[]".to_string()),
            serde_json::to_string(&input.tags).unwrap_or_else(|_| "[]".to_string()),
            input.icon,
            input.accent,
            if input.favorite { 1 } else { 0 },
            now,
        ],
    )
    .map_err(|error| format!("Failed to insert item: {error}"))?;

    get_item(conn, &id)?.ok_or_else(|| "Failed to read inserted item".to_string())
}

fn upsert_scanned_item(conn: &Connection, input: &OrbitItemInput) -> Result<OrbitItem, String> {
    let id = make_id(&input.kind, &input.target);
    let now = now_string();
    conn.execute(
        r#"
        INSERT INTO items (
            id, title, subtitle, kind, group_id, target, aliases_json, tags_json,
            icon, accent, favorite, launch_count, last_launched_at, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, NULL, ?12, ?12)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            subtitle = excluded.subtitle,
            aliases_json = excluded.aliases_json,
            tags_json = excluded.tags_json,
            icon = excluded.icon,
            accent = excluded.accent,
            updated_at = excluded.updated_at
        "#,
        params![
            id,
            input.title,
            input.subtitle,
            input.kind,
            input.group,
            input.target,
            serde_json::to_string(&input.aliases).unwrap_or_else(|_| "[]".to_string()),
            serde_json::to_string(&input.tags).unwrap_or_else(|_| "[]".to_string()),
            input.icon,
            input.accent,
            if input.favorite { 1 } else { 0 },
            now,
        ],
    )
    .map_err(|error| format!("Failed to upsert scanned item: {error}"))?;

    get_item(conn, &id)?.ok_or_else(|| "Failed to read scanned item".to_string())
}

fn get_item(conn: &Connection, id: &str) -> Result<Option<OrbitItem>, String> {
    conn.query_row(
        r#"
        SELECT id, title, subtitle, kind, group_id, target, aliases_json, tags_json,
               icon, accent, favorite, launch_count, last_launched_at
        FROM items
        WHERE id = ?1
        "#,
        params![id],
        item_from_row,
    )
    .optional()
    .map_err(|error| format!("Failed to read item: {error}"))
}

fn item_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<OrbitItem> {
    let aliases_json: String = row.get(6)?;
    let tags_json: String = row.get(7)?;
    let favorite: i64 = row.get(10)?;
    let launch_count: i64 = row.get(11)?;

    Ok(OrbitItem {
        id: row.get(0)?,
        title: row.get(1)?,
        subtitle: row.get(2)?,
        kind: row.get(3)?,
        group: row.get(4)?,
        target: row.get(5)?,
        aliases: serde_json::from_str(&aliases_json).unwrap_or_default(),
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        icon: row.get(8)?,
        accent: row.get(9)?,
        favorite: favorite != 0,
        launch_count: launch_count.max(0) as u32,
        last_launched_at: row.get(12)?,
    })
}

fn all_items(conn: &Connection) -> Result<Vec<OrbitItem>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, title, subtitle, kind, group_id, target, aliases_json, tags_json,
                   icon, accent, favorite, launch_count, last_launched_at
            FROM items
            ORDER BY favorite DESC, launch_count DESC, title COLLATE NOCASE ASC
            "#,
        )
        .map_err(|error| format!("Failed to prepare item query: {error}"))?;

    let rows = stmt
        .query_map([], item_from_row)
        .map_err(|error| format!("Failed to query items: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to map items: {error}"))
}

fn plugin_logs(conn: &Connection, limit: usize) -> Result<Vec<PluginLog>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, plugin_id, level, message, created_at
            FROM plugin_logs
            ORDER BY CAST(created_at AS INTEGER) DESC
            LIMIT ?1
            "#,
        )
        .map_err(|error| format!("Failed to prepare plugin log query: {error}"))?;
    let rows = stmt
        .query_map(params![limit as i64], |row| {
            Ok(PluginLog {
                id: row.get(0)?,
                plugin_id: row.get(1)?,
                level: row.get(2)?,
                message: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|error| format!("Failed to query plugin logs: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to map plugin logs: {error}"))
}

fn log_plugin_event(conn: &Connection, plugin_id: &str, level: &str, message: &str) -> Result<(), String> {
    let now = now_string();
    let id = make_id("log", &format!("{plugin_id}:{level}:{message}:{now}"));
    conn.execute(
        "INSERT OR REPLACE INTO plugin_logs (id, plugin_id, level, message, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, plugin_id, level, message, now],
    )
    .map_err(|error| format!("Failed to write plugin log: {error}"))?;
    Ok(())
}

fn log_plugin_event_raw(plugin_id: &str, level: &str, message: &str) -> Result<(), String> {
    let conn = open_db()?;
    log_plugin_event(&conn, plugin_id, level, message)
}

#[tauri::command]
fn catalog_snapshot() -> Result<CatalogSnapshot, String> {
    let conn = open_db()?;
    let plugins = all_plugins(&conn)?;
    Ok(CatalogSnapshot {
        items: all_items(&conn)?,
        groups: all_groups(&conn)?,
        commands: default_commands(&plugins),
        plugins,
        themes: all_themes()?,
        settings: app_settings(&conn)?,
        logs: plugin_logs(&conn, 60)?,
    })
}

#[tauri::command]
fn create_item(app: tauri::AppHandle, input: OrbitItemInput) -> Result<OrbitItem, String> {
    let conn = open_db()?;
    let item = insert_item(&conn, &input)?;
    let _ = app.emit("orbit://refresh-resources", ());
    Ok(item)
}

#[tauri::command]
fn create_items_from_paths(app: tauri::AppHandle, paths: Vec<String>) -> Result<Vec<OrbitItem>, String> {
    let conn = open_db()?;
    let mut created = Vec::new();
    for path in paths.iter().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        let input = item_input_from_dropped_path(path);
        created.push(insert_item(&conn, &input)?);
    }
    if !created.is_empty() {
        log_plugin_event(
            &conn,
            "core-shortcuts",
            "info",
            &format!("Drag-drop import completed: {} resources", created.len()),
        )?;
        let _ = app.emit("orbit://refresh-resources", ());
    }
    Ok(created)
}

#[tauri::command]
fn pick_resource_input(mode: String) -> Result<Option<OrbitItemInput>, String> {
    let picked = if mode == "folder" {
        pick_folder_path()?
    } else {
        pick_file_path(
            "Applications, shortcuts, scripts, files|*.exe;*.lnk;*.msi;*.appref-ms;*.cmd;*.bat;*.ps1;*.py;*.js;*.ts;*.vbs;*.ahk;*.*|All files|*.*",
            "Select a resource",
        )?
    };
    Ok(picked.map(|path| item_input_from_dropped_path(&path)))
}

#[tauri::command]
fn pick_icon_image() -> Result<Option<String>, String> {
    let picked = pick_file_path(
        "Images|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.svg;*.ico|All files|*.*",
        "Select an icon image",
    )?;
    match picked {
        Some(path) => Ok(Some(image_file_to_data_url(Path::new(&path))?)),
        None => Ok(None),
    }
}

#[tauri::command]
fn create_group(app: tauri::AppHandle, title: String) -> Result<Vec<OrbitGroup>, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Group title cannot be empty".to_string());
    }
    let conn = open_db()?;
    let id = make_id("group", title);
    conn.execute(
        "INSERT OR IGNORE INTO groups (id, title, icon, description, custom, created_at) VALUES (?1, ?2, 'Bookmark', ?3, 1, ?4)",
        params![id, title, format!("自定义标签：{title}"), now_string()],
    )
    .map_err(|error| format!("Failed to create group: {error}"))?;
    let _ = app.emit("orbit://refresh-resources", ());
    all_groups(&conn)
}

#[tauri::command]
fn update_item(app: tauri::AppHandle, item: OrbitItem) -> Result<OrbitItem, String> {
    let conn = open_db()?;
    let id = item.id.clone();
    let now = now_string();
    conn.execute(
        r#"
        UPDATE items
        SET title = ?2,
            subtitle = ?3,
            kind = ?4,
            group_id = ?5,
            target = ?6,
            aliases_json = ?7,
            tags_json = ?8,
            icon = ?9,
            accent = ?10,
            favorite = ?11,
            launch_count = ?12,
            last_launched_at = ?13,
            updated_at = ?14
        WHERE id = ?1
        "#,
        params![
            id,
            item.title,
            item.subtitle,
            item.kind,
            item.group,
            item.target,
            serde_json::to_string(&item.aliases).unwrap_or_else(|_| "[]".to_string()),
            serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string()),
            item.icon,
            item.accent,
            if item.favorite { 1 } else { 0 },
            item.launch_count,
            item.last_launched_at,
            now,
        ],
    )
    .map_err(|error| format!("Failed to update item: {error}"))?;
    let _ = app.emit("orbit://refresh-resources", ());
    get_item(&conn, &id)?.ok_or_else(|| "Item not found after update".to_string())
}

#[tauri::command]
fn delete_item(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db()?;
    conn.execute("DELETE FROM items WHERE id = ?1", params![id])
        .map_err(|error| format!("Failed to delete item: {error}"))?;
    let _ = app.emit("orbit://refresh-resources", ());
    Ok(())
}

#[tauri::command]
fn launch_item(id: String) -> Result<String, String> {
    let conn = open_db()?;
    let item = get_item(&conn, &id)?.ok_or_else(|| "Item not found".to_string())?;
    if item.kind == "action_chain" {
        launch_action_chain(&item.target)?;
    } else {
        launch_target(item.target.clone())?;
    }
    let now = now_string();
    conn.execute(
        "UPDATE items SET launch_count = launch_count + 1, last_launched_at = ?2, updated_at = ?2 WHERE id = ?1",
        params![id, now],
    )
    .map_err(|error| format!("Failed to update launch count: {error}"))?;
    Ok(format!("已启动：{}", item.title))
}

fn launch_action_chain(targets: &str) -> Result<(), String> {
    let mut launched = 0;
    for target in targets.lines().map(str::trim).filter(|line| !line.is_empty() && !line.starts_with('#')) {
        launch_target(target.to_string())?;
        launched += 1;
    }
    if launched == 0 {
        return Err("Action chain is empty".to_string());
    }
    Ok(())
}

#[tauri::command]
fn launch_target(target: String) -> Result<String, String> {
    if target.starts_with("orbit://") {
        return Ok(format!("Orbit action acknowledged: {target}"));
    }

    #[cfg(target_os = "windows")]
    {
        let mut command = if target.starts_with("http://") || target.starts_with("https://") || target.contains("://") {
            let mut cmd = ProcessCommand::new("rundll32.exe");
            cmd.arg("url.dll,FileProtocolHandler").arg(&target);
            cmd
        } else {
            let mut cmd = ProcessCommand::new("explorer.exe");
            cmd.arg(&target);
            cmd
        };

        command
            .spawn()
            .map_err(|error| format!("启动失败：{error}"))?;
        Ok(format!("已启动：{target}"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err(format!("Launching is currently implemented on Windows only: {target}"))
    }
}

fn target_path_without_arguments(target: &str) -> String {
    let trimmed = target.trim();
    if let Some(rest) = trimmed.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            return rest[..end].to_string();
        }
    }
    if let Some(index) = trimmed.to_lowercase().find(".exe ") {
        return trimmed[..index + 4].to_string();
    }
    trimmed.to_string()
}

#[tauri::command]
fn reveal_target(target: String) -> Result<String, String> {
    if target.starts_with("http://") || target.starts_with("https://") || target.contains("://") {
        return launch_target(target);
    }

    #[cfg(target_os = "windows")]
    {
        let cleaned = target_path_without_arguments(&target);
        let path = PathBuf::from(&cleaned);
        if path.is_file() {
            ProcessCommand::new("explorer.exe")
                .arg(format!("/select,{}", path.to_string_lossy()))
                .spawn()
                .map_err(|error| format!("Failed to reveal target: {error}"))?;
            return Ok(format!("Revealed {cleaned}"));
        }
        if path.is_dir() {
            return launch_target(cleaned);
        }
        if let Some(parent) = path.parent() {
            if parent.is_dir() {
                return launch_target(parent.to_string_lossy().to_string());
            }
        }
    }

    Err(format!("Cannot reveal target: {target}"))
}

fn scan_dir_for_shortcuts(path: &Path, out: &mut Vec<OrbitItemInput>) {
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_dir_for_shortcuts(&path, out);
            continue;
        }

        let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
            continue;
        };

        if !extension.eq_ignore_ascii_case("lnk") {
            continue;
        }

        let title = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Shortcut")
            .to_string();
        let target = path.to_string_lossy().to_string();

        out.push(OrbitItemInput {
            title,
            subtitle: target.clone(),
            kind: "app".to_string(),
            group: "apps".to_string(),
            target,
            aliases: vec![],
            tags: vec!["shortcut".to_string(), "scan".to_string()],
            icon: "AppWindow".to_string(),
            accent: "#5cc8ff".to_string(),
            favorite: false,
        });
    }
}

fn shortcut_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(profile) = std::env::var_os("USERPROFILE") {
        roots.push(PathBuf::from(profile).join("Desktop"));
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        roots.push(PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    if let Some(program_data) = std::env::var_os("PROGRAMDATA") {
        roots.push(PathBuf::from(program_data).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    roots
}

fn scan_shortcuts_with_powershell() -> Result<Vec<OrbitItemInput>, String> {
    let script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
function Get-IconData([string]$path) {
  try {
    if (-not $path -or -not (Test-Path -LiteralPath $path)) { return "" }
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
    if (-not $icon) { return "" }
    $bitmap = $icon.ToBitmap()
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $stream.ToArray()
    $stream.Dispose()
    $bitmap.Dispose()
    $icon.Dispose()
    return "data:image/png;base64," + [Convert]::ToBase64String($bytes)
  } catch {
    return ""
  }
}
$roots = @()
if ($env:USERPROFILE) { $roots += (Join-Path $env:USERPROFILE 'Desktop') }
if ($env:APPDATA) { $roots += (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs') }
if ($env:PROGRAMDATA) { $roots += (Join-Path $env:PROGRAMDATA 'Microsoft\Windows\Start Menu\Programs') }
$shell = New-Object -ComObject WScript.Shell
$items = foreach ($root in $roots) {
  if (Test-Path -LiteralPath $root) {
    Get-ChildItem -LiteralPath $root -Filter *.lnk -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $shortcut = $shell.CreateShortcut($_.FullName)
        $iconSource = [string]$shortcut.TargetPath
        if (-not $iconSource -or -not (Test-Path -LiteralPath $iconSource)) { $iconSource = $_.FullName }
        [pscustomobject]@{
          Title = $_.BaseName
          Shortcut = $_.FullName
          TargetPath = [string]$shortcut.TargetPath
          Arguments = [string]$shortcut.Arguments
          WorkingDirectory = [string]$shortcut.WorkingDirectory
          IconLocation = [string]$shortcut.IconLocation
          IconBase64 = (Get-IconData $iconSource)
        }
      } catch {}
    }
  }
}
@($items) | ConvertTo-Json -Depth 4
"#;

    let output = ProcessCommand::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script])
        .output()
        .map_err(|error| format!("Failed to run shortcut resolver: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "null" {
        return Ok(Vec::new());
    }

    let shortcuts: Vec<ShortcutInfo> =
        serde_json::from_str(&stdout).map_err(|error| format!("Failed to parse shortcut resolver output: {error}"))?;

    Ok(shortcuts
        .into_iter()
        .map(|shortcut| {
            let resolved = if shortcut.target_path.trim().is_empty() {
                shortcut.shortcut.clone()
            } else if shortcut.arguments.trim().is_empty() {
                shortcut.target_path.clone()
            } else {
                format!("{} {}", shortcut.target_path, shortcut.arguments)
            };
            OrbitItemInput {
                title: shortcut.title,
                subtitle: if resolved.trim().is_empty() { shortcut.shortcut.clone() } else { resolved },
                kind: "app".to_string(),
                group: "apps".to_string(),
                target: shortcut.shortcut,
                aliases: vec![shortcut.target_path, shortcut.working_directory]
                    .into_iter()
                    .filter(|value| !value.trim().is_empty())
                    .collect(),
                tags: vec!["shortcut".to_string(), "scan".to_string()],
                icon: if shortcut.icon_base64.trim().starts_with("data:image/") {
                    shortcut.icon_base64
                } else if shortcut.icon_location.trim().is_empty() {
                    "AppWindow".to_string()
                } else {
                    "ExternalLink".to_string()
                },
                accent: "#5cc8ff".to_string(),
                favorite: false,
            }
        })
        .collect())
}

#[tauri::command]
fn scan_shortcuts() -> Result<Vec<OrbitItem>, String> {
    let mut found = scan_shortcuts_with_powershell().unwrap_or_else(|_| {
        let mut fallback = Vec::new();
        for root in shortcut_roots() {
            scan_dir_for_shortcuts(&root, &mut fallback);
        }
        fallback
    });
    found.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));

    let conn = open_db()?;
    for input in found {
        let _ = upsert_scanned_item(&conn, &input);
    }
    log_plugin_event(&conn, "core-shortcuts", "info", "Shortcut scan completed")?;
    all_items(&conn)
}

fn bookmark_files() -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let base = PathBuf::from(local);
        files.push(base.join("Microsoft\\Edge\\User Data\\Default\\Bookmarks"));
        files.push(base.join("Google\\Chrome\\User Data\\Default\\Bookmarks"));
    }
    files
}

fn collect_bookmarks(node: &serde_json::Value, out: &mut Vec<OrbitItemInput>) {
    if let Some(url) = node.get("url").and_then(|value| value.as_str()) {
        let title = node
            .get("name")
            .and_then(|value| value.as_str())
            .filter(|name| !name.trim().is_empty())
            .unwrap_or(url);
        out.push(OrbitItemInput {
            title: title.to_string(),
            subtitle: url.to_string(),
            kind: "website".to_string(),
            group: "web".to_string(),
            target: url.to_string(),
            aliases: vec![title.to_string()],
            tags: vec!["bookmark".to_string(), "browser".to_string()],
            icon: "Globe".to_string(),
            accent: "#37d6bf".to_string(),
            favorite: false,
        });
    }

    if let Some(children) = node.get("children").and_then(|value| value.as_array()) {
        for child in children {
            collect_bookmarks(child, out);
        }
    }
}

#[tauri::command]
fn scan_browser_bookmarks() -> Result<Vec<OrbitItem>, String> {
    let conn = open_db()?;
    let mut found = Vec::new();
    for path in bookmark_files() {
        if !path.is_file() {
            continue;
        }
        let text = fs::read_to_string(path).unwrap_or_default();
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(roots) = value.get("roots").and_then(|roots| roots.as_object()) {
                for root in roots.values() {
                    collect_bookmarks(root, &mut found);
                }
            }
        }
    }

    for input in found {
        let _ = upsert_scanned_item(&conn, &input);
    }
    log_plugin_event(&conn, "core-bookmarks", "info", "Browser bookmark import completed")?;
    all_items(&conn)
}

#[tauri::command]
fn set_plugin_enabled(app: tauri::AppHandle, id: String, enabled: bool) -> Result<CatalogSnapshot, String> {
    let conn = open_db()?;
    conn.execute(
        "UPDATE plugin_states SET enabled = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, if enabled { 1 } else { 0 }, now_string()],
    )
    .map_err(|error| format!("Failed to update plugin state: {error}"))?;
    log_plugin_event(&conn, &id, "info", if enabled { "Plugin enabled" } else { "Plugin disabled" })?;
    let _ = app.emit("orbit://refresh-resources", ());
    catalog_snapshot()
}

#[tauri::command]
fn set_active_theme(app: tauri::AppHandle, theme_id: String) -> Result<CatalogSnapshot, String> {
    let conn = open_db()?;
    set_setting_value(&conn, "active_theme_id", &theme_id)?;
    log_plugin_event(&conn, "core-themes", "info", &format!("Theme changed to {theme_id}"))?;
    let _ = app.emit("orbit://refresh-resources", ());
    catalog_snapshot()
}

#[tauri::command]
fn set_density(app: tauri::AppHandle, density: String) -> Result<CatalogSnapshot, String> {
    let conn = open_db()?;
    set_setting_value(&conn, "density", &density)?;
    let _ = app.emit("orbit://refresh-resources", ());
    catalog_snapshot()
}

#[tauri::command]
fn set_close_behavior(app: tauri::AppHandle, behavior: String) -> Result<CatalogSnapshot, String> {
    let normalized = if behavior == "exit" { "exit" } else { "tray" };
    let conn = open_db()?;
    set_setting_value(&conn, "close_behavior", normalized)?;
    let _ = app.emit("orbit://refresh-resources", ());
    catalog_snapshot()
}

#[tauri::command]
fn set_safe_mode(app: tauri::AppHandle, enabled: bool) -> Result<CatalogSnapshot, String> {
    let conn = open_db()?;
    set_setting_value(&conn, "safe_mode", if enabled { "true" } else { "false" })?;
    log_plugin_event(&conn, "core-plugin-dev", "warn", if enabled { "Safe mode enabled" } else { "Safe mode disabled" })?;
    let _ = app.emit("orbit://refresh-resources", ());
    catalog_snapshot()
}

#[tauri::command]
fn export_catalog_json() -> Result<ExportResult, String> {
    let conn = open_db()?;
    let export = CatalogExport {
        version: 2,
        exported_at: now_string(),
        items: all_items(&conn)?,
        plugins: all_plugins(&conn)?,
        active_theme_id: Some(setting(&conn, "active_theme_id", "local-galaxy")?),
    };
    let json = serde_json::to_string_pretty(&export)
        .map_err(|error| format!("Failed to serialize export: {error}"))?;
    let backup_dir = app_data_dir()?.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|error| format!("Failed to create backup directory: {error}"))?;
    let path = backup_dir.join(format!("orbitstart-export-{}.json", export.exported_at));
    fs::write(&path, &json).map_err(|error| format!("Failed to write export: {error}"))?;
    Ok(ExportResult {
        path: path.to_string_lossy().to_string(),
        json,
    })
}

#[tauri::command]
fn import_catalog_json(app: tauri::AppHandle, json: String) -> Result<Vec<OrbitItem>, String> {
    let export: CatalogExport =
        serde_json::from_str(&json).map_err(|error| format!("Invalid import JSON: {error}"))?;
    let conn = open_db()?;
    for item in export.items {
        let input = OrbitItemInput {
            title: item.title,
            subtitle: item.subtitle,
            kind: item.kind,
            group: item.group,
            target: item.target,
            aliases: item.aliases,
            tags: item.tags,
            icon: item.icon,
            accent: item.accent,
            favorite: item.favorite,
        };
        let _ = insert_item(&conn, &input);
    }
    if let Some(theme_id) = export.active_theme_id {
        let _ = set_setting_value(&conn, "active_theme_id", &theme_id);
    }
    log_plugin_event(&conn, "core-backup", "info", "Catalog import completed")?;
    let _ = app.emit("orbit://refresh-resources", ());
    all_items(&conn)
}

fn ensure_local_templates() -> Result<(), String> {
    let plugin_root = plugins_dir()?.join("hello-command");
    if !plugin_root.exists() {
        fs::create_dir_all(&plugin_root).map_err(|error| format!("Failed to create hello plugin: {error}"))?;
        fs::write(plugin_root.join("plugin.json"), hello_plugin_manifest())
            .map_err(|error| format!("Failed to write hello plugin manifest: {error}"))?;
        fs::write(plugin_root.join("main.ts"), hello_plugin_source())
            .map_err(|error| format!("Failed to write hello plugin source: {error}"))?;
        fs::write(plugin_root.join("README.md"), hello_plugin_readme())
            .map_err(|error| format!("Failed to write hello plugin README: {error}"))?;
    }

    let theme_root = themes_dir()?.join("aurora-focus");
    if !theme_root.exists() {
        fs::create_dir_all(&theme_root).map_err(|error| format!("Failed to create sample theme: {error}"))?;
        fs::write(theme_root.join("theme.json"), sample_theme_manifest())
            .map_err(|error| format!("Failed to write sample theme: {error}"))?;
        fs::write(theme_root.join("theme.css"), sample_theme_css())
            .map_err(|error| format!("Failed to write sample theme CSS: {error}"))?;
    }
    Ok(())
}

fn hello_plugin_manifest() -> &'static str {
    r#"{
  "id": "hello-command",
  "name": "Hello Command",
  "version": "0.1.0",
  "description": "Minimal local OrbitStart command plugin template.",
  "enabled": true,
  "builtin": false,
  "permissions": [
    { "id": "ui:toast", "label": "Show toast messages", "risk": "low" }
  ],
  "contributes": { "commands": 1, "searchProviders": 1, "themes": 0, "views": 0 }
}
"#
}

fn hello_plugin_source() -> &'static str {
    r#"import type { OrbitPlugin } from "./orbitstart-plugin-api";

const plugin: OrbitPlugin = {
  activate(ctx) {
    ctx.commands.registerCommand({
      id: "hello-command.sayHello",
      title: "Hello from local plugin",
      subtitle: "This is the smallest useful OrbitStart plugin.",
      icon: "Sparkles",
      keywords: ["hello", "demo"],
      run: () => ctx.ui.toast("Hello from a local plugin")
    });
  }
};

export default plugin;
"#
}

fn hello_plugin_readme() -> &'static str {
    r#"# Hello Command

This template is intentionally small. Edit `plugin.json`, implement `main.ts`, then restart OrbitStart or refresh the plugin manager.

Common OrbitStart plugin APIs:

- `ctx.commands.registerCommand`
- `ctx.search.registerProvider`
- `ctx.ui.toast`
- `ctx.settings`
- `ctx.storage`
"#
}

fn sample_theme_manifest() -> &'static str {
    r##"{
  "id": "aurora-focus",
  "name": "Aurora Focus",
  "author": "OrbitStart",
  "description": "Grove: Dark forest green canvas with off-white typography and rust-red highlights.",
  "builtin": false,
  "tokens": {
    "--font-ui": "Inter, system-ui, sans-serif",
    "--font-body": "Inter, system-ui, sans-serif",
    "--font-title": "Georgia, \"Playfair Display\", serif",
    "--font-mono": "\"SF Mono\", ui-monospace, Menlo, monospace",
    "--bg": "#142319",
    "--bg-deep": "#0e1912",
    "--app-bg": "#142319",
    "--rail": "#0e1912",
    "--surface": "#1a2d20",
    "--surface-2": "#213928",
    "--surface-3": "#2a4833",
    "--surface-strong": "#1e3425",
    "--surface-soft": "rgba(230, 225, 213, 0.045)",
    "--field": "#18291d",
    "--field-strong": "#1e3425",
    "--line": "rgba(230, 225, 213, 0.12)",
    "--line-strong": "rgba(230, 225, 213, 0.2)",
    "--line-focus": "#bf4f36",
    "--text": "#ece8dd",
    "--soft": "#c2beaf",
    "--muted": "#8e8a7c",
    "--accent": "#bf4f36",
    "--accent-2": "#e2be8a",
    "--accent-3": "#bf4f36",
    "--ok": "#5ca873",
    "--warning": "#cc893b",
    "--danger": "#bf4f36",
    "--radius-sm": "6px",
    "--radius": "12px",
    "--radius-md": "12px",
    "--radius-lg": "16px",
    "--shadow-card": "0 8px 30px rgba(0, 0, 0, 0.3)",
    "--shadow-elevated": "0 20px 60px rgba(0, 0, 0, 0.5)",
    "--focus-ring": "0 0 0 3px rgba(191, 79, 54, 0.25)"
  }
}
"##
}

fn sample_theme_css() -> &'static str {
    r#"/* Optional CSS for future theme packages. OrbitStart currently reads theme.json tokens. */
"#
}

#[tauri::command]
fn create_plugin_template(name: String) -> Result<String, String> {
    let slug = name
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let slug = if slug.is_empty() { "orbit-plugin".to_string() } else { slug };
    let path = plugins_dir()?.join(&slug);
    fs::create_dir_all(&path).map_err(|error| format!("Failed to create plugin template: {error}"))?;
    let manifest = hello_plugin_manifest().replace("hello-command", &slug).replace("Hello Command", &name);
    fs::write(path.join("plugin.json"), manifest).map_err(|error| format!("Failed to write plugin manifest: {error}"))?;
    fs::write(path.join("main.ts"), hello_plugin_source()).map_err(|error| format!("Failed to write plugin source: {error}"))?;
    fs::write(path.join("README.md"), hello_plugin_readme()).map_err(|error| format!("Failed to write plugin README: {error}"))?;

    let conn = open_db()?;
    log_plugin_event(&conn, "core-plugin-dev", "info", &format!("Created plugin template {slug}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_data_directory() -> Result<String, String> {
    let path = app_data_dir()?.to_string_lossy().to_string();
    launch_target(path.clone())?;
    Ok(path)
}

#[tauri::command]
async fn open_aux_window(app: tauri::AppHandle, panel: String) -> Result<(), String> {
    let (label, title, width, height) = match panel.as_str() {
        "plugins" => ("plugins", "OrbitStart - Plugins", 980.0, 720.0),
        "themes" => ("themes", "OrbitStart - Themes", 980.0, 720.0),
        "about" => ("about", "About OrbitStart", 720.0, 560.0),
        _ => ("settings", "OrbitStart - Settings", 960.0, 700.0),
    };

    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let url = WebviewUrl::App("index.html".into());
    WebviewWindowBuilder::new(&app, label, url)
        .title(title)
        .inner_size(width, height)
        .min_inner_size(680.0, 520.0)
        .decorations(false)
        .resizable(true)
        .center()
        .build()
        .map_err(|error| format!("Failed to open {label} window: {error}"))?;
    Ok(())
}

#[cfg(desktop)]
fn show_and_focus_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit("orbit://focus-search", ());
    }
}

#[cfg(desktop)]
fn emit_main(app: &tauri::AppHandle, event: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(event, ());
    } else {
        let _ = app.emit(event, ());
    }
}

#[cfg(desktop)]
fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

#[cfg(desktop)]
fn handle_main_window_close(window: &tauri::Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    api.prevent_close();
    let behavior = open_db()
        .and_then(|conn| setting(&conn, "close_behavior", "tray"))
        .unwrap_or_else(|_| "tray".to_string());
    if behavior == "exit" {
        window.app_handle().exit(0);
    } else {
        let _ = window.hide();
    }
}

#[cfg(desktop)]
fn setup_global_shortcut(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_shortcut("ctrl+alt+space")?
            .with_handler(|app, shortcut, event| {
                if event.state == ShortcutState::Pressed
                    && shortcut.matches(Modifiers::CONTROL | Modifiers::ALT, Code::Space)
                {
                    show_and_focus_main(app);
                }
            })
            .build(),
    )?;
    Ok(())
}

#[cfg(desktop)]
fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = MenuBuilder::new(app)
        .text("show", "Show / Hide OrbitStart")
        .text("settings", "Open Settings")
        .text("refresh", "Refresh Resource Index")
        .text("safe-mode", "Toggle Safe Mode")
        .separator()
        .text("data", "Open Data Directory")
        .separator()
        .text("quit", "Quit")
        .build()?;

    let mut builder = TrayIconBuilder::with_id("orbitstart")
        .tooltip("OrbitStart")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

pub fn run() {
    let builder = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            catalog_snapshot,
            create_item,
            create_items_from_paths,
            pick_resource_input,
            pick_icon_image,
            create_group,
            update_item,
            delete_item,
            launch_item,
            launch_target,
            reveal_target,
            scan_shortcuts,
            scan_browser_bookmarks,
            set_plugin_enabled,
            set_active_theme,
            set_density,
            set_close_behavior,
            set_safe_mode,
            export_catalog_json,
            import_catalog_json,
            create_plugin_template,
            open_data_directory,
            open_aux_window
        ])
        .setup(|app| {
            let _ = open_db();
            #[cfg(desktop)]
            setup_global_shortcut(app)?;
            #[cfg(desktop)]
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            handle_main_window_close(window, event);
        })
        .on_menu_event(|app, event| {
            if event.id() == "quit" {
                app.exit(0);
            } else if event.id() == "show" {
                toggle_main_window(app);
            } else if event.id() == "settings" {
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = open_aux_window(app_handle, "settings".to_string()).await;
                });
            } else if event.id() == "refresh" {
                emit_main(app, "orbit://refresh-resources");
            } else if event.id() == "safe-mode" {
                emit_main(app, "orbit://toggle-safe-mode");
            } else if event.id() == "data" {
                let _ = open_data_directory();
            }
        });

    builder
        .run(tauri::generate_context!())
        .expect("failed to run OrbitStart");
}

fn main() {
    run();
}
