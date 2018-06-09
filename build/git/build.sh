#!/bin/bash -e

docker build --pull -t lambda-git .
docker run --rm lambda-git > ../../vendor/git-2.13.5.tar
