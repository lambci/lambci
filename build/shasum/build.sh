#!/bin/bash -e

docker run --rm -v "$PWD"/../..:/tmp lambci/lambda-base bash -c \
  'yum list perl-Digest-SHA && yum install -y perl-Digest-SHA;
   cp /usr/bin/shasum /tmp/vendor/bin/ &&
   cp /usr/lib64/perl5/vendor_perl/auto/Digest/SHA/SHA.so /tmp/vendor/lib/perl5/vendor_perl/auto/Digest/SHA/ &&
   cp /usr/lib64/perl5/vendor_perl/Digest/SHA.pm /tmp/vendor/lib/perl5/vendor_perl/Digest/'
