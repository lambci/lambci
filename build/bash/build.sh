#!/bin/bash -e

docker build --pull -t lambda-bash .
docker run --rm -v "$PWD"/../..:/tmp lambda-bash
