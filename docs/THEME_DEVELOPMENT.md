# OrbitStart Theme Development

OrbitStart themes are shareable folders built around CSS tokens. A theme can be
installed locally by placing it under:

```text
%APPDATA%\OrbitStart\themes
```

## Theme layout

```text
my-theme/
  theme.json
  theme.css
```

## Minimal theme

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "author": "Your Name",
  "description": "A shareable OrbitStart theme.",
  "builtin": false,
  "tokens": {
    "--bg": "#101315",
    "--surface": "rgba(24, 31, 34, 0.9)",
    "--surface-strong": "rgba(32, 40, 44, 0.96)",
    "--line": "rgba(235, 245, 246, 0.12)",
    "--text": "#f2fbf9",
    "--muted": "rgba(242, 251, 249, 0.62)",
    "--accent": "#64f4c4",
    "--accent-2": "#ffd166",
    "--accent-3": "#ef476f",
    "--ok": "#92e06f"
  }
}
```

## Token contract

- `--bg`: app background
- `--surface`: normal panel surface
- `--surface-strong`: modal and elevated surface
- `--line`: borders and separators
- `--text`: primary text
- `--muted`: secondary text
- `--accent`: primary action color
- `--accent-2`: warning/favorite color
- `--accent-3`: destructive/error color
- `--ok`: success/enabled color

The `theme.css` file is reserved for future advanced layout extensions. The
current app reads `theme.json` tokens and applies them live.
