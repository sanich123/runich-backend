FROM node:26-alpine AS base

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package.json yarn.lock .yarnrc.yml ./

RUN npm install --global @yarnpkg/cli-dist@4.18.0 \
  && yarn install --immutable

COPY . .

RUN yarn prisma generate

RUN yarn build

EXPOSE 3000

CMD ["yarn", "start:migrate:prod"]
