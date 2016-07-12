FROM lambci/lambda

WORKDIR /tmp/lambci/build

ENV HOME=/tmp/lambci/home
ENV PATH=$HOME/.local/bin:$HOME/usr/bin:/var/task/vendor/python/bin:/var/task/node_modules/.bin:$PATH \
  LD_LIBRARY_PATH=$HOME/usr/lib64:$LD_LIBRARY_PATH \
  PYTHONPATH=/var/task/vendor/python/lib/python2.7/site-packages \
  GIT_TEMPLATE_DIR=$HOME/usr/share/git-core/templates \
  GIT_EXEC_PATH=$HOME/usr/libexec/git-core \
  SHELL=/bin/bash \
  TERM=xterm-256color \
  FORCE_COLOR=true \
  NPM_CONFIG_COLOR=always \
  MOCHA_COLORS=true

ADD . /var/task

USER root

RUN chown -R slicer:497 /var/task && chown -R sbx_user1051:495 /tmp

USER sbx_user1051

RUN mkdir -p $HOME && \
  cp -r /var/task/home/. $HOME && \
  tar -C $HOME -xf /var/task/vendor/git-2.4.3.tar

ENTRYPOINT []
CMD bash
