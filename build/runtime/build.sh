#!/bin/sh

. ./config.sh

docker build \
  --build-arg GIT_VERSION \
  --build-arg PIP_VERSION \
  --build-arg NODE_VERSION \
  --build-arg NPM_VERSION \
  --build-arg AWS_SDK_VERSION \
  -t lambci-base-runtime .

docker run --rm -v "$PWD":/app lambci-base-runtime cp /tmp/layer.zip /app/
