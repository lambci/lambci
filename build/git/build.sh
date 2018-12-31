#!/bin/sh -e

export GIT_VERSION=2.20.0
export PREFIX=/var/task/vendor

docker build --pull --build-arg GIT_VERSION --build-arg PREFIX -t lambci-git .
docker run --rm -w /var/task/vendor lambci-git sh -c 'tar -cz *' | tar -zx -C ../../vendor
