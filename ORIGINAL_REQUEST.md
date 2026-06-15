# Original User Request

## Initial Request — 2026-06-15T13:39:41+08:00

Designing and implementing a mature, highly aesthetic desktop application theme called "Atelier Zero" for OrbitStart based on the Atelier Zero visual language (warm paper backgrounds, editorial serif typography, minimal geometric line borders, and red/orange accent highlights).

Working directory: E:\OrbitStart
Integrity mode: demo

## Reference Material

This project must directly implement the tokens, guidelines, and visual identity from the local Open Design **Warm Editorial** design system. The agent team should read the following files:
*   [DESIGN.md](file:///D:/open design/resources/open-design/design-systems/warm-editorial/DESIGN.md) — The visual guidelines, typography rules, layout principles, and component stylings.
*   [tokens.css](file:///D:/open design/resources/open-design/design-systems/warm-editorial/tokens.css) — The CSS variables for colors, typography, spacing, radius, and elevation.

## Requirements

### R1. Comprehensive Theme Auditing & Spec Listing
Audit the OrbitStart UI to identify all components, views, dialogs, buttons, sidebars, and input elements that require theme color or typography tokens. Export this complete mapping as a markdown file named [THEME_SPEC.md](file:///E:/OrbitStart/THEME_SPEC.md) containing CSS selectors and current variable associations.

### R2. Atelier Zero CSS Design & Integration
Develop and integrate the new "Atelier Zero" theme into the application:
1. Use a warm off-white/beige paper-like background color (`#F5F2EB` or `#F4F0EA`).
2. Integrate a elegant editorial serif font (e.g., "Playfair Display" or "Georgia") for header elements (such as topbar titles and section headings), paired with clean sans-serif typography for UI controls and body text.
3. Use thin, crisp geometric lines (`1px` borders, solid or dashed) for section divisions.
4. Implement a distinct warm orange/red (`#E0533C` or `#D14124`) accent color for primary buttons, tags, or active states.
5. Register the theme in the database/settings config so it can be dynamically selected and applied from the settings window.

### R3. Variable Completeness & Contrast Verification
Verify that all styling tokens defined in [THEME_SPEC.md](file:///E:/OrbitStart/THEME_SPEC.md) are fully implemented by the new theme and that there are no CSS inheritance leaks or unreadable text elements.

## Acceptance Criteria

### Audit & Documentation
- [ ] A [THEME_SPEC.md](file:///E:/OrbitStart/THEME_SPEC.md) file exists in the workspace root, listing the CSS classes and variables for: Topbar, Sidebar, Settings Panel, Main Container, Cards/List Items, Input Fields, and Buttons.

### Styling & Theme Application
- [ ] The "Atelier Zero" theme styling rules are added to the theme variables system in the application codebase.
- [ ] The new theme is registered and successfully shows up as a selectable option in the Settings UI under the name "Atelier Zero".
- [ ] When selected, the theme updates the entire application window (main container, topbar, sidebars, dialogs, settings) to use the warm off-white background (`#F5F2EB` or `#F4F0EA`).
- [ ] Headings and large page titles use serif font family rules, and body text/controls use sans-serif font family rules.
- [ ] Primary buttons and active highlights use the warm red/orange accent color.

### Verification & Correctness
- [ ] Every component listed in [THEME_SPEC.md](file:///E:/OrbitStart/THEME_SPEC.md) changes colors correctly when the theme is selected.
- [ ] All text and UI control elements remain fully legible (minimum contrast ratio of 4.5:1 against their backgrounds).
- [ ] Switching to "Atelier Zero" and then back to other themes (e.g., Local Galaxy, Orbit Dark) works cleanly without leaving behind CSS styling variable leaks.
