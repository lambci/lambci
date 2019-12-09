FROM lambci/lambda-base:build

RUN yum install -y yum-utils rpm-build ncurses-devel; \
  yumdownloader --source bash && \
  yum-builddep -y bash && \
  rpm -ivh *.rpm && \
  rm -rf /dev/core /dev/fd /dev/tty && \
  rpmbuild -bi --nocheck /usr/src/rpm/SPECS/bash.spec
RUN mv /usr/src/rpm/BUILDROOT/bash-*/bin /tmp/


FROM lambci/yumda:1

ARG GIT_VERSION

RUN yum install -y git-${GIT_VERSION} zip perl-Digest-SHA


FROM lambci/lambda-base:build

WORKDIR /opt

COPY --from=0 /tmp/bin ./bin
COPY --from=1 /lambda/opt .

ARG PIP_VERSION

RUN python3 -m venv /opt && /opt/bin/pip install -U "pip==${PIP_VERSION}" setuptools wheel && \
  find /opt/lib/python3.6 \( -name examples -or -name "*.exe" -or -name __pycache__ \) | xargs rm -rf

ARG NODE_VERSION

RUN curl -sSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz | \
  tar -xJ --strip-components 1

RUN curl -O https://raw.githubusercontent.com/lambci/node-custom-lambda/${NODE_VERSION}/v12.x/layer.zip && \
  unzip -o layer.zip && \
  rm layer.zip

ARG NPM_VERSION

RUN npm install -g npm@${NPM_VERSION} && \
  rm -rf LICENSE README.md CHANGELOG.md share/{man,doc} \
    lib/node_modules/npm/{docs,man,changelogs,node_modules/ajv/dist} && \
  find lib/node_modules -name '*.ts' -delete

ARG AWS_SDK_VERSION

RUN npm install -g aws-sdk@${AWS_SDK_VERSION} && \
  rm -rf lib/node_modules/aws-sdk/dist && \
  find lib/node_modules -name '*.ts' -delete

RUN mkdir nodejs && mv lib/node_modules nodejs/ && \
  cd bin && \
  ln -sf ../nodejs/node_modules/npm/bin/npm-cli.js npm && \
  ln -sf ../nodejs/node_modules/npm/bin/npx-cli.js npx

RUN zip -yr /tmp/layer.zip .
