#!/bin/bash -e

docker run --rm -v "$PWD"/../..:/tmp lambci/lambda-base bash -c \
  'yum list zip && yum install -y zip; cp /usr/bin/zip /tmp/vendor/bin/'
