FROM lambci/lambda:nodejs8.10

WORKDIR /tmp/lambci/build

ENV HOME=/tmp/lambci/home
ENV PATH=$HOME/.local/bin:$HOME/usr/bin:/var/task/vendor/bin:/var/task/node_modules/.bin:$PATH \
  LD_LIBRARY_PATH=$HOME/usr/lib64:/var/task/vendor/lib:$LD_LIBRARY_PATH \
  PYTHONPATH=/var/task/vendor/lib/python2.7/site-packages \
  PERL5LIB=/var/task/vendor/lib/perl5/vendor_perl \
  SHELL=/var/task/vendor/bin/bash \
  TERM=xterm-256color \
  FORCE_COLOR=true \
  NPM_CONFIG_COLOR=always \
  MOCHA_COLORS=true

ADD . /var/task

USER root

RUN chown -R slicer:497 /var/task && chown -R sbx_user1051:495 /tmp

USER sbx_user1051

RUN mkdir -p $HOME && \
  cp -r /var/task/home/. $HOME

ENTRYPOINT []
CMD /var/task/vendor/bin/bash
