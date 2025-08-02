FROM node:24-alpine AS base

WORKDIR /usr/src/app

COPY package.json ./

COPY package-lock.json ./

RUN npm install --omit=dev

COPY . .

RUN npx prisma generate

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:migrate:prod"]
