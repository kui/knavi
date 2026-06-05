# knavi

A Chrome extension that enables Hit-a-Hint using a magic key.

<a target="_blank" href="https://chrome.google.com/webstore/detail/knavi/pfcgnkljgjobpkbgcifmpnhglafhkifg">![Try it now in Chrome Web Store](docs/tryitnowbutton.png)</a>

## Screenshot

Hints displayed:

![Hints displayed screenshot](docs/screenshot1-hinting.png)

Hit confirmed:

![Hit confirmed screenshot](docs/screenshot2-hiting.png)

## Description

This extension allows you to click links and buttons using only the keyboard. Pressing the space key and a hint key simulates clicking on links and buttons.

Holding modifier keys such as `Ctrl` or `Alt` when you release the space key lets you open links in a new tab or window.

The default magic key is the space key, but you can change it in the options.

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

Edit changelog in `changelog/<CurrentVersion>.md`. It will be used for release note.

## Release

1. Check the version in [package.json](package.json)
2. Confirm `changelog/<Version>.md`
3. Commit and push them
4. Execute `scripts/tag_for_release.sh`
5. Bump minor version in [package.json](package.json) for next release
