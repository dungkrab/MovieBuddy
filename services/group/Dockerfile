FROM node:20-alpine
RUN apk add --no-cache openssl ca-certificates \
 && wget -q -O /usr/local/share/ca-certificates/rds-global-bundle.crt https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
 && update-ca-certificates
WORKDIR /app/services/group
COPY services/group/package.json ./
RUN npm install
COPY services/shared /app/services/shared
COPY services/group .
RUN npx prisma generate
ENV NODE_ENV=production PORT=4005
EXPOSE 4005
CMD ["sh","-c","npx prisma db push --skip-generate && npx tsx src/index.ts"]
