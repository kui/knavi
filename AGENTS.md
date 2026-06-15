- Run `npm run lint && npm run test` **once** after all code changes are complete and before delivering the final response. Do not run it repeatedly during iterative work or before asking the user a question unless new changes were made since the last run.
- Write all PRs, issues, code/commit comments, and docs in English, using structured information (lists, tables) to keep them as concise as possible.
- Use mise to manage tool versions. Ensure `mise install` is run before building.

## Module layer boundaries

- Each `src/tsconfig.*.json` is an independent compilation unit; imports must respect its boundaries.

  | Layer           | Role                             | May import     |
  | --------------- | -------------------------------- | -------------- |
  | `lib/`          | shared utilities                 | (none)         |
  | `dom/`          | DOM helpers                      | `lib/`         |
  | `content-all/`  | content script (all frames)      | `lib/`, `dom/` |
  | `content-root/` | content script (root frame only) | `lib/`, `dom/` |
  | `background/`   | service worker                   | `lib/`         |
  | `options/`      | options page UI                  | `lib/`, `dom/` |

- Place a new module in the lowest applicable layer; if multiple layers need it, move it to `lib/` (or `dom/` if it needs DOM APIs beyond WebWorker).
- Never add cross-layer paths to a tsconfig's `include` to work around these rules.
