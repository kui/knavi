# Development

## Setup

Tool versions are managed by [mise](https://mise.jdx.dev/). Run `mise install`
and `npm ci` first.

## Build

| Command         | Output                                                              |
| --------------- | ------------------------------------------------------------------- |
| `npm run build` | Debug build in `build/`                                             |
| `npm run watch` | Rebuilds `build/` on changes in `src/` and serves `docs/` over HTTP |
| `npm run zip`   | Minified build in `build/`, packed into `knavi-<version>.zip`       |

Load `build/` with "Load unpacked" on `chrome://extensions` (Developer mode).

## Checks

- `npm run lint`: ESLint, Prettier, `tsc`, the changelog fragment check, and
  ast-grep. `npm run fix` applies the ESLint and Prettier fixes.
- `npm run test`: unit tests under `test/` (except `test/e2e/`), run with
  `node:test`.
- `npm run check`: both of the above, as CI runs them.
- `npm run test:e2e`: Playwright tests in `test/e2e/` against the extension in
  `build/`, so run `npm run build` first. The first run needs
  `npx playwright install chromium`. The test pages are in `docs/tests/`,
  served at `http://127.0.0.1:8787/tests/` during the run.
- `npm run test:coverage`: unit tests with a coverage report over all of
  `src/`.

Before writing or changing a test, read [testing.md](testing.md): which layer
a test belongs in, what may be faked, and how to wait in E2E tests.

## Code conventions

- Event-hook wiring belongs in the entry-point files; the ast-grep rule
  `entry-point-event-wiring` enforces it (see
  [ast-grep/rules/README.md](../ast-grep/rules/README.md)). Modules under
  `src/{name}/` export handler functions or objects, and the entry point wires
  them up.
- An ast-grep rule (`require-comment-rationale`) requires every source comment
  to either start with `WHY:` / `HACK:` / `SAFETY:` / `INVARIANT:`, or qualify
  for one of the built-in exemptions (JSDoc blocks, tooling directives, etc.;
  see [ast-grep/rules/README.md](../ast-grep/rules/README.md)). This exists to
  stop comments that merely restate what the code already says.
- A rationale prefix does not make a comment worth keeping. Do not write
  comments that explain what an API, manifest key, or platform feature does
  (e.g. what `match_origin_as_fallback` covers): that belongs to its
  documentation. Comment only on project-specific reasons the code and the
  docs cannot convey; otherwise write no comment.

## DOM changes after hinting starts

Hints are a snapshot of the DOM taken when hinting starts. If the DOM changes
while hints are shown or after they are removed (elements or iframes added,
removed, reordered, or moved), hints may be misplaced, point at empty space,
or be missing. This is the intended behavior; do not add code to handle it.

Following DOM changes would mean tracking targets, hints, and frames as they
change, which adds a lot of state to manage for little benefit: hinting
sessions are short, and starting a new one picks up the current DOM.

## Changelog

For a user-visible change, add a changelog fragment as described in
[changelog/unreleased/README.md](../changelog/unreleased/README.md).

## Release

1. Check the version in [package.json](../package.json)
2. Run `npm run changelog` to combine the fragments in `changelog/unreleased/`
   into `changelog/<Version>.md`, and replace the TODO on its line 3 with a
   one-line digest of the release. Reorder entries within a section if needed
3. Open a pull request with them and merge it
4. Create and push the release tag by either:
   - Running the [tag-for-release workflow](https://github.com/kui/knavi/actions/workflows/tag-for-release.yaml)
     on GitHub Actions ("Run workflow" button, or `gh workflow run tag-for-release.yaml`)
   - Executing `scripts/tag_for_release.bash` locally and pushing the tag
5. Bump minor version in [package.json](../package.json) for next release
