# Hello Command

Minimal OrbitStart plugin template.

OrbitStart loads `main.ts` inside an isolated Web Worker. The template registers
one command and one search provider through the host-mediated plugin API.

Runtime notes:

- Keep `main.ts` self-contained. Static runtime imports are not supported yet.
- `import type` is allowed for local editor typings.
- Declare `ui:toast` before calling `ctx.ui.toast`.
- Declare `storage:plugin` or `settings:plugin` before using those APIs.
