FROM lambci/yumda:1

RUN yum install -y gcc72-c++


FROM lambci/lambda:provided

WORKDIR /tmp/lambci/build

ENV HOME=/tmp/lambci/home
ENV PATH=$HOME/.local/bin:$HOME/usr/bin:/var/task/node_modules/.bin:/opt/bin:$PATH \
  LD_LIBRARY_PATH=$HOME/usr/lib64:$LD_LIBRARY_PATH \
  PYTHONPATH=$HOME/.local/lib/python3.6/site-packages:/opt/lib/python3.6/site-packages \
  PERL5LIB=/opt/share/perl5/vendor_perl:/opt/lib/perl5/vendor_perl \
  SHELL=/opt/bin/bash \
  TERM=xterm-256color \
  FORCE_COLOR=true \
  NPM_CONFIG_COLOR=always \
  MOCHA_COLORS=true

USER root

COPY --from=0 /lambda/opt /opt

ADD ./lambda.zip ./runtime/layer.zip /tmp/

RUN unzip -q /tmp/lambda.zip -d /var/task && \
  unzip -q /tmp/layer.zip -d /opt && \
  rm /tmp/*.zip

RUN chown -R slicer:497 /var/task && chown -R sbx_user1051:495 /tmp

USER sbx_user1051

RUN mkdir -p $HOME && \
  cp -r /var/task/home/. $HOME

ENTRYPOINT []
CMD /opt/bin/bash
