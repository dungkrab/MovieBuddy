FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app/services/group
COPY services/group/package.json ./
RUN npm install
COPY services/shared /app/services/shared
COPY services/group .
RUN npx prisma generate
ENV NODE_ENV=production PORT=4005
EXPOSE 4005
CMD ["sh","-c","npx prisma db push --skip-generate && npx tsx src/index.ts"]
