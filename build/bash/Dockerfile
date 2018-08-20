FROM lambci/lambda-base:build

RUN yum list bash && \
  yum install -y yum-utils rpm-build ncurses-devel; \
  yumdownloader --source bash && \
  yum-builddep -y bash && \
  rpm -ivh *.rpm && \
  cd /usr/src/rpm/SPECS && \
  rm -rf /dev/core /dev/fd /dev/tty && \
  rpmbuild -bi bash.spec

CMD mv /usr/src/rpm/BUILDROOT/bash-*/bin/* /tmp/vendor/bin/
