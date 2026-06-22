# OrbitStart Plugin Directory

This folder contains source examples for local plugins. Runtime-installed
plugins live in `%APPDATA%\OrbitStart\plugins`.

Local plugins are manifest-first packages with an isolated Worker runtime:

```text
my-plugin/
  plugin.json
  main.ts
  orbitstart-plugin-api.d.ts
  README.md
```

OrbitStart loads `main.js` first, then `main.ts`. Keep runtime code
self-contained; static imports are not supported yet unless you bundle to
`main.js`.

Use:

```powershell
npm.cmd run package:plugin -- -PluginPath .\plugins\hello-command
```

Current examples:

- `hello-command`: minimal command/search template.
- `trips-search`: command-palette search bridge for core Trips notes through `ctx.trips`.
- `obsidian-search`: official command-palette bridge for the core Obsidian local task index through `ctx.obsidian`.
