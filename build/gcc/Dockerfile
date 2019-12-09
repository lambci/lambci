FROM lambci/lambda-base

RUN find /usr ! -type d | sort > fs.txt
RUN yum install -y \
  gcc48-4.8.5 \
  gcc48-c++-4.8.5 \
  libasan-4.8.5 \
  libatomic-4.8.5 \
  libitm-4.8.5 \
  libmudflap-4.8.5 \
  libquadmath-4.8.5 \
  || true
RUN bash -c 'comm -13 fs.txt <(find /usr ! -type d | sort)' | grep -v ^/usr/share | tar -c -T - | tar -x -C /tmp --strip-components=1
RUN rm -rf /tmp/lib/gcc/x86_64-amazon-linux/4.8.5/32
RUN cp /lib64/libgcc_s-4.8.5-20150702.so.1 /tmp/lib64/
RUN for lib in libc libpthread; do sed -i s_/usr/_/tmp/_ /tmp/lib64/${lib}.so; done
RUN for lib in libasan libatomic libitm libmudflap libmudflapth libquadmath libtsan; do \
    sed -i s_/usr/_/tmp/_ /tmp/lib/gcc/x86_64-amazon-linux/4.8.5/${lib}.so; \
  done
RUN cd /tmp/bin && \
  ln -sf c++48 c++ && \
  ln -sf gcc48-c89 c89 && \
  ln -sf gcc48-c99 c99 && \
  ln -sf gcc48 cc && \
  ln -sf cpp48 cpp && \
  ln -sf g++48 g++ && \
  ln -sf gcc48 gcc && \
  ln -sf gcov48 gcov && \
  cd /tmp/lib64 && \
  ln -sf libstdc++.so.6.0.19 libstdc++.so && \
  ln -sf /usr/lib64/pkcs11/p11-kit-trust.so p11-kit-trust.so && \
  cd /tmp/lib/gcc/x86_64-amazon-linux/4.8.5 && \
  ln -sf /tmp/lib64/libgcc_s-4.8.5-20150702.so.1 libgcc_s.so && \
  ln -sf /usr/lib64/libgomp.so.1.0.0 libgomp.so && \
  ln -sf /usr/libexec/getconf/POSIX_V6_LP64_OFF64 /tmp/libexec/getconf/default
