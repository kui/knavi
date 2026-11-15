# knavi

A Hit-a-Hint Chrome extension. Hold Space, type a hint key, and release to click links and buttons without a mouse.

<a target="_blank" href="https://chrome.google.com/webstore/detail/knavi/pfcgnkljgjobpkbgcifmpnhglafhkifg">![Try it now in Chrome Web Store](docs/tryitnowbutton.png)</a>

## Screenshot

Hints displayed:

![Hints displayed screenshot](docs/screenshot1-hinting.png)

Hit confirmed:

![Hit confirmed screenshot](docs/screenshot2-hiting.png)

## Description

Click links and buttons with the keyboard only. Hold the Peek Key (Space by default), type the hint key shown on each target, then release to click. Hold `Ctrl`, `Shift`, or `Alt` on release to open links in a new tab or window.

Prefer not to hold a key down? Bind a Sticky Key in options to show hints with a single press, and an Action Key to click.

The Peek Key, Sticky Key, hint letters, and per-site selectors are all configurable in options.

## Build

Tool versions are managed by [mise](https://mise.jdx.dev/). Run `mise install`
and `npm ci` first to set up the build environment.

Debug build:

```sh
npm run build
```

Interactive debug build:

```sh
npm run watch
```

zip for production build:

```sh
npm run zip
```

## Development note

For a user-visible change, add a changelog fragment as described in
[changelog/unreleased/README.md](changelog/unreleased/README.md).

## Release

1. Check the version in [package.json](package.json)
2. Run `npm run changelog` to combine the fragments in `changelog/unreleased/`
   into `changelog/<Version>.md`, and replace the TODO on its line 3 with a
   one-line digest of the release. Reorder entries within a section if needed
3. Open a pull request with them and merge it
4. Create and push the release tag by either:
   - Running the [tag-for-release workflow](https://github.com/kui/knavi/actions/workflows/tag-for-release.yaml)
     on GitHub Actions ("Run workflow" button, or `gh workflow run tag-for-release.yaml`)
   - Executing `scripts/tag_for_release.bash` locally and pushing the tag
5. Bump minor version in [package.json](package.json) for next release
