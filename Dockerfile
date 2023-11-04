FROM ubuntu:20.04

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates=20230311ubuntu0.20.04.1 \
    curl=7.68.0-1ubuntu2.20 \
    make=4.2.1-1.2 \
    librsvg2-bin=2.48.9-1ubuntu0.20.04.4 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

ENV NVM_DIR /usr/local/nvm
COPY .nvmrc /
RUN mkdir -p $NVM_DIR
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
RUN source $NVM_DIR/nvm.sh --install 
