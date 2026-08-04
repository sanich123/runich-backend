FROM node:24-alpine AS base

WORKDIR /usr/src/app

COPY package.json yarn.lock .yarnrc.yml ./

RUN corepack enable && yarn install --immutable

COPY . .

RUN yarn prisma generate

RUN yarn build

EXPOSE 3000

CMD ["yarn", "start:migrate:prod"]
