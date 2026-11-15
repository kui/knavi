# Changelog fragments

Every pull request with a user-visible change adds one file here per change.
At release time, `npm run changelog` combines them into
`changelog/<version>.md` and deletes them. Each pull request gets its own
file, so pull requests do not conflict over the changelog. Within a section,
entries are ordered by file name; the release pull request may reorder them.

Do not edit `changelog/<version>.md` or its digest line (line 3) outside a
release pull request.

## File name

`<slug>.<type>.md`, for example `121-barrier-keys.fix.md`.

- `<slug>`: lowercase letters, digits and `-`. Start it with the issue number
  when there is one.
- `<type>`: the section the entry goes under.

  | Type     | Section     |
  | -------- | ----------- |
  | `add`    | Add         |
  | `change` | Change      |
  | `fix`    | Fix         |
  | `perf`   | Performance |

A pull request with changes of two types adds two files, such as
`157-direct-storage.fix.md` and `157-direct-storage.perf.md`.

## Content

One Markdown bullet, written for users of the extension. Indent continuation
lines and sub-bullets by two spaces, and do not use blank lines. Keep the
entry short; link the issue or pull request for a longer explanation.

```markdown
- Fix hint letters reaching the page when typed right after the previous hint
  session ended, for example when re-activating Sticky Mode just after an
  action.
```

`npm run lint` checks the file name and that the content is a single bullet
with no blank lines.

## Fragments added after the release changelog was built

If a pull request with a fragment merges after the release pull request ran
`npm run changelog`, `npm run changelog` refuses to run again and tagging
fails. In the release pull request, move the bullet by hand into
`changelog/<version>.md` under its section (add the section if it is missing,
keeping the order Add, Change, Fix, Performance), indented by two spaces, and
delete the fragment.
