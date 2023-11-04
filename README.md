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
```

Interactive debug build:

```sh
$ make watch
```

zip for production build:

```sh
$ make zip
```

`docker` makes it easy to build environment:

```sh
$ docker compose run make
$ docker compose run make watch
$ docker compose run make zip
```
