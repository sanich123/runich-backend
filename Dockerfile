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
RUN touch .builder-complete

FROM yarn-base AS production-dependencies

ENV NODE_ENV=production HUSKY=0

# Keep the two large Yarn installs sequential on memory-constrained builders.
COPY --from=builder /usr/src/app/.builder-complete .builder-complete
RUN yarn workspaces focus --all --production
RUN rm .builder-complete

FROM production-dependencies AS runtime

ENV NODE_ENV=production

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /usr/src/app/assets ./assets

EXPOSE 3000

CMD ["yarn", "start:prod"]
