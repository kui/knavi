# Testing

How to decide where a test goes and what makes it trustworthy. For the
commands, see [development.md](development.md#checks).

## What each layer covers

| Layer                         | Runs in                           | Covers                                                                                                                            |
| ----------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Unit (`test/*/`, `node:test`) | Node, no DOM                      | Logic that does not depend on browser behavior: glob matching, frame path bookkeeping, rect aggregation, hinter state transitions |
| E2E (`test/e2e/`, Playwright) | Chromium with the built extension | Anything whose result depends on how the browser behaves: layout, hit testing, shadow DOM, slots, iframes, focus, storage events  |

Pick the layer by asking whether the behavior under test is the browser's or
ours. If a unit test would need a fake that reproduces browser behavior
(layout, `elementFromPoint`, slot assignment, the composed tree, frame
messaging), write an E2E test instead.

### Fakes in unit tests

Fake only at the boundary between knavi's own parts: `chrome.runtime`
messages, `chrome.storage`, and the views that a controller drives (as
`test/content-root/hinter.test.ts` does for `HintView`). A fake there encodes
knavi's own contract, which the test can own.

Do not fake browser semantics. A fake DOM encodes what the test author
believes the browser does, so it cannot catch a bug that comes from that
belief being wrong, and most frame, shadow-root and slot bugs so far were of
that kind. Existing fakes such as `FakeNode` in `test/dom/elements.test.ts`
stay, but do not extend them to model more browser behavior; cover that in
E2E.

### E2E fixture pages

Each page in `docs/tests/` guards one behavior. When a fix needs a new case,
add a new page rather than adding elements to an existing one, so a failure
points at one behavior.

## Regression tests for fixes

A fix comes with a test that fails without the fix. Before opening the pull
request, revert the fix locally, run the test, and confirm it fails for the
reason the fix addresses. Say in the pull request that you did.

If no test can reproduce the bug (for example, it needs a real site or user
action that a fixture page cannot set up), say why in the pull request
instead.

## Waiting in E2E tests

Never sleep for a fixed time; the `no-fixed-wait-in-e2e` ast-grep rule
rejects `waitForTimeout`. A fixed sleep is either too long (slow) or too short
on a loaded CI runner (flaky). Wait for something the extension does:

- a locator assertion (`toBeVisible`, `toHaveCount`), which retries;
- `expect.poll` or `expect(...).toPass` for a value read through
  `evaluate`;
- a DOM signal from the content scripts, such as `knaviReady` on the root
  `<html>`, which content-all sets each time it finishes loading settings.

To check that something does not happen, first wait for a positive signal
that the extension has finished deciding, then assert the absence once. For
example, `spaceReachesPage` in `test/e2e/settings-storage.spec.ts` proves that
content-all has applied a blacklist match before asserting that no hints
appeared.

## Flaky tests

CI retries a failed E2E test up to twice but fails the run if a test passed
only on a retry (`failOnFlakyTests`). Retries keep the rest of the run going;
they do not hide a race. Fix the race, or if it is a known one you cannot fix
yet, open an issue and mark the test with `test.fixme` linking it.

## Coverage

`npm run test:coverage` reports unit test coverage over every file in `src/`,
including files no test imports (shown as 0%). Use it to find logic without
unit tests, not as a target: there is no threshold, and modules that only an
E2E test can meaningfully cover are expected to stay low.
