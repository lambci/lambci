#!/bin/bash -e

export VERSION=4.8.5

docker build --pull -t lambda-gcc .
docker run --rm -w /tmp lambda-gcc sh -c 'tar -cz *' > gcc-${VERSION}.tgz

aws s3api put-object --bucket lambci --key binaries/gcc-${VERSION}.tgz --body gcc-${VERSION}.tgz --acl public-read

rm gcc-${VERSION}.tgz
