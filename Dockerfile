FROM node:26-alpine AS base

WORKDIR /usr/src/app

COPY package.json yarn.lock .yarnrc.yml ./

RUN npm install --global yarn@4.18.0 \
  && yarn install --immutable

COPY . .

RUN yarn prisma generate

RUN yarn build

EXPOSE 3000

CMD ["yarn", "start:migrate:prod"]
