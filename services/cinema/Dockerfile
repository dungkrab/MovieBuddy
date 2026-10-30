FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app/services/cinema
COPY services/cinema/package.json ./
RUN npm install
COPY services/shared /app/services/shared
COPY services/cinema .
RUN npx prisma generate
ENV NODE_ENV=production PORT=4002
EXPOSE 4002
CMD ["sh","-c","npx prisma db push --skip-generate && npx tsx src/index.ts"]
