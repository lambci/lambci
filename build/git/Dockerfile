FROM lambci/lambda-base:build

RUN yum list openssh && \
  yum install -y yum-utils rpm-build; \
  yumdownloader --source openssh && \
  yum-builddep -y openssh && \
  rpm -ivh *.rpm

COPY openssh-6.6p1-privend.patch /usr/src/rpm/SOURCES/
COPY openssh.spec.patch /tmp/

RUN cd /usr/src/rpm/SPECS && \
  patch openssh.spec < /tmp/openssh.spec.patch && \
  rpmbuild -bi openssh.spec


FROM lambci/lambda-base

RUN find /usr ! -type d | sort > fs.txt && \
  yum list git && \
  yum install -y git; \
  rm -rf /usr/share/git-core/templates/*

COPY --from=0 /usr/src/rpm/BUILDROOT/openssh*/usr/bin/ssh /usr/bin/

CMD bash -c 'comm -13 fs.txt <(find /usr ! -type d | sort)' | \
  grep -v ^/usr/share | \
  bash -c 'cat - <(echo /usr/share/git-core/templates)' | \
  tar -c -T -
