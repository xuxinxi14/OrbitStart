# Phase 0 技术验证

## 本阶段目标

- 验证 Tauri 2 + React + TypeScript + Rust 能作为 OrbitStart 桌面壳。
- 验证主窗口布局、命令面板、插件列表和假数据资源网格。
- 验证前端可通过 Tauri IPC 调用 Rust 命令。
- 验证最小插件 API：注册命令、注册搜索源、执行插件动作。

## 已包含能力

- 主工作台 UI。
- 命令面板：`Ctrl + K`。
- 假资源目录：应用、文件夹、网址、脚本、动作链。
- 插件状态面板。
- 最小插件 Host。
- Rust `phase0_snapshot` 命令。
- Rust `launch_target` 命令。

## 验收方式

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run tauri:dev
```

如果 `cargo check` 或 `npm.cmd run tauri:dev` 在链接阶段失败，先看 `docs/ENVIRONMENT_NOTES.md`。当前机器已经安装 VS Build Tools/Windows SDK，并在 `.cargo/config.toml` 固定了 MSVC linker 路径，避免误用 Git 自带的非 MSVC `link.exe`。

完整桌面构建：

```powershell
npm.cmd run tauri:build
```

当前已验证产物：

```text
src-tauri/target/release/orbitstart.exe
src-tauri/target/release/bundle/msi/OrbitStart_0.1.0_x64_en-US.msi
src-tauri/target/release/bundle/nsis/OrbitStart_0.1.0_x64-setup.exe
```

浏览器预览：

```powershell
npm.cmd run dev
```

打开 `http://127.0.0.1:1420/`。
