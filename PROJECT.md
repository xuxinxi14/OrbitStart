# Project: Atelier Zero Visual Theme for OrbitStart

## Architecture
- OrbitStart is a Tauri desktop application with a Rust backend and a React/TypeScript frontend (bundled via Vite).
- Themes are defined as manifests containing CSS variables (tokens) that are applied dynamically to the document root element (`:root`).
- Theme list is loaded dynamically from the Rust backend via Tauri IPC (`all_themes()`), which combines builtin themes defined in `src-tauri/src/main.rs` and local theme directories under `%APPDATA%\OrbitStart\themes`.
- Active theme selection is persisted in a SQLite database settings table under the key `active_theme_id`.
- The frontend also maintains static fallbacks in `src/data/catalog.ts`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Test Track Design | Design the E2E test infrastructure & compile requirements into a test plan | None | PLANNED |
| 2 | UI Audit & Spec | Audit UI components, selectors, and variables; export to THEME_SPEC.md | M1 | PLANNED |
| 3 | Theme Registration | Add 'Atelier Zero' theme variables and register in Rust/React codebases | M2 | PLANNED |
| 4 | Styling & Integration | Implement serif headings, crisp borders, and terracotta accent styles | M3 | PLANNED |
| 5 | Contrast & Stability | Verify contrast ratios >= 4.5:1, test switching stability without leaks | M4 | PLANNED |
| 6 | E2E Testing Validation | Run the complete E2E test suite to verify 100% pass rate & audit cleanliness | M5 | PLANNED |

## Interface Contracts
### Rust Backend (Tauri) ↔ React Frontend (TypeScript)
- Tauri Command: `set_active_theme(theme_id: string) -> Result<CatalogSnapshot, String>`
- Event: `orbit://refresh-resources` emitted on active theme changes.
- Theme Manifest Structure:
  ```typescript
  export interface ThemeManifest {
    id: string;
    name: string;
    author: string;
    description: string;
    builtin?: boolean;
    tokens: Record<string, string>;
  }
  ```

## Code Layout
- `src-tauri/src/main.rs`: Rust Tauri application entry point and theme backend registry.
- `src/data/catalog.ts`: Static/fallback frontend catalog dataset containing theme definitions.
- `src/App.tsx`: Main React desktop shell layout, sidebar settings UI, theme rendering, and toggle state.
- `src/styles.css`: Global styling rules, variable references, layout overrides, and theme classes.
