# ตัวจำลอง Amazon Cognito สำหรับเทสต์บนเครื่อง (ไม่ใช้ใน production)
FROM node:20-alpine
RUN npm install -g cognito-local@5.3.0
WORKDIR /data
# config.json ถูกอ่านจาก /data/.cognito (ข้อมูลผู้ใช้ก็เก็บที่นี่ → mount volume ไว้ไม่ให้หาย)
COPY config.json /data/.cognito/config.json
EXPOSE 9229
CMD ["cognito-local"]
