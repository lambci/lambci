#!/bin/bash -e

export VERSION=4.8.5

docker build --pull -t lambda-gcc .
docker run --rm -v "$PWD":/app -w /tmp lambda-gcc sh -c "tar -czf /app/gcc-${VERSION}.tgz *"

aws s3api put-object --bucket lambci --key binaries/gcc-${VERSION}.tgz --body gcc-${VERSION}.tgz --acl public-read

rm gcc-${VERSION}.tgz
