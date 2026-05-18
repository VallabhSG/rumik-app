FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app

# better-sqlite3 needs python/make for native build
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

ENV PORT=4000
ENV DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 4000

CMD ["node", "dist/index.js"]
