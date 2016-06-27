FROM lambci/lambda

WORKDIR /tmp/lambci/build

ENV HOME /tmp/lambci/home
ENV PATH $HOME/.local/bin:$HOME/usr/bin:/var/task/python/bin:$PATH
ENV PYTHONPATH /var/task/python/lib/python2.7/site-packages
ENV LD_LIBRARY_PATH $HOME/usr/lib64:$LD_LIBRARY_PATH
ENV GIT_TEMPLATE_DIR $HOME/usr/share/git-core/templates
ENV GIT_EXEC_PATH $HOME/usr/libexec/git-core

ADD . /var/task
ADD ./home $HOME
ADD ./vendor/git-2.4.3.tar $HOME

USER root
RUN chown -R slicer:497 /var/task
RUN chown -R sbx_user1051:495 /tmp
USER sbx_user1051

ENTRYPOINT []
CMD bash
