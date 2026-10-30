FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app/services/movie
COPY services/movie/package.json ./
RUN npm install
COPY services/shared /app/services/shared
COPY services/movie .
ENV NODE_ENV=production PORT=4004
EXPOSE 4004
CMD ["npx","tsx","src/index.ts"]
