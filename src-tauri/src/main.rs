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
use tauri_plugin_global_shortcut::ShortcutState;

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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginRuntimeSource {
    id: String,
    entry: String,
    source: String,
    permissions: Vec<String>,
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
    trips: Vec<Trip>,
    #[serde(default)]
    plugins: Vec<PluginManifest>,
    #[serde(default)]
    active_theme_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trip {
    id: String,
    item_id: String,
    title: String,
    content: String,
    category: String,
    status: Option<String>,
    tags: Vec<String>,
    pinned: bool,
    created_at: i64,
    updated_at: i64,
    last_viewed_at: Option<i64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TripSearchResult {
    trip: Trip,
    item_id: String,
    item_title: String,
    item_icon: String,
    item_kind: String,
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

fn now_i64() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

fn app_data_dir() -> Result<PathBuf, String> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let path = base.join("OrbitStart");
    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create data directory: {error}"))?;
    Ok(path)
}

fn plugins_dir() -> Result<PathBuf, String> {
    let path = app_data_dir()?.join("plugins");
    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create plugin directory: {error}"))?;
    Ok(path)
}

fn themes_dir() -> Result<PathBuf, String> {
    let path = app_data_dir()?.join("themes");
    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create theme directory: {error}"))?;
    Ok(path)
}

fn db_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("orbit.db"))
}

fn open_db() -> Result<Connection, String> {
    let conn = Connection::open(db_path()?)
        .map_err(|error| format!("Failed to open database: {error}"))?;
    // 设置 5 秒的繁忙超时，防止多线程同时访问数据库时抛出 "database is locked" 错误
    let _ = conn.busy_timeout(std::time::Duration::from_secs(5));
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

        CREATE TABLE IF NOT EXISTS trips (
            id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'note',
            status TEXT,
            tags TEXT NOT NULL DEFAULT '[]',
            pinned INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            last_viewed_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_trips_item_id ON trips(item_id);
        CREATE INDEX IF NOT EXISTS idx_trips_updated_at ON trips(updated_at DESC);
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
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
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
            target: "C:\\Windows\\System32\\notepad.exe\nhttps://github.com\nE:\\OrbitStart"
                .to_string(),
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
        OrbitGroup {
            id: "all".to_string(),
            title: "全部".to_string(),
            icon: "Orbit".to_string(),
            description: "所有资源".to_string(),
            custom: false,
        },
        OrbitGroup {
            id: "apps".to_string(),
            title: "应用".to_string(),
            icon: "AppWindow".to_string(),
            description: "程序和快捷方式".to_string(),
            custom: false,
        },
        OrbitGroup {
            id: "work".to_string(),
            title: "工作区".to_string(),
            icon: "PanelsTopLeft".to_string(),
            description: "项目和动作链".to_string(),
            custom: false,
        },
        OrbitGroup {
            id: "web".to_string(),
            title: "网址".to_string(),
            icon: "Globe".to_string(),
            description: "网站、书签和在线控制台".to_string(),
            custom: false,
        },
        OrbitGroup {
            id: "scripts".to_string(),
            title: "脚本".to_string(),
            icon: "TerminalSquare".to_string(),
            description: "脚本和自动化入口".to_string(),
            custom: false,
        },
        OrbitGroup {
            id: "plugins".to_string(),
            title: "插件".to_string(),
            icon: "Blocks".to_string(),
            description: "插件提供的资源".to_string(),
            custom: false,
        },
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
    PluginPermission {
        id: id.to_string(),
        label: label.to_string(),
        risk: risk.to_string(),
    }
}

fn contributes(commands: u32, search_providers: u32, themes: u32, views: u32) -> PluginContributes {
    PluginContributes {
        commands,
        search_providers,
        themes,
        views,
    }
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
        version: "0.5.0".to_string(),
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
            vec![permission(
                "fs:read-browser",
                "读取本机浏览器书签文件",
                "medium",
            )],
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
            params![
                plugin.id,
                if plugin.enabled { 1 } else { 0 },
                manifest_json,
                now
            ],
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
                let _ = log_plugin_event_raw(
                    "plugin-loader",
                    "error",
                    &format!("Invalid plugin manifest {}: {error}", path.display()),
                );
            }
        }
    }
    Ok(manifests)
}

fn validated_plugin_id(id: &str) -> Result<String, String> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err("Plugin id cannot be empty".to_string());
    }
    if trimmed.contains("..")
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
    {
        return Err(format!("Invalid plugin id: {trimmed}"));
    }
    Ok(trimmed.to_string())
}

fn local_plugin_dir(plugin_id: &str) -> Result<Option<PathBuf>, String> {
    let plugin_id = validated_plugin_id(plugin_id)?;
    let root = plugins_dir()?;
    let dir = root.join(plugin_id);
    if !dir.exists() {
        return Ok(None);
    }

    let root_canonical = fs::canonicalize(&root)
        .map_err(|error| format!("Failed to resolve plugin root: {error}"))?;
    let dir_canonical = fs::canonicalize(&dir)
        .map_err(|error| format!("Failed to resolve plugin directory: {error}"))?;
    if !dir_canonical.starts_with(root_canonical) {
        return Err("Plugin directory is outside the OrbitStart plugin root".to_string());
    }
    Ok(Some(dir_canonical))
}

#[tauri::command]
fn read_plugin_runtime(id: String) -> Result<Option<PluginRuntimeSource>, String> {
    let requested_id = validated_plugin_id(&id)?;
    let Some(dir) = local_plugin_dir(&id)? else {
        return Ok(None);
    };

    let manifest_path = dir.join("plugin.json");
    let manifest_text = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Failed to read plugin manifest: {error}"))?;
    let manifest: PluginManifest = serde_json::from_str(&manifest_text)
        .map_err(|error| format!("Invalid plugin manifest: {error}"))?;
    let plugin_id = validated_plugin_id(&manifest.id)?;
    if plugin_id != requested_id {
        return Err(format!(
            "Plugin manifest id mismatch: requested {requested_id}, found {plugin_id}"
        ));
    }

    let entries = [("main.js", dir.join("main.js")), ("main.ts", dir.join("main.ts"))];
    let Some((entry, path)) = entries.iter().find(|(_, path)| path.is_file()) else {
        return Ok(None);
    };
    let size = fs::metadata(path)
        .map_err(|error| format!("Failed to inspect plugin runtime: {error}"))?
        .len();
    if size > 256 * 1024 {
        return Err(format!(
            "Plugin runtime {entry} is too large ({size} bytes, max 262144)"
        ));
    }
    let source = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read plugin runtime source: {error}"))?;
    Ok(Some(PluginRuntimeSource {
        id: plugin_id,
        entry: entry.to_string(),
        source,
        permissions: manifest
            .permissions
            .iter()
            .map(|permission| permission.id.clone())
            .collect(),
    }))
}

#[tauri::command]
fn record_plugin_runtime_event(plugin_id: String, level: String, message: String) -> Result<(), String> {
    let conn = open_db()?;
    let plugin_id = validated_plugin_id(&plugin_id).unwrap_or_else(|_| "plugin-runtime".to_string());
    let level = match level.as_str() {
        "info" | "warn" | "error" => level,
        _ => "info".to_string(),
    };
    let message = if message.chars().count() > 1000 {
        format!("{}...", message.chars().take(1000).collect::<String>())
    } else {
        message
    };
    log_plugin_event(&conn, &plugin_id, &level, &message)
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
    plugins
        .iter()
        .any(|plugin| plugin.id == id && plugin.enabled)
}

fn default_commands(plugins: &[PluginManifest]) -> Vec<OrbitCommand> {
    let mut commands = Vec::new();
    let mut push =
        |plugin_id: &str, id: &str, title: &str, subtitle: &str, icon: &str, keywords: &[&str]| {
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

    push(
        "core-items",
        "core.addItem",
        "添加资源",
        "添加应用、文件、文件夹、网址、脚本或动作链",
        "PlusCircle",
        &["add", "new", "import"],
    );
    push(
        "core-actions",
        "core.addActionChain",
        "新建动作链",
        "用多行目标创建一个工作区启动链",
        "Workflow",
        &["chain", "workspace", "automation"],
    );
    push(
        "core-shortcuts",
        "core.scanShortcuts",
        "扫描桌面和开始菜单",
        "导入 Windows .lnk 快捷方式",
        "ScanSearch",
        &["scan", "shortcut"],
    );
    push(
        "core-bookmarks",
        "core.scanBookmarks",
        "导入浏览器书签",
        "扫描 Edge 和 Chrome 书签",
        "Bookmark",
        &["bookmark", "browser", "edge", "chrome"],
    );
    push(
        "core-backup",
        "core.exportJson",
        "导出 JSON",
        "导出本地资源、插件状态和主题设置",
        "Download",
        &["export", "backup"],
    );
    push(
        "core-themes",
        "core.themeStudio",
        "打开主题工作室",
        "选择主题并实时预览变量",
        "Palette",
        &["theme", "style"],
    );
    push(
        "core-plugin-dev",
        "core.createPluginTemplate",
        "创建插件模板",
        "在本地插件目录生成 Hello Command 模板",
        "FileCode2",
        &["plugin", "template", "sdk"],
    );
    push(
        "core-plugin-dev",
        "core.openDataDir",
        "打开数据目录",
        "查看数据库、插件、主题和备份文件",
        "FolderOpen",
        &["data", "plugins", "themes"],
    );
    push(
        "core-command-palette",
        "core.commandPalette",
        "打开命令面板",
        "统一搜索资源、命令和插件结果",
        "Search",
        &["search", "command"],
    );
    commands
}

fn default_theme(
    id: &str,
    name: &str,
    author: &str,
    description: &str,
    tokens: &[(&str, &str)],
) -> ThemeManifest {
    ThemeManifest {
        id: id.to_string(),
        name: name.to_string(),
        author: author.to_string(),
        description: description.to_string(),
        builtin: true,
        tokens: tokens
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect(),
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
            "atelier-charcoal",
            "Atelier Charcoal",
            "OrbitStart",
            "Elegant graphite and charcoal-toned grey theme.",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-body", "Inter, system-ui, sans-serif"),
                ("--font-title", "Georgia, \"Times New Roman\", serif"),
                ("--font-mono", "\"SF Mono\", ui-monospace, Menlo, monospace"),
                ("--bg-deep", "#eceff3"),
                ("--bg", "#eceff3"),
                ("--app-bg", "#eceff3"),
                ("--rail", "#eceff3"),
                ("--surface", "#f5f7fa"),
                ("--surface-2", "#e2e8f0"),
                ("--surface-3", "#cbd5e1"),
                ("--surface-strong", "#ffffff"),
                ("--surface-soft", "#e2e8f0"),
                ("--field", "#ffffff"),
                ("--field-strong", "#ffffff"),
                ("--line", "#e2e8f0"),
                ("--line-strong", "#cbd5e1"),
                ("--line-focus", "#147d73"),
                ("--text", "#17191f"),
                ("--soft", "#475569"),
                ("--muted", "#64748b"),
                ("--accent", "#147d73"),
                ("--accent-2", "#b86b13"),
                ("--accent-3", "#c73f5c"),
                ("--ok", "#3d7f2e"),
                ("--warning", "#b86b13"),
                ("--danger", "#c73f5c"),
                ("--radius-sm", "10px"),
                ("--radius", "16px"),
                ("--radius-md", "16px"),
                ("--radius-lg", "24px"),
                ("--shadow-card", "none"),
                ("--shadow-elevated", "0 20px 52px rgba(23, 25, 31, 0.08)"),
                ("--focus-ring", "0 0 0 4px rgba(20, 125, 115, 0.2)"),
            ],
        ),
        default_theme(
            "atelier-mint",
            "Atelier Mint",
            "OrbitStart",
            "Quiet and refreshing mint-green editorial layout.",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-body", "Inter, system-ui, sans-serif"),
                ("--font-title", "Georgia, \"Times New Roman\", serif"),
                ("--font-mono", "\"SF Mono\", ui-monospace, Menlo, monospace"),
                ("--bg-deep", "#e3f8ec"),
                ("--bg", "#e3f8ec"),
                ("--app-bg", "#e3f8ec"),
                ("--rail", "#e3f8ec"),
                ("--surface", "#f2fcf7"),
                ("--surface-2", "#d1f2e1"),
                ("--surface-3", "#b4e3cb"),
                ("--surface-strong", "#ffffff"),
                ("--surface-soft", "#d1f2e1"),
                ("--field", "#f2fcf7"),
                ("--field-strong", "#ffffff"),
                ("--line", "#d1f2e1"),
                ("--line-strong", "#b4e3cb"),
                ("--line-focus", "#059669"),
                ("--text", "#102018"),
                ("--soft", "#2f4f3f"),
                ("--muted", "#507563"),
                ("--accent", "#059669"),
                ("--accent-2", "#a16207"),
                ("--accent-3", "#be3a58"),
                ("--ok", "#15803d"),
                ("--warning", "#a16207"),
                ("--danger", "#be3a58"),
                ("--radius-sm", "10px"),
                ("--radius", "16px"),
                ("--radius-md", "16px"),
                ("--radius-lg", "24px"),
                ("--shadow-card", "none"),
                ("--shadow-elevated", "0 20px 52px rgba(16, 32, 24, 0.08)"),
                ("--focus-ring", "0 0 0 4px rgba(5, 150, 105, 0.2)"),
            ],
        ),
        default_theme(
            "atelier-sky",
            "Atelier Sky",
            "OrbitStart",
            "Crisp and clear paper-sky blue layout.",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-body", "Inter, system-ui, sans-serif"),
                ("--font-title", "Georgia, \"Times New Roman\", serif"),
                ("--font-mono", "\"SF Mono\", ui-monospace, Menlo, monospace"),
                ("--bg-deep", "#dff2ff"),
                ("--bg", "#dff2ff"),
                ("--app-bg", "#dff2ff"),
                ("--rail", "#dff2ff"),
                ("--surface", "#f0f8ff"),
                ("--surface-2", "#cde7fc"),
                ("--surface-3", "#b2dafa"),
                ("--surface-strong", "#ffffff"),
                ("--surface-soft", "#cde7fc"),
                ("--field", "#f0f8ff"),
                ("--field-strong", "#ffffff"),
                ("--line", "#cde7fc"),
                ("--line-strong", "#b2dafa"),
                ("--line-focus", "#0284c7"),
                ("--text", "#0f172a"),
                ("--soft", "#334155"),
                ("--muted", "#475569"),
                ("--accent", "#0284c7"),
                ("--accent-2", "#b7791f"),
                ("--accent-3", "#dc4766"),
                ("--ok", "#15803d"),
                ("--warning", "#b7791f"),
                ("--danger", "#dc4766"),
                ("--radius-sm", "10px"),
                ("--radius", "16px"),
                ("--radius-md", "16px"),
                ("--radius-lg", "24px"),
                ("--shadow-card", "none"),
                ("--shadow-elevated", "0 20px 52px rgba(15, 23, 42, 0.08)"),
                ("--focus-ring", "0 0 0 4px rgba(2, 132, 199, 0.2)"),
            ],
        ),
        default_theme(
            "atelier-pink",
            "Atelier Pink",
            "OrbitStart",
            "Warm soft pinkish paper with rose-terracotta highlights.",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-body", "Inter, system-ui, sans-serif"),
                ("--font-title", "Georgia, \"Times New Roman\", serif"),
                ("--font-mono", "\"SF Mono\", ui-monospace, Menlo, monospace"),
                ("--bg-deep", "#fcf5f7"),
                ("--bg", "#fcf5f7"),
                ("--app-bg", "#fcf5f7"),
                ("--rail", "#fcf5f7"),
                ("--surface", "#fff9fb"),
                ("--surface-2", "#f2e1e5"),
                ("--surface-3", "#e6cbd0"),
                ("--surface-strong", "#ffffff"),
                ("--surface-soft", "#f0e2e5"),
                ("--field", "#fff9fb"),
                ("--field-strong", "#ffffff"),
                ("--line", "#f0e2e5"),
                ("--line-strong", "#e6cbd0"),
                ("--line-focus", "#c45873"),
                ("--text", "#2b1b20"),
                ("--soft", "#574046"),
                ("--muted", "#826b71"),
                ("--accent", "#c45873"),
                ("--accent-2", "#3c645c"),
                ("--accent-3", "#b53d3d"),
                ("--ok", "#4fa375"),
                ("--warning", "#cc8e35"),
                ("--danger", "#b53d3d"),
                ("--radius-sm", "10px"),
                ("--radius", "16px"),
                ("--radius-md", "16px"),
                ("--radius-lg", "24px"),
                ("--shadow-card", "none"),
                ("--shadow-elevated", "0 20px 52px rgba(43, 27, 32, 0.08)"),
                ("--focus-ring", "0 0 0 4px rgba(196, 88, 115, 0.24)"),
            ],
        ),
        default_theme(
            "atelier-grey",
            "Atelier Grey",
            "OrbitStart",
            "Quiet cool card grey with deep graphite highlights.",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-body", "Inter, system-ui, sans-serif"),
                ("--font-title", "Georgia, \"Times New Roman\", serif"),
                ("--font-mono", "\"SF Mono\", ui-monospace, Menlo, monospace"),
                ("--bg-deep", "#f1f3f5"),
                ("--bg", "#f1f3f5"),
                ("--app-bg", "#f1f3f5"),
                ("--rail", "#f1f3f5"),
                ("--surface", "#fafbfc"),
                ("--surface-2", "#e9ecef"),
                ("--surface-3", "#dee2e6"),
                ("--surface-strong", "#ffffff"),
                ("--surface-soft", "#e9ecef"),
                ("--field", "#fafbfc"),
                ("--field-strong", "#ffffff"),
                ("--line", "#e9ecef"),
                ("--line-strong", "#dee2e6"),
                ("--line-focus", "#495057"),
                ("--text", "#212529"),
                ("--soft", "#495057"),
                ("--muted", "#6c757d"),
                ("--accent", "#495057"),
                ("--accent-2", "#1e3a8a"),
                ("--accent-3", "#991b1b"),
                ("--ok", "#16a34a"),
                ("--warning", "#d97706"),
                ("--danger", "#dc2626"),
                ("--radius-sm", "10px"),
                ("--radius", "16px"),
                ("--radius-md", "16px"),
                ("--radius-lg", "24px"),
                ("--shadow-card", "none"),
                ("--shadow-elevated", "0 20px 52px rgba(33, 37, 41, 0.08)"),
                ("--focus-ring", "0 0 0 4px rgba(73, 80, 87, 0.24)"),
            ],
        ),
        default_theme(
            "atelier-lavender",
            "Atelier Lavender",
            "OrbitStart",
            "Gentle pale lavender card paper with wisteria-purple accents.",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-body", "Inter, system-ui, sans-serif"),
                ("--font-title", "Georgia, \"Times New Roman\", serif"),
                ("--font-mono", "\"SF Mono\", ui-monospace, Menlo, monospace"),
                ("--bg-deep", "#f5f3f9"),
                ("--bg", "#f5f3f9"),
                ("--app-bg", "#f5f3f9"),
                ("--rail", "#f5f3f9"),
                ("--surface", "#fcfbfe"),
                ("--surface-2", "#e8e4f0"),
                ("--surface-3", "#dad2e6"),
                ("--surface-strong", "#ffffff"),
                ("--surface-soft", "#e8e4f0"),
                ("--field", "#fcfbfe"),
                ("--field-strong", "#ffffff"),
                ("--line", "#e8e4f0"),
                ("--line-strong", "#dad2e6"),
                ("--line-focus", "#6b5ea8"),
                ("--text", "#201c2b"),
                ("--soft", "#484257"),
                ("--muted", "#78718a"),
                ("--accent", "#6b5ea8"),
                ("--accent-2", "#2f5b4f"),
                ("--accent-3", "#a83e3e"),
                ("--ok", "#3b82f6"),
                ("--warning", "#f59e0b"),
                ("--danger", "#ef4444"),
                ("--radius-sm", "10px"),
                ("--radius", "16px"),
                ("--radius-md", "16px"),
                ("--radius-lg", "24px"),
                ("--shadow-card", "none"),
                ("--shadow-elevated", "0 20px 52px rgba(32, 28, 43, 0.08)"),
                ("--focus-ring", "0 0 0 4px rgba(107, 94, 168, 0.24)"),
            ],
        ),
        default_theme(
            "atelier-rust",
            "Atelier Rust",
            "OrbitStart",
            "Grove: Dark forest green canvas with warm rust-red highlights.",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-body", "Inter, system-ui, sans-serif"),
                ("--font-title", "Georgia, \"Times New Roman\", serif"),
                ("--font-mono", "\"SF Mono\", ui-monospace, Menlo, monospace"),
                ("--bg-deep", "#0e1912"),
                ("--bg", "#142319"),
                ("--app-bg", "#142319"),
                ("--rail", "#0e1912"),
                ("--surface", "#1a2d20"),
                ("--surface-2", "#213928"),
                ("--surface-3", "#2a4833"),
                ("--surface-strong", "#1e3425"),
                ("--surface-soft", "rgba(230, 225, 213, 0.045)"),
                ("--field", "#18291d"),
                ("--field-strong", "#1e3425"),
                ("--line", "rgba(230, 225, 213, 0.12)"),
                ("--line-strong", "rgba(230, 225, 213, 0.2)"),
                ("--line-focus", "#bf4f36"),
                ("--text", "#ece8dd"),
                ("--soft", "#c2beaf"),
                ("--muted", "#8e8a7c"),
                ("--accent", "#bf4f36"),
                ("--accent-2", "#e2be8a"),
                ("--accent-3", "#bf4f36"),
                ("--ok", "#5ca873"),
                ("--warning", "#cc893b"),
                ("--danger", "#bf4f36"),
                ("--radius-sm", "10px"),
                ("--radius", "16px"),
                ("--radius-md", "16px"),
                ("--radius-lg", "24px"),
                ("--shadow-card", "none"),
                ("--shadow-elevated", "0 20px 52px rgba(0, 0, 0, 0.45)"),
                ("--focus-ring", "0 0 0 4px rgba(191, 79, 54, 0.24)"),
            ],
        ),
        default_theme(
            "atelier-coal",
            "Atelier Coal",
            "OrbitStart",
            "Obsidian: Dark charcoal space with radiant gold-orange highlights.",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-body", "Inter, system-ui, sans-serif"),
                ("--font-title", "Georgia, \"Times New Roman\", serif"),
                ("--font-mono", "\"SF Mono\", ui-monospace, Menlo, monospace"),
                ("--bg-deep", "#121214"),
                ("--bg", "#161619"),
                ("--app-bg", "#161619"),
                ("--rail", "#121214"),
                ("--surface", "#1e1e22"),
                ("--surface-2", "#2a2a2f"),
                ("--surface-3", "#3a3a41"),
                ("--surface-strong", "#25252a"),
                ("--surface-soft", "rgba(255, 255, 255, 0.045)"),
                ("--field", "#1a1a1e"),
                ("--field-strong", "#25252a"),
                ("--line", "#2a2a2f"),
                ("--line-strong", "#3a3a41"),
                ("--line-focus", "#e0533c"),
                ("--text", "#e5e5e7"),
                ("--soft", "#b2b2b6"),
                ("--muted", "#7e7e82"),
                ("--accent", "#e0533c"),
                ("--accent-2", "#e2be8a"),
                ("--accent-3", "#bf4f36"),
                ("--ok", "#5ca873"),
                ("--warning", "#cc893b"),
                ("--danger", "#bf4f36"),
                ("--radius-sm", "10px"),
                ("--radius", "16px"),
                ("--radius-md", "16px"),
                ("--radius-lg", "24px"),
                ("--shadow-card", "none"),
                ("--shadow-elevated", "0 20px 52px rgba(0, 0, 0, 0.5)"),
                ("--focus-ring", "0 0 0 4px rgba(224, 83, 60, 0.24)"),
            ],
        ),
        default_theme(
            "atelier-abyss",
            "Atelier Abyss",
            "OrbitStart",
            "Abyss: Deep oceanic indigo with high-contrast sky-blue accents.",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-body", "Inter, system-ui, sans-serif"),
                ("--font-title", "Georgia, \"Times New Roman\", serif"),
                ("--font-mono", "\"SF Mono\", ui-monospace, Menlo, monospace"),
                ("--bg-deep", "#0a0d14"),
                ("--bg", "#0f131a"),
                ("--app-bg", "#0f131a"),
                ("--rail", "#0a0d14"),
                ("--surface", "#161b24"),
                ("--surface-2", "#222935"),
                ("--surface-3", "#323b49"),
                ("--surface-strong", "#1b222f"),
                ("--surface-soft", "rgba(255, 255, 255, 0.04)"),
                ("--field", "#121721"),
                ("--field-strong", "#1b222f"),
                ("--line", "#222935"),
                ("--line-strong", "#323b49"),
                ("--line-focus", "#38bdf8"),
                ("--text", "#e2e8f0"),
                ("--soft", "#94a3b8"),
                ("--muted", "#64748b"),
                ("--accent", "#38bdf8"),
                ("--accent-2", "#34d399"),
                ("--accent-3", "#f87171"),
                ("--ok", "#34d399"),
                ("--warning", "#fbbf24"),
                ("--danger", "#f87171"),
                ("--radius-sm", "10px"),
                ("--radius", "16px"),
                ("--radius-md", "16px"),
                ("--radius-lg", "24px"),
                ("--shadow-card", "none"),
                ("--shadow-elevated", "0 20px 52px rgba(0, 0, 0, 0.5)"),
                ("--focus-ring", "0 0 0 4px rgba(56, 189, 248, 0.24)"),
            ],
        ),
        default_theme(
            "atelier-amber",
            "Atelier Amber",
            "OrbitStart",
            "Amber: Cozy charcoal-tea brown with radiant golden highlights.",
            &[
                ("--font-ui", "Inter, system-ui, sans-serif"),
                ("--font-body", "Inter, system-ui, sans-serif"),
                ("--font-title", "Georgia, \"Times New Roman\", serif"),
                ("--font-mono", "\"SF Mono\", ui-monospace, Menlo, monospace"),
                ("--bg-deep", "#120e0a"),
                ("--bg", "#191410"),
                ("--app-bg", "#191410"),
                ("--rail", "#120e0a"),
                ("--surface", "#211b16"),
                ("--surface-2", "#2e2620"),
                ("--surface-3", "#3f352c"),
                ("--surface-strong", "#27201a"),
                ("--surface-soft", "rgba(255, 255, 255, 0.04)"),
                ("--field", "#1c1612"),
                ("--field-strong", "#27201a"),
                ("--line", "#2e2620"),
                ("--line-strong", "#3f352c"),
                ("--line-focus", "#f59e0b"),
                ("--text", "#f5f5f4"),
                ("--soft", "#d6d3d1"),
                ("--muted", "#a8a29e"),
                ("--accent", "#f59e0b"),
                ("--accent-2", "#10b981"),
                ("--accent-3", "#ef4444"),
                ("--ok", "#10b981"),
                ("--warning", "#f59e0b"),
                ("--danger", "#ef4444"),
                ("--radius-sm", "10px"),
                ("--radius", "16px"),
                ("--radius-md", "16px"),
                ("--radius-lg", "24px"),
                ("--shadow-card", "none"),
                ("--shadow-elevated", "0 20px 52px rgba(0, 0, 0, 0.5)"),
                ("--focus-ring", "0 0 0 4px rgba(245, 158, 11, 0.24)"),
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
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
$Path = '[PATH_PLACEHOLDER]'
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
        let escaped_path = path.to_string_lossy().to_string().replace("'", "''");
        let final_script = script.replace("[PATH_PLACEHOLDER]", &escaped_path);

        let mut cmd = ProcessCommand::new("powershell");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000);

        let output = cmd
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &final_script,
            ])
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
    let is_dir = fs::metadata(&path)
        .map(|metadata| metadata.is_dir())
        .unwrap_or(false);
    let title = display_title_from_path(&path);
    let icon_base64 = associated_icon_base64(&path);
    let path_string = path.to_string_lossy().to_string();

    let (kind, group, icon, accent, category_tag) = if is_dir {
        ("folder", "work", "FolderOpen", "#8bd450", "folder")
    } else if ["ps1", "bat", "cmd", "sh", "py", "js", "ts", "vbs", "ahk"]
        .contains(&extension.as_str())
    {
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

fn unique_strings(values: Vec<String>) -> Vec<String> {
    let mut result = Vec::new();
    for value in values {
        let clean = value.trim();
        if !clean.is_empty() && !result.iter().any(|existing: &String| existing == clean) {
            result.push(clean.to_string());
        }
    }
    result
}

fn split_group_ids(value: &str) -> Vec<String> {
    unique_strings(value.split(',').map(|part| part.to_string()).collect())
}

fn default_group_for_kind(kind: &str) -> &'static str {
    match kind {
        "app" => "apps",
        "website" => "web",
        "script" => "scripts",
        "file" | "folder" | "action_chain" => "work",
        _ => "work",
    }
}

fn normalize_group_value(value: &str, kind: &str) -> String {
    let groups = split_group_ids(value);
    if groups.is_empty() {
        default_group_for_kind(kind).to_string()
    } else {
        groups.join(",")
    }
}

fn merge_group_values(existing: &str, incoming: &str, kind: &str) -> String {
    let mut groups = split_group_ids(existing);
    groups.extend(split_group_ids(incoming));
    let groups = unique_strings(groups);
    if groups.is_empty() {
        default_group_for_kind(kind).to_string()
    } else {
        groups.join(",")
    }
}

fn merge_string_lists(existing: &[String], incoming: &[String]) -> Vec<String> {
    let mut values = existing.to_vec();
    values.extend(incoming.iter().cloned());
    unique_strings(values)
}

fn insert_item(conn: &Connection, input: &OrbitItemInput) -> Result<OrbitItem, String> {
    if let Some(existing) = get_item_by_target(conn, &input.target)? {
        return merge_existing_item(conn, &existing, input, false);
    }

    let id = make_id(&input.kind, &input.target);
    let now = now_string();
    let group = normalize_group_value(&input.group, &input.kind);
    conn.execute(
        r#"
        INSERT OR IGNORE INTO items (
            id, title, subtitle, kind, group_id, target, aliases_json, tags_json,
            icon, accent, favorite, launch_count, last_launched_at, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, NULL, ?12, ?12)
        "#,
        params![
            &id,
            input.title,
            input.subtitle,
            input.kind,
            group,
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
    if let Some(existing) = get_item_by_target(conn, &input.target)? {
        return merge_existing_item(conn, &existing, input, true);
    }

    let id = make_id(&input.kind, &input.target);
    let now = now_string();
    let group = normalize_group_value(&input.group, &input.kind);
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
            group_id = excluded.group_id,
            aliases_json = excluded.aliases_json,
            tags_json = excluded.tags_json,
            icon = excluded.icon,
            accent = excluded.accent,
            updated_at = excluded.updated_at
        "#,
        params![
            &id,
            input.title,
            input.subtitle,
            input.kind,
            group,
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

fn get_item_by_target(conn: &Connection, target: &str) -> Result<Option<OrbitItem>, String> {
    conn.query_row(
        r#"
        SELECT id, title, subtitle, kind, group_id, target, aliases_json, tags_json,
               icon, accent, favorite, launch_count, last_launched_at
        FROM items
        WHERE target = ?1
        "#,
        params![target],
        item_from_row,
    )
    .optional()
    .map_err(|error| format!("Failed to read item by target: {error}"))
}

fn merge_existing_item(
    conn: &Connection,
    existing: &OrbitItem,
    input: &OrbitItemInput,
    update_metadata: bool,
) -> Result<OrbitItem, String> {
    let now = now_string();
    let title = if update_metadata || existing.title.trim().is_empty() {
        input.title.clone()
    } else {
        existing.title.clone()
    };
    let subtitle = if update_metadata || existing.subtitle.trim().is_empty() {
        input.subtitle.clone()
    } else {
        existing.subtitle.clone()
    };
    let kind = if update_metadata {
        input.kind.clone()
    } else {
        existing.kind.clone()
    };
    let icon = if update_metadata || existing.icon.trim().is_empty() {
        input.icon.clone()
    } else {
        existing.icon.clone()
    };
    let accent = if update_metadata || existing.accent.trim().is_empty() {
        input.accent.clone()
    } else {
        existing.accent.clone()
    };
    let group = merge_group_values(&existing.group, &input.group, &kind);
    let aliases = merge_string_lists(&existing.aliases, &input.aliases);
    let tags = merge_string_lists(&existing.tags, &input.tags);
    let favorite = existing.favorite || input.favorite;

    conn.execute(
        r#"
        UPDATE items
        SET title = ?2,
            subtitle = ?3,
            kind = ?4,
            group_id = ?5,
            aliases_json = ?6,
            tags_json = ?7,
            icon = ?8,
            accent = ?9,
            favorite = ?10,
            updated_at = ?11
        WHERE id = ?1
        "#,
        params![
            &existing.id,
            title,
            subtitle,
            kind,
            group,
            serde_json::to_string(&aliases).unwrap_or_else(|_| "[]".to_string()),
            serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()),
            icon,
            accent,
            if favorite { 1 } else { 0 },
            now,
        ],
    )
    .map_err(|error| format!("Failed to merge existing item labels: {error}"))?;

    get_item(conn, &existing.id)?.ok_or_else(|| "Item not found after merge".to_string())
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

fn log_plugin_event(
    conn: &Connection,
    plugin_id: &str,
    level: &str,
    message: &str,
) -> Result<(), String> {
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

fn normalize_trip_category(category: &str) -> String {
    match category {
        "shortcut" | "workflow" | "note" | "status" | "reference" => category.to_string(),
        _ => "note".to_string(),
    }
}

fn normalize_trip_status(category: &str, status: Option<String>) -> Option<String> {
    if category != "status" {
        return None;
    }
    match status.as_deref() {
        Some("todo") | Some("in-progress") | Some("done") | Some("needs-update") => status,
        _ => Some("todo".to_string()),
    }
}

fn normalize_trip_tags(tags: Vec<String>) -> Vec<String> {
    unique_strings(
        tags.into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .take(12)
            .collect(),
    )
}

fn trip_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Trip> {
    let tags_json: String = row.get(6)?;
    let tags = serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default();
    Ok(Trip {
        id: row.get(0)?,
        item_id: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        category: row.get(4)?,
        status: row.get(5)?,
        tags,
        pinned: row.get::<_, i64>(7)? != 0,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        last_viewed_at: row.get(10)?,
    })
}

fn get_trip(conn: &Connection, id: &str) -> Result<Option<Trip>, String> {
    conn.query_row(
        r#"
        SELECT id, item_id, title, content, category, status, tags, pinned, created_at, updated_at, last_viewed_at
        FROM trips
        WHERE id = ?1
        "#,
        params![id],
        trip_from_row,
    )
    .optional()
    .map_err(|error| format!("Failed to read trip: {error}"))
}

fn all_trips(conn: &Connection) -> Result<Vec<Trip>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, item_id, title, content, category, status, tags, pinned, created_at, updated_at, last_viewed_at
            FROM trips
            ORDER BY pinned DESC, updated_at DESC
            "#,
        )
        .map_err(|error| format!("Failed to prepare trips query: {error}"))?;
    let rows = stmt
        .query_map([], trip_from_row)
        .map_err(|error| format!("Failed to query trips: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to map trips: {error}"))
}

#[tauri::command]
fn list_trips(item_id: String) -> Result<Vec<Trip>, String> {
    let conn = open_db()?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, item_id, title, content, category, status, tags, pinned, created_at, updated_at, last_viewed_at
            FROM trips
            WHERE item_id = ?1
            ORDER BY pinned DESC, updated_at DESC
            "#,
        )
        .map_err(|error| format!("Failed to prepare trip list: {error}"))?;
    let rows = stmt
        .query_map(params![item_id], trip_from_row)
        .map_err(|error| format!("Failed to list trips: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to map trips: {error}"))
}

#[tauri::command]
fn create_trip(
    app: tauri::AppHandle,
    item_id: String,
    title: String,
    content: String,
    category: String,
    status: Option<String>,
    tags: Vec<String>,
    pinned: Option<bool>,
) -> Result<Trip, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Trip title cannot be empty".to_string());
    }
    if title.chars().count() > 50 {
        return Err("Trip title is too long".to_string());
    }
    if content.chars().count() > 4000 {
        return Err("Trip content is too long".to_string());
    }

    let conn = open_db()?;
    let item = get_item(&conn, &item_id)?.ok_or_else(|| "Item not found".to_string())?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM trips WHERE item_id = ?1", params![item.id], |row| row.get(0))
        .map_err(|error| format!("Failed to count trips: {error}"))?;
    if count >= 50 {
        return Err("Each resource can have at most 50 trips".to_string());
    }

    let category = normalize_trip_category(&category);
    let status = normalize_trip_status(&category, status);
    let tags = normalize_trip_tags(tags);
    let now = now_i64();
    let id = make_id("trip", &format!("{item_id}:{title}:{now}"));
    conn.execute(
        r#"
        INSERT INTO trips (id, item_id, title, content, category, status, tags, pinned, created_at, updated_at, last_viewed_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, NULL)
        "#,
        params![
            id,
            item_id,
            title,
            content,
            category,
            status,
            serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()),
            if pinned.unwrap_or(false) { 1 } else { 0 },
            now,
        ],
    )
    .map_err(|error| format!("Failed to create trip: {error}"))?;
    log_plugin_event(&conn, "trips", "info", &format!("Trip created for {}", item.title))?;
    let _ = app.emit("orbit://trips-changed", ());
    get_trip(&conn, &id)?.ok_or_else(|| "Trip not found after create".to_string())
}

#[tauri::command]
fn update_trip(
    app: tauri::AppHandle,
    id: String,
    title: String,
    content: String,
    category: String,
    status: Option<String>,
    tags: Vec<String>,
    pinned: bool,
) -> Result<Trip, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Trip title cannot be empty".to_string());
    }
    if title.chars().count() > 50 {
        return Err("Trip title is too long".to_string());
    }
    if content.chars().count() > 4000 {
        return Err("Trip content is too long".to_string());
    }
    let conn = open_db()?;
    let category = normalize_trip_category(&category);
    let status = normalize_trip_status(&category, status);
    let tags = normalize_trip_tags(tags);
    let now = now_i64();
    conn.execute(
        r#"
        UPDATE trips
        SET title = ?2,
            content = ?3,
            category = ?4,
            status = ?5,
            tags = ?6,
            pinned = ?7,
            updated_at = ?8
        WHERE id = ?1
        "#,
        params![
            id,
            title,
            content,
            category,
            status,
            serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()),
            if pinned { 1 } else { 0 },
            now,
        ],
    )
    .map_err(|error| format!("Failed to update trip: {error}"))?;
    let _ = app.emit("orbit://trips-changed", ());
    get_trip(&conn, &id)?.ok_or_else(|| "Trip not found after update".to_string())
}

#[tauri::command]
fn mark_trip_viewed(id: String) -> Result<(), String> {
    let conn = open_db()?;
    conn.execute(
        "UPDATE trips SET last_viewed_at = ?2 WHERE id = ?1",
        params![&id, now_i64()],
    )
    .map_err(|error| format!("Failed to mark trip viewed: {error}"))?;
    Ok(())
}

#[tauri::command]
fn delete_trip(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_db()?;
    conn.execute("DELETE FROM trips WHERE id = ?1", params![&id])
        .map_err(|error| format!("Failed to delete trip: {error}"))?;
    let _ = app.emit("orbit://trips-changed", ());
    Ok(())
}

#[tauri::command]
fn search_trips(query: String) -> Result<Vec<TripSearchResult>, String> {
    let conn = open_db()?;
    let trimmed = query.trim().to_lowercase();
    let mut stmt = conn
        .prepare(
            r#"
            SELECT
                t.id, t.item_id, t.title, t.content, t.category, t.status, t.tags, t.pinned, t.created_at, t.updated_at, t.last_viewed_at,
                i.title, i.icon, i.kind
            FROM trips t
            LEFT JOIN items i ON i.id = t.item_id
            ORDER BY t.pinned DESC, t.updated_at DESC
            LIMIT 200
            "#,
        )
        .map_err(|error| format!("Failed to prepare trip search: {error}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                trip_from_row(row)?,
                row.get::<_, Option<String>>(11)?.unwrap_or_else(|| "Unknown resource".to_string()),
                row.get::<_, Option<String>>(12)?.unwrap_or_else(|| "Lightbulb".to_string()),
                row.get::<_, Option<String>>(13)?.unwrap_or_else(|| "file".to_string()),
            ))
        })
        .map_err(|error| format!("Failed to query trip search: {error}"))?;

    let mut results = Vec::new();
    for row in rows {
        let (trip, item_title, item_icon, item_kind) =
            row.map_err(|error| format!("Failed to map trip search result: {error}"))?;
        if !trimmed.is_empty() {
            let haystack = format!(
                "{} {} {} {} {}",
                trip.title,
                trip.content,
                trip.category,
                trip.status.clone().unwrap_or_default(),
                trip.tags.join(" ")
            )
            .to_lowercase();
            if !haystack.contains(&trimmed) {
                continue;
            }
        }
        results.push(TripSearchResult {
            item_id: trip.item_id.clone(),
            trip,
            item_title,
            item_icon,
            item_kind,
        });
        if results.len() >= 20 {
            break;
        }
    }
    Ok(results)
}

#[tauri::command]
fn trip_count_for_items(item_ids: Vec<String>) -> Result<HashMap<String, i64>, String> {
    let conn = open_db()?;
    let mut counts = HashMap::new();
    for id in item_ids {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM trips WHERE item_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap_or(0);
        counts.insert(id, count);
    }
    Ok(counts)
}

#[tauri::command]
fn create_item(app: tauri::AppHandle, input: OrbitItemInput) -> Result<OrbitItem, String> {
    let conn = open_db()?;
    let item = insert_item(&conn, &input)?;
    let _ = app.emit("orbit://refresh-resources", ());
    Ok(item)
}

#[tauri::command]
fn create_items_from_paths(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<Vec<OrbitItem>, String> {
    let conn = open_db()?;
    let mut created = Vec::new();
    for path in paths
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
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
    let group = normalize_group_value(&item.group, &item.kind);
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
            group,
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
    conn.execute("DELETE FROM trips WHERE item_id = ?1", params![&id])
        .map_err(|error| format!("Failed to cleanup trips: {error}"))?;
    conn.execute("DELETE FROM items WHERE id = ?1", params![id])
        .map_err(|error| format!("Failed to delete item: {error}"))?;
    let _ = app.emit("orbit://refresh-resources", ());
    let _ = app.emit("orbit://trips-changed", ());
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
    for target in targets
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
    {
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
        let mut command = if target.starts_with("http://")
            || target.starts_with("https://")
            || target.contains("://")
        {
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
        Err(format!(
            "Launching is currently implemented on Windows only: {target}"
        ))
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

    let mut cmd = ProcessCommand::new("powershell.exe");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let output = cmd
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .output()
        .map_err(|error| format!("Failed to run shortcut resolver: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "null" {
        return Ok(Vec::new());
    }

    let shortcuts: Vec<ShortcutInfo> = serde_json::from_str(&stdout)
        .map_err(|error| format!("Failed to parse shortcut resolver output: {error}"))?;

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
                subtitle: if resolved.trim().is_empty() {
                    shortcut.shortcut.clone()
                } else {
                    resolved
                },
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
    log_plugin_event(
        &conn,
        "core-bookmarks",
        "info",
        "Browser bookmark import completed",
    )?;
    all_items(&conn)
}

#[tauri::command]
fn update_global_hotkey(app: tauri::AppHandle, new_hotkey: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;

        let conn = open_db().map_err(|e| e.to_string())?;
        let old_hotkey = setting(&conn, "global_hotkey", "Ctrl+Alt+Space")?;

        let old_shortcut = old_hotkey
            .to_lowercase()
            .parse::<tauri_plugin_global_shortcut::Shortcut>()
            .map_err(|e| format!("解析旧快捷键失败: {}", e))?;

        let new_shortcut = new_hotkey
            .to_lowercase()
            .parse::<tauri_plugin_global_shortcut::Shortcut>()
            .map_err(|e| format!("解析新快捷键失败，格式可能不正确: {}", e))?;

        let shortcut_manager = app.global_shortcut();

        // 尝试注册新快捷键，看是否冲突或格式无效
        shortcut_manager
            .register(new_shortcut.clone())
            .map_err(|e| format!("快捷键冲突或注册失败: {}", e))?;

        // 注册成功，注销老快捷键
        let _ = shortcut_manager.unregister(old_shortcut);

        // 保存新配置到数据库
        set_setting_value(&conn, "global_hotkey", &new_hotkey)?;
        Ok(())
    }
    #[cfg(not(desktop))]
    {
        let conn = open_db().map_err(|e| e.to_string())?;
        set_setting_value(&conn, "global_hotkey", &new_hotkey)?;
        Ok(())
    }
}

#[tauri::command]
fn preview_scan_shortcuts() -> Result<Vec<OrbitItemInput>, String> {
    let mut found = scan_shortcuts_with_powershell().unwrap_or_else(|_| {
        let mut fallback = Vec::new();
        for root in shortcut_roots() {
            scan_dir_for_shortcuts(&root, &mut fallback);
        }
        fallback
    });
    found.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(found)
}

#[tauri::command]
fn preview_scan_browser_bookmarks() -> Result<Vec<OrbitItemInput>, String> {
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
    found.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(found)
}

#[tauri::command]
fn import_scanned_items(
    app: tauri::AppHandle,
    items: Vec<OrbitItemInput>,
) -> Result<Vec<OrbitItem>, String> {
    let conn = open_db()?;
    for input in items {
        let _ = upsert_scanned_item(&conn, &input);
    }
    let _ = app.emit("orbit://refresh-resources", ());
    all_items(&conn)
}

#[tauri::command]
fn set_plugin_enabled(
    app: tauri::AppHandle,
    id: String,
    enabled: bool,
) -> Result<CatalogSnapshot, String> {
    let conn = open_db()?;
    conn.execute(
        "UPDATE plugin_states SET enabled = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, if enabled { 1 } else { 0 }, now_string()],
    )
    .map_err(|error| format!("Failed to update plugin state: {error}"))?;
    log_plugin_event(
        &conn,
        &id,
        "info",
        if enabled {
            "Plugin enabled"
        } else {
            "Plugin disabled"
        },
    )?;
    let _ = app.emit("orbit://refresh-resources", ());
    catalog_snapshot()
}

#[tauri::command]
fn set_active_theme(app: tauri::AppHandle, theme_id: String) -> Result<CatalogSnapshot, String> {
    let conn = open_db()?;
    set_setting_value(&conn, "active_theme_id", &theme_id)?;
    log_plugin_event(
        &conn,
        "core-themes",
        "info",
        &format!("Theme changed to {theme_id}"),
    )?;
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
    log_plugin_event(
        &conn,
        "core-plugin-dev",
        "warn",
        if enabled {
            "Safe mode enabled"
        } else {
            "Safe mode disabled"
        },
    )?;
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
        trips: all_trips(&conn)?,
        plugins: all_plugins(&conn)?,
        active_theme_id: Some(setting(&conn, "active_theme_id", "local-galaxy")?),
    };
    let json = serde_json::to_string_pretty(&export)
        .map_err(|error| format!("Failed to serialize export: {error}"))?;
    let backup_dir = app_data_dir()?.join("backups");
    fs::create_dir_all(&backup_dir)
        .map_err(|error| format!("Failed to create backup directory: {error}"))?;
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
    for trip in export.trips {
        let category = normalize_trip_category(&trip.category);
        let status = normalize_trip_status(&category, trip.status);
        let tags = normalize_trip_tags(trip.tags);
        let _ = conn.execute(
            r#"
            INSERT OR REPLACE INTO trips (id, item_id, title, content, category, status, tags, pinned, created_at, updated_at, last_viewed_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
            params![
                trip.id,
                trip.item_id,
                trip.title,
                trip.content,
                category,
                status,
                serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()),
                if trip.pinned { 1 } else { 0 },
                trip.created_at,
                trip.updated_at,
                trip.last_viewed_at,
            ],
        );
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
        fs::create_dir_all(&plugin_root)
            .map_err(|error| format!("Failed to create hello plugin: {error}"))?;
        fs::write(plugin_root.join("plugin.json"), hello_plugin_manifest())
            .map_err(|error| format!("Failed to write hello plugin manifest: {error}"))?;
        fs::write(plugin_root.join("main.ts"), hello_plugin_source_for("hello-command"))
            .map_err(|error| format!("Failed to write hello plugin source: {error}"))?;
        fs::write(
            plugin_root.join("orbitstart-plugin-api.d.ts"),
            hello_plugin_api_types(),
        )
        .map_err(|error| format!("Failed to write hello plugin API types: {error}"))?;
        fs::write(plugin_root.join("README.md"), hello_plugin_readme())
            .map_err(|error| format!("Failed to write hello plugin README: {error}"))?;
    }

    let trips_plugin_root = plugins_dir()?.join("trips-search");
    if !trips_plugin_root.exists() {
        fs::create_dir_all(&trips_plugin_root)
            .map_err(|error| format!("Failed to create trips plugin: {error}"))?;
        fs::write(trips_plugin_root.join("plugin.json"), trips_plugin_manifest())
            .map_err(|error| format!("Failed to write trips plugin manifest: {error}"))?;
        fs::write(trips_plugin_root.join("main.ts"), trips_plugin_source())
            .map_err(|error| format!("Failed to write trips plugin source: {error}"))?;
        fs::write(
            trips_plugin_root.join("orbitstart-plugin-api.d.ts"),
            hello_plugin_api_types(),
        )
        .map_err(|error| format!("Failed to write trips plugin API types: {error}"))?;
        fs::write(trips_plugin_root.join("README.md"), trips_plugin_readme())
            .map_err(|error| format!("Failed to write trips plugin README: {error}"))?;
    }

    let theme_root = themes_dir()?.join("aurora-focus");
    if !theme_root.exists() {
        fs::create_dir_all(&theme_root)
            .map_err(|error| format!("Failed to create sample theme: {error}"))?;
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

fn trips_plugin_manifest() -> &'static str {
    r#"{
  "id": "trips-search",
  "name": "Trips Search",
  "version": "0.1.0",
  "description": "Search and open Trip notes attached to OrbitStart resources.",
  "enabled": true,
  "builtin": false,
  "permissions": [
    { "id": "ui:toast", "label": "Show toast messages", "risk": "low" },
    { "id": "trips:read", "label": "Search and open Trip notes", "risk": "medium" }
  ],
  "contributes": { "commands": 1, "searchProviders": 1, "themes": 0, "views": 0 }
}
"#
}

fn trips_plugin_source() -> &'static str {
    r#"import type { OrbitPlugin } from "./orbitstart-plugin-api";

const plugin: OrbitPlugin = {
  activate(ctx) {
    ctx.commands.registerCommand({
      id: "open",
      title: "打开 Trips",
      subtitle: "查看资源提示笔记、快捷键、流程和状态记录。",
      icon: "Lightbulb",
      keywords: ["trips", "notes", "usage", "提示", "笔记"],
      run: async () => {
        await ctx.trips.open("", "");
        ctx.ui.toast("已打开 Trips 页面");
      }
    });

    ctx.search.registerProvider("content", async (query) => {
      const q = query.trim();
      if (q.length < 2) return [];
      const results = await ctx.trips.search(q);
      return results.map((result) => {
        const preview = result.trip.content.replace(/[#*_`|>-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 88);
        return {
          id: `trips-search.${result.trip.id}`,
          title: `[Trip] ${result.itemTitle} · ${result.trip.title}`,
          subtitle: preview || result.trip.tags.join(", ") || "资源提示笔记",
          icon: "Lightbulb",
          source: "trips-search",
          actionLabel: "查看 Trip",
          run: () => ctx.trips.open(result.itemId, result.trip.id)
        };
      });
    });
  }
};

export default plugin;
"#
}

fn hello_plugin_source_for(plugin_id: &str) -> String {
    hello_plugin_source().replace("hello-command", plugin_id)
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

    ctx.search.registerProvider("hello-command.search", async (query) => {
      if (!query.toLowerCase().includes("hello")) return [];
      return [
        {
          id: "hello-command.searchResult",
          title: "Hello plugin search result",
          subtitle: "This result is produced by main.ts inside an isolated worker.",
          icon: "Sparkles",
          source: "hello-command",
          actionLabel: "Show toast",
          run: () => ctx.ui.toast(`Hello search matched: ${query}`)
        }
      ];
    });
  }
};

export default plugin;
"#
}

fn hello_plugin_api_types() -> &'static str {
    r#"export interface OrbitPlugin {
  activate(ctx: OrbitPluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface OrbitPluginContext {
  commands: {
    registerCommand(command: RegisteredCommand): () => void;
  };
  search: {
    registerProvider(id: string, provider: SearchProvider): () => void;
  };
  ui: {
    toast(message: string): void;
  };
  settings: PluginSettings;
  storage: PluginStorage;
  trips: TripsApi;
}

export interface RegisteredCommand {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  keywords: string[];
  run(): void | Promise<void>;
}

export type SearchProvider = (query: string) => SearchResult[] | Promise<SearchResult[]>;

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  source: string;
  actionLabel: string;
  run?(): void | Promise<void>;
}

export interface PluginSettings {
  get<T = unknown>(key: string, fallbackValue?: T): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<boolean>;
}

export interface PluginStorage {
  get<T = unknown>(key: string, fallbackValue?: T): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<boolean>;
  remove(key: string): Promise<boolean>;
  list(): Promise<Array<{ key: string; value: unknown }>>;
}

export interface TripsApi {
  search(query: string): Promise<TripSearchResult[]>;
  open(itemId: string, tripId?: string): Promise<boolean>;
}

export interface TripSearchResult {
  trip: {
    id: string;
    itemId: string;
    title: string;
    content: string;
    category: string;
    status?: string | null;
    tags: string[];
    pinned: boolean;
    createdAt: number;
    updatedAt: number;
    lastViewedAt?: number | null;
  };
  itemId: string;
  itemTitle: string;
  itemIcon: string;
  itemKind: string;
}
"#
}

fn hello_plugin_readme() -> &'static str {
    r#"# Hello Command

This template is intentionally small. Edit `plugin.json`, implement `main.ts`, then restart OrbitStart or refresh the plugin manager.

Common OrbitStart plugin APIs:

- `ctx.commands.registerCommand`
- `ctx.search.registerProvider`
- `ctx.ui.toast`
- `ctx.settings` (requires `settings:plugin`)
- `ctx.storage` (requires `storage:plugin`)

Runtime notes:

- `main.ts` runs inside an isolated Web Worker.
- Keep runtime code self-contained; static imports are not supported yet.
- `import type` is allowed for local editor typings.
"#
}

fn trips_plugin_readme() -> &'static str {
    r#"# Trips Search

Adds command-palette search for Trip notes attached to OrbitStart resources.

- `ctx.trips.search(query)` reads Trip notes through OrbitStart's host bridge.
- `ctx.trips.open(itemId, tripId)` opens the Trips page or highlights a Trip for a resource.
- The plugin does not receive generic native invoke access.
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
    let slug = if slug.is_empty() {
        "orbit-plugin".to_string()
    } else {
        slug
    };
    let path = plugins_dir()?.join(&slug);
    fs::create_dir_all(&path)
        .map_err(|error| format!("Failed to create plugin template: {error}"))?;
    let manifest = hello_plugin_manifest()
        .replace("hello-command", &slug)
        .replace("Hello Command", &name);
    fs::write(path.join("plugin.json"), manifest)
        .map_err(|error| format!("Failed to write plugin manifest: {error}"))?;
    fs::write(path.join("main.ts"), hello_plugin_source_for(&slug))
        .map_err(|error| format!("Failed to write plugin source: {error}"))?;
    fs::write(path.join("orbitstart-plugin-api.d.ts"), hello_plugin_api_types())
        .map_err(|error| format!("Failed to write plugin API types: {error}"))?;
    fs::write(path.join("README.md"), hello_plugin_readme())
        .map_err(|error| format!("Failed to write plugin README: {error}"))?;

    let conn = open_db()?;
    log_plugin_event(
        &conn,
        "core-plugin-dev",
        "info",
        &format!("Created plugin template {slug}"),
    )?;
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

#[tauri::command]
fn get_autostart_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = ProcessCommand::new("reg");
        cmd.creation_flags(0x08000000);
        let output = cmd
            .args([
                "query",
                r#"HKCU\Software\Microsoft\Windows\CurrentVersion\Run"#,
                "/v",
                "OrbitStart",
            ])
            .output()
            .map_err(|e| e.to_string())?;
        Ok(output.status.success())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn set_autostart_enabled(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if enabled {
            let exe_path = std::env::current_exe()
                .map_err(|e| format!("Failed to get current exe path: {e}"))?;
            let exe_str = exe_path.to_string_lossy().to_string();
            let exe_arg = format!("\"{}\"", exe_str);
            let mut cmd = ProcessCommand::new("reg");
            cmd.creation_flags(0x08000000);
            let status = cmd
                .args([
                    "add",
                    r#"HKCU\Software\Microsoft\Windows\CurrentVersion\Run"#,
                    "/v",
                    "OrbitStart",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &exe_arg,
                    "/f",
                ])
                .status()
                .map_err(|e| e.to_string())?;
            if !status.success() {
                return Err("Failed to write autostart registry".to_string());
            }
        } else {
            let mut cmd = ProcessCommand::new("reg");
            cmd.creation_flags(0x08000000);
            let _ = cmd
                .args([
                    "delete",
                    r#"HKCU\Software\Microsoft\Windows\CurrentVersion\Run"#,
                    "/v",
                    "OrbitStart",
                    "/f",
                ])
                .status();
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
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
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    // 从数据库中读取当前热键设置，如果没有，则默认使用 "Ctrl+Alt+Space"
    let hotkey_str = open_db()
        .and_then(|conn| setting(&conn, "global_hotkey", "Ctrl+Alt+Space"))
        .unwrap_or_else(|_| "Ctrl+Alt+Space".to_string());
    let hotkey_str = hotkey_str.to_lowercase();

    let builder =
        tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                show_and_focus_main(app);
            }
        });

    if let Err(e) = app.handle().plugin(builder.build()) {
        eprintln!("Failed to register global shortcut plugin: {e}");
    } else {
        // 动态注册从数据库读取的快捷键
        if let Ok(shortcut) = hotkey_str.parse::<tauri_plugin_global_shortcut::Shortcut>() {
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!(
                    "Failed to register initial global shortcut '{}': {}",
                    hotkey_str, e
                );
            }
        }
    }
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
            list_trips,
            create_trip,
            update_trip,
            mark_trip_viewed,
            delete_trip,
            search_trips,
            trip_count_for_items,
            update_item,
            delete_item,
            launch_item,
            launch_target,
            scan_shortcuts,
            scan_browser_bookmarks,
            update_global_hotkey,
            preview_scan_shortcuts,
            preview_scan_browser_bookmarks,
            import_scanned_items,
            set_plugin_enabled,
            set_active_theme,
            set_density,
            set_close_behavior,
            set_safe_mode,
            read_plugin_runtime,
            record_plugin_runtime_event,
            export_catalog_json,
            import_catalog_json,
            create_plugin_template,
            open_data_directory,
            open_aux_window,
            get_autostart_enabled,
            set_autostart_enabled
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
                show_and_focus_main(app);
                emit_main(app, "orbit://open-settings");
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
