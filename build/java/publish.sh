#!/bin/sh

PACKAGE=java-1.8.0-openjdk-devel

docker run --rm -v "$PWD":/app lambci/yumda:1 bash -c "
  yumdownloader $PACKAGE && \
  rpm -ivh --root=/lambda --prefix=/tmp ${PACKAGE}-*.rpm && \
  cd /lambda/tmp && \
  tar -czf /app/${PACKAGE}.tgz *
"

aws s3api put-object --bucket lambci --key binaries/${PACKAGE}.yumda.tgz --body ${PACKAGE}.tgz --acl public-read

rm ${PACKAGE}.tgz
