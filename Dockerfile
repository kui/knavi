FROM node:26-slim

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

# hadolint ignore=DL3008
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    make \
    zip \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /usr/local/bin/hadolint https://github.com/hadolint/hadolint/releases/download/v2.14.0/hadolint-Linux-x86_64 \
  && chmod +x /usr/local/bin/hadolint

WORKDIR /work
