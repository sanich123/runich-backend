FROM node:lts-alpine AS base

WORKDIR /usr/src/app

COPY package.json ./

COPY package-lock.json ./

RUN npm install --only=prod

COPY . .

RUN npx prisma generate

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:migrate:prod"]
