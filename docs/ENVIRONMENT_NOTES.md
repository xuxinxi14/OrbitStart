# Environment Notes

## 2026-06-10 Windows Rust/Tauri check

Status: fixed.

Installed Visual Studio Build Tools 2022 with the C++ workload and Windows 10/11 SDK through winget.

Frontend validation passes:

```powershell
npm.cmd install
npm.cmd run build
```

Tauri/Rust validation now passes:

```powershell
cargo check
npm.cmd run tauri:build
```

Build outputs:

```text
src-tauri/target/release/orbitstart.exe
src-tauri/target/release/bundle/msi/OrbitStart_0.1.0_x64_en-US.msi
src-tauri/target/release/bundle/nsis/OrbitStart_0.1.0_x64-setup.exe
```

Original issue:

Tauri/Rust validation was blocked by the local Windows native toolchain, not by OrbitStart source code.

Observed facts:

- `where.exe link` resolves to `E:\sx\Git\usr\bin\link.exe`.
- That `link.exe` is not the MSVC linker and rejects MSVC linker arguments.
- The project includes `.cargo/config.toml` to use Rust's bundled `rust-lld.exe` instead of the wrong Git `link.exe`.
- `rust-lld.exe` then reports missing Windows SDK import libraries such as `kernel32.lib`, `ntdll.lib`, `userenv.lib`, `ws2_32.lib`, and `dbghelp.lib`.
- No `kernel32.lib` was found under `C:\Program Files (x86)\Windows Kits`.

Applied fix:

Installed:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools
```

In the installer, include:

- Desktop development with C++
- MSVC v143 build tools
- Windows 10 or Windows 11 SDK

After installation, verified:

```powershell
Get-ChildItem -Recurse 'C:\Program Files (x86)\Windows Kits' -Filter kernel32.lib -ErrorAction SilentlyContinue | Select-Object -First 5 FullName
cargo check
```

The project also pins the installed MSVC linker and SDK library paths in `.cargo/config.toml`, so Cargo does not accidentally pick up `E:\sx\Git\usr\bin\link.exe`.
