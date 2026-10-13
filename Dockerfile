ARG NODE_IMAGE=node:26.10.0-bookworm-slim

# MapLibre Native publishes the Node binary for glibc-based Ubuntu 24.04, not
# Alpine/musl. Reuse the official Node distribution while keeping Ubuntu 24.04
# as the actual builder and runtime base.
FROM ${NODE_IMAGE} AS node-runtime

FROM ubuntu:24.04 AS yarn-base

ENV PATH=/usr/local/bin:$PATH

WORKDIR /usr/src/app

COPY --from=node-runtime /usr/local /usr/local

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/patches .yarn/patches

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    ca-certificates \
    curl \
    libatomic1 \
    libcurl4t64 \
    libegl1 \
    libfontconfig1 \
    libfreetype6 \
    libgl1 \
    libgl1-mesa-dri \
    libglfw3 \
    libglx0 \
    libicu74 \
    libjpeg-turbo8 \
    libopengl0 \
    libpng16-16t64 \
    libstdc++6 \
    libuv1t64 \
    libwebp7 \
    libx11-6 \
    libxext6 \
    libxrender1 \
    tini \
    xauth \
    xvfb \
    zlib1g \
  && npm install --global @yarnpkg/cli-dist@4.18.0 \
  && yarn --version

FROM yarn-base AS builder

ENV NODE_ENV=development

RUN yarn install --immutable

COPY . .

RUN yarn db:generate && yarn prisma migration check && yarn build

# Fail the image build if the native MapLibre module cannot load/render in the
# same Linux runtime that will execute production imports.
RUN yarn maplibre:smoke

FROM yarn-base AS runtime

ENV NODE_ENV=production

LABEL org.opencontainers.image.source="https://github.com/sanich123/runich-backend"

# Reuse the dependencies already installed and built by the builder. A second
# production-only Yarn install exceeds the memory available on Timeweb.
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/migrations ./migrations
COPY --from=builder /usr/src/app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /usr/src/app/assets ./assets
COPY --from=builder /usr/src/app/scripts/send-deployment-success-email.mjs ./scripts/send-deployment-success-email.mjs
COPY --from=builder /usr/src/app/scripts/send-daily-metrics-email.mjs ./scripts/send-daily-metrics-email.mjs

EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["yarn", "start:prod"]
