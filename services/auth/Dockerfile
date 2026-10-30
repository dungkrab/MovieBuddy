FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app/services/auth
COPY services/auth/package.json ./
RUN npm install
COPY services/shared /app/services/shared
COPY services/auth .
RUN npx prisma generate
ENV NODE_ENV=production PORT=4006
EXPOSE 4006
CMD ["sh","-c","npx prisma db push --skip-generate && npx tsx src/index.ts"]
