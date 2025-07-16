# Use a Node.js base image (e.g., LTS version for stability)
FROM node:20-alpine AS base

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or yarn.lock/pnpm-lock.yaml)
# This allows Docker to cache the dependency installation layer
COPY package.json ./
COPY package-lock.json ./

# Install project dependencies
RUN npm install

# Copy the entire application source code
COPY . .

# Generate Prisma Client (essential for Prisma to work)

RUN npx prisma generate

# Build the NestJS application (transpiles TypeScript to JavaScript)
RUN npm run build

# Expose the port your NestJS application listens on (default is 3000)
EXPOSE 3000

# Define the command to run your application in production mode
CMD ["npm", "run", "start:migrate:prod"]
