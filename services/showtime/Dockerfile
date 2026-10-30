FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app/services/showtime
COPY services/showtime/package.json ./
RUN npm install
COPY services/shared /app/services/shared
COPY services/showtime .
ENV NODE_ENV=production PORT=4003
EXPOSE 4003
CMD ["npx","tsx","src/index.ts"]
