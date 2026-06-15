- Run `npm run lint && npm run test` **once** after all code changes are complete and before delivering the final response. Do not run it repeatedly during iterative work or before asking the user a question unless new changes were made since the last run.
- Write all PR, code, and commit comments in English.
- Use mise to manage tool versions. Ensure `mise install` is run before building.

## Module layer boundaries

Each `src/tsconfig.*.json` defines an independent compilation unit. Imports must respect these boundaries:

- `lib/` — Shared utilities. No imports from `dom/`, `content-all/`, `content-root/`, or `background/`.
- `dom/` — DOM helpers. May import from `lib/`. No imports from `content-all/`, `content-root/`, or `background/`.
- `content-all/` — Content script (all frames). May import from `lib/` and `dom/`.
- `content-root/` — Content script (root frame only). May import from `lib/` and `dom/`. **Must NOT import from `content-all/`.**
- `background/` — Service worker. May import from `lib/`. **Must NOT import from `dom/`, `content-all/`, or `content-root/`.**
- `options/` — Options page UI. May import from `lib/` and `dom/`.

When adding a new module, place it in the lowest applicable layer. If multiple layers need it, move it to `lib/` (or `dom/` if it requires DOM APIs beyond WebWorker). Never add cross-layer paths to a tsconfig's `include` to work around these rules.
