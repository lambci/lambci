FROM lambci/lambda-base

RUN find /usr ! -type d | sort > fs.txt && \
  yum list openssh-clients && \
  yum install -y openssh-clients && \
  bash -c 'comm -13 fs.txt <(find /usr ! -type d | sort)' | \
  grep -v ^/usr/share | \
  tar -c -T - | \
  tar -x --strip-components=1 -C /opt && \
  mv /opt/lib64 /opt/lib


FROM lambci/lambda-base:build

RUN yum install -y yum-utils rpm-build expat-devel libcurl-devel && \
  yumdownloader --source openssh && \
  yum-builddep -y openssh && \
  rpm -ivh *.rpm

COPY openssh-6.6p1-privend.patch /usr/src/rpm/SOURCES/
COPY openssh.spec.patch /tmp/

RUN cd /usr/src/rpm/SPECS && \
  patch openssh.spec < /tmp/openssh.spec.patch && \
  rpmbuild -bi openssh.spec

ARG PREFIX=/opt

COPY --from=0 /opt $PREFIX

RUN cp /usr/src/rpm/BUILDROOT/openssh*/usr/bin/ssh $PREFIX/bin/

ARG GIT_VERSION

ENV NO_GETTEXT=1 NO_PERL=1 NO_TCLTK=1 NO_PYTHON=1 INSTALL_SYMLINKS=1

RUN curl https://mirrors.edge.kernel.org/pub/software/scm/git/git-${GIT_VERSION}.tar.xz | tar -xJ && \
  cd git-${GIT_VERSION} && \
  make prefix=$PREFIX && \
  make prefix=$PREFIX strip && \
  make prefix=$PREFIX install && \
  rm -rf $PREFIX/share/git-core/templates/* && \
  find $PREFIX ! -perm -o=r -exec chmod +400 {} \;
