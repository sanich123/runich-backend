FROM node:26-alpine AS yarn-base

WORKDIR /usr/src/app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/patches .yarn/patches

RUN npm install --global @yarnpkg/cli-dist@4.18.0 \
  && yarn --version

FROM yarn-base AS builder

ENV NODE_ENV=development

RUN yarn install --immutable

COPY . .

RUN yarn db:generate && yarn build

FROM yarn-base AS runtime

ENV NODE_ENV=production

# Reuse the dependencies already installed and built by the builder. A second
# production-only Yarn install exceeds the memory available on Timeweb.
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /usr/src/app/assets ./assets

EXPOSE 3000

CMD ["yarn", "start:prod"]
