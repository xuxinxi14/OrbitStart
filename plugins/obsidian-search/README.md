# Obsidian Search

Official OrbitStart plugin for command-palette access to the core Obsidian local index.

- `ctx.obsidian.search(query)` searches the read-only task index built by OrbitStart core.
- `ctx.obsidian.open(vaultId, relativePath, lineNumber)` opens the source note through Obsidian.
- The plugin cannot read the filesystem directly and does not modify vault files.
