# knavi

a chrome extension which Hit-a-Hint with magic key.

<a target="_blank" href="https://chrome.google.com/webstore/detail/knavi/pfcgnkljgjobpkbgcifmpnhglafhkifg">![Try it now in Chrome Web Store](imgs/tryitnowbutton.png)</a>

## Screen Shot

Hinting:

![Hinting screen short](imgs/screenshot1-hinting.png)

Hiting:

![Hiting screen short](imgs/screenshot2-hiting.png)

## Build

See [Dockerfile](Dockerfile) for build environment.

Debug build:

```sh
$ make
#or
$ docker compose run --rm make
```

Interactive debug build:

```sh
$ make watch
#or
$ docker compose run --rm make watch
```

zip for production build:

```sh
$ make zip
#or
$ docker compose run --rm make zip
```
