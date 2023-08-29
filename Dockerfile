FROM node:18-alpine

WORKDIR /app
ENV NODE_ENV production
COPY package*.json ./
COPY prisma ./prisma

RUN npm ci --only=production

COPY . .

RUN npm run build

EXPOSE 4000
CMD [ "npm", "run", "start:migrate:prod" ]