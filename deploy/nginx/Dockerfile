FROM nginx:1.30.6-alpine-slim AS brotli-builder

ARG NGINX_VERSION=1.30.6
ARG NGINX_SHA256=3cf46f5ed7504d460125866b7bea99fb357f31d887e2e63b35503310e9b8b6c8
ARG NGX_BROTLI_COMMIT=a71f9312c2deb28875acc7bacfdd5695a111aa53
ARG BROTLI_COMMIT=db24a98aed38a16de78cc05ca15cdd8dc2a0d92d

RUN apk add --no-cache --virtual .build-deps \
      build-base \
      cmake \
      git \
      linux-headers \
      openssl-dev \
      pcre2-dev \
      zlib-dev \
    && wget -q "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" -O /tmp/nginx.tar.gz \
    && printf '%s  %s\n' "$NGINX_SHA256" /tmp/nginx.tar.gz | sha256sum -c - \
    && tar -xzf /tmp/nginx.tar.gz -C /tmp \
    && git init /tmp/ngx_brotli \
    && git -C /tmp/ngx_brotli remote add origin https://github.com/google/ngx_brotli.git \
    && git -C /tmp/ngx_brotli fetch --depth 1 origin "$NGX_BROTLI_COMMIT" \
    && git -C /tmp/ngx_brotli checkout --detach FETCH_HEAD \
    && git -C /tmp/ngx_brotli submodule update --init --recursive \
    && git -C /tmp/ngx_brotli/deps/brotli fetch --depth 1 origin "$BROTLI_COMMIT" \
    && git -C /tmp/ngx_brotli/deps/brotli checkout --detach "$BROTLI_COMMIT" \
    && cmake -S /tmp/ngx_brotli/deps/brotli -B /tmp/ngx_brotli/deps/brotli/out \
      -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_SHARED_LIBS=OFF \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
    && cmake --build /tmp/ngx_brotli/deps/brotli/out --config Release --target brotlienc brotlicommon \
    && configure_args="$(nginx -V 2>&1 | sed -n 's/^configure arguments: //p')" \
    && test -n "$configure_args" \
    && case " $configure_args " in *" --with-compat "*) ;; *) echo 'Base Nginx was built without --with-compat.' >&2; exit 1 ;; esac \
    && eval "set -- $configure_args" \
    && cd "/tmp/nginx-${NGINX_VERSION}" \
    && ./configure "$@" --add-dynamic-module=/tmp/ngx_brotli \
    && make -j2 modules \
    && test -s objs/ngx_http_brotli_filter_module.so

FROM nginx:1.30.6-alpine-slim

RUN apk add --no-cache libstdc++ \
    && mkdir -p /etc/nginx/modules /usr/lib/nginx/modules

COPY --from=brotli-builder \
  /tmp/nginx-1.30.6/objs/ngx_http_brotli_filter_module.so \
  /usr/lib/nginx/modules/ngx_http_brotli_filter_module.so

RUN { \
      printf '%s\n' 'load_module /usr/lib/nginx/modules/ngx_http_brotli_filter_module.so;'; \
      cat /etc/nginx/nginx.conf; \
    } > /tmp/nginx.conf \
    && mv /tmp/nginx.conf /etc/nginx/nginx.conf
