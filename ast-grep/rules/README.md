# ast-grep rules

`no-fixed-wait-in-e2e` forbids fixed-time sleeps in `test/e2e/`:
`waitForTimeout`, any `setTimeout` inside `new Promise(...)` (including a
deadline timer for `Promise.race`; suppress those with a reason), any call to
`sleep` / `delay` / `wait` / `pause` / `timeout`, and `await obj.sleep(N)`-style
member calls with a number literal. See
[dev-docs/testing.md](../../dev-docs/testing.md).

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
