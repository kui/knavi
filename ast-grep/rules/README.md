# ast-grep comment-rationale rules

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
- **HACK** — workaround for an upstream/environment issue.
- **SAFETY** — invariant needed for memory / concurrency correctness.
- **INVARIANT** — precondition/postcondition contract that must hold.

Covered languages: TypeScript, HTML, CSS, Bash. JSON is intentionally excluded
because the spec forbids comments.

Run: `npm run lint:ast-grep`.
