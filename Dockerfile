FROM ubuntu:26.04

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

# Pin the apt archive to a point-in-time snapshot so the installed package
# versions are reproducible across builds. ca-certificates is installed first
# from the live archive because the snapshot service (snapshot.ubuntu.com) is
# served over HTTPS; keeping the trust store current is desirable anyway.
# Bump APT_SNAPSHOT to roll forward to newer package versions.
# https://documentation.ubuntu.com/server/how-to/software/snapshot-service/
ARG APT_SNAPSHOT=20260501T000000Z
# Versions are pinned through the snapshot above rather than per-package "=".
# hadolint ignore=DL3008
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && sed -i "/Signed-By:/a Snapshot: ${APT_SNAPSHOT}" \
    /etc/apt/sources.list.d/ubuntu.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    curl \
    make \
    librsvg2-bin \
    zip \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /usr/local/bin/hadolint https://github.com/hadolint/hadolint/releases/download/v2.14.0/hadolint-Linux-x86_64 \
  && chmod +x /usr/local/bin/hadolint

ENV NVM_DIR=/usr/local/nvm
COPY .nvmrc /
RUN mkdir -p $NVM_DIR
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
# hadolint ignore=SC1091
RUN source $NVM_DIR/nvm.sh --install
