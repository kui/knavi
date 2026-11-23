# ast-grep rules

`no-random-uuid` forbids `crypto.randomUUID` in `src/` (undefined on non-secure
pages).

`entry-point-event-wiring` forbids registering listeners outside the entry-point
files (`src/background.ts`, `src/content-all.ts`, `src/content-root.ts`,
`src/options.ts`, `src/popup.ts`):

- `chrome.*.*.addListener`;
- `addEventListener` on `window`, `document` and `window.navigation`.

Listeners on elements or `AbortSignal`s that a module creates itself stay
allowed. Export a handler from the module and wire it in the entry point.

`no-fixed-wait-in-e2e` forbids fixed-time sleeps in `test/e2e/`:

- `waitForTimeout`;
- any `setTimeout` or `setInterval` inside `new Promise(...)` (including a
  deadline timer for `Promise.race`; suppress those with a reason);
- `await setTimeout(...)` (the `node:timers/promises` form; an aliased import
  is not detected);
- any call to a bare `sleep` / `delay` / `wait` / `pause` / `timeout`, awaited
  or not (suppress a non-sleep helper of that name with a reason);
- member calls such as `obj.sleep(...)` only when awaited with a number
  literal, so `await helper.wait(locator)` is not reported.

See [dev-docs/testing.md](../../dev-docs/testing.md).

To allow a legitimate exception, put
`// ast-grep-ignore: <rule-id> -- WHY: <reason>` on the line before the line
the match is reported on (for a multi-line `new Promise((r) =>\n setTimeout(r, 5))`,
the `setTimeout` line), or at the end of that line. Use the comment syntax of
the language (`#`, `/* */`, `<!-- -->`). The reason after `-- WHY:` is required:
a directive without one fails the comment-rationale rule of that language. A
suppression that suppresses nothing fails lint (`--error=unused-suppression`).

## Comment-rationale rules

Enforces that every source-code comment either

- prefixes its body with one of `WHY:` / `HACK:` / `SAFETY:` / `INVARIANT:`, or
- is a JSDoc block (`/** ... */`, TypeScript only), or
- is a tooling directive (`eslint-*`, `ts-*`, `@ts-*`, `biome-*`, `prettier-*`,
  `deno-*`, `c8`, `istanbul`, `v8`, `shellcheck`), a region marker
  (`#region` / `#endregion`), a shebang (`#!`, bash), or an IE conditional
  (`<!--[if ...]`, HTML).

Otherwise `ast-grep scan` fails.

Purpose: LLM-generated code tends to restate what the code already says. This
lint forces such comments to either be **deleted** or **justified** with a
rationale keyword.

Keyword meanings:

- **WHY** — motivation / non-obvious context the code alone cannot convey.
  Not what an API, manifest key, or platform feature does: that is in its
  documentation, so restating it (even with a `WHY:` prefix) is still noise.
- **HACK** — workaround for an upstream/environment issue.
- **SAFETY** — invariant needed for memory / concurrency correctness.
- **INVARIANT** — precondition/postcondition contract that must hold.

Covered languages: TypeScript, HTML, CSS, Bash. JSON is intentionally excluded
because the spec forbids comments.

Run: `npm run lint:ast-grep`.
