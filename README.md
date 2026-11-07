# ดูหนังเข้าโรงใกล้ฉัน — Microservices

```
Browser → Caddy (HTTPS) → web (Next.js, BFF) ──► movie ──► TMDB (+ Redis cache)
                                             ├─► location  (Postgres: locations)
                                             ├─► cinema    (Postgres: cinema)
                                             ├─► showtime  (ไม่มี DB — ShowtimeProvider)
                                             ├─► group ──► location (ตรวจพื้นที่)   (Postgres: groups)
                                             ├─► chat  ──► group (ตรวจสมาชิก)       (Postgres: chat, SSE)
                                             └─► auth  ──► Amazon Cognito           (Postgres: auth = id ภายใน/ชื่อ)
```
| service | พอร์ต | หน้าที่ |
|---|---|---|
| web | 3000 | UI + API สำหรับ browser, ตรวจ session กับ auth, ประกอบข้อมูลข้าม service, ตั้ง cookie, proxy สตรีมแชท |
| location | 4001 | จังหวัด/เขต/ตำบล (รหัสกรมการปกครอง), `/validate`, `/reverse` (พิกัด→พื้นที่) |
| cinema | 4002 | สาขา, ค้นหาตามพื้นที่/รัศมี (Haversine ใน SQL) |
| showtime | 4003 | `ShowtimeProvider` (Mock → แหล่งจริง) |
| movie | 4004 | TMDB + แคช 6 ชม. (Redis; fallback หน่วยความจำ), เจ้าของ `TMDB_ACCESS_TOKEN` |
| group | 4005 | สร้าง/เข้าร่วม/ค้นหากลุ่ม (ไม่มี FK ข้าม service, เก็บชื่อพื้นที่ซ้ำตอนสร้าง) |
| auth | 4006 | สมัคร/ล็อกอินด้วยเบอร์ + รหัสผ่านผ่าน **Amazon Cognito**, ตรวจ JWT (JWKS), map `sub` → id ภายใน |
| chat | 4007 | แชทกลุ่ม: ส่ง/ประวัติ/สตรีมสด (SSE), ให้เฉพาะสมาชิกกลุ่ม, ข้อความหายพร้อมกลุ่ม |


หลักการ: 1 service = 1 database, ไม่อ่านตารางข้ามกัน, service เปิดเฉพาะในเครือข่ายภายใน เรียกได้ด้วย `x-internal-key` (web ส่งตัวตนผู้ใช้ผ่าน `x-user-id`/`x-user-name`)

## รันด้วย Docker Compose (เทสต์บนเครื่อง — ไม่ต้องมีบัญชี AWS)
```bash
cp .env.example .env     # ใส่ INTERNAL_KEY (≥16 ตัว) และ TMDB_ACCESS_TOKEN; COMPOSE_PROFILES=local-db,local-auth มาให้แล้ว
docker compose up --build
```
เปิด http://localhost:3000 (ต้องใช้ Docker Compose ≥ 2.20) — location/cinema seed ตัวเองเมื่อ DB ว่าง (location ต้องออกเน็ตไป GitHub) ตารางสร้างด้วย `prisma db push` ตอนสตาร์ท
- **ล็อกอินบน local:** คอนเทนเนอร์ `cognito-local` จำลอง Cognito (API เดียวกับของจริง) และ auth สร้าง user pool ให้เองตอนสตาร์ท — สมัครด้วยเบอร์โทร แล้วดู **รหัส SMS** ได้จาก `docker compose logs -f cognito-local` (ไม่มี SMS จริงถูกส่ง)
- ข้อจำกัดของตัวจำลอง: "ลืมรหัสผ่าน" (ForgotPassword ของเบอร์โทร) และ "ส่งรหัสอีกครั้ง" ยังไม่รองรับ — ใช้ได้เฉพาะบน Cognito จริง; ถ้าสมัครค้างไว้ให้ล้างข้อมูลจำลอง `docker compose down` แล้วลบ volume `cognito-data`
- ถ้าเคยรันเวอร์ชันก่อนมี chat: volume Postgres เดิมยังไม่มี database `chat` → `docker compose exec db psql -U movie -d postgres -c "CREATE DATABASE chat"`; และตาราง `otp_codes`/`sessions` ของระบบ OTP เดิมเลิกใช้แล้ว (ถ้ามีข้อมูลค้างให้ `DROP TABLE` ก่อน มิฉะนั้น `db push` จะไม่ยอมลบ) — ผู้ใช้เก่าจะถูกผูกกับบัญชี Cognito อัตโนมัติด้วยเบอร์โทรเมื่อสมัคร/ล็อกอินครั้งแรก

## ล็อกอินด้วย Amazon Cognito
ใช้เบอร์โทร + รหัสผ่าน; สมัครครั้งแรกต้องยืนยันรหัส SMS (Cognito ส่งผ่าน SNS) — Twilio ถูกถอดออกแล้ว
- auth-service คุยกับ Cognito ด้วย AWS SDK v3 (`SignUp / ConfirmSignUp / InitiateAuth / RefreshToken / RevokeToken / ForgotPassword`) โค้ดชุดเดียวกันทั้ง local และ AWS ต่างกันที่ `COGNITO_ENDPOINT`
- web เก็บ access token + refresh token ใน cookie HttpOnly เท่านั้น; ทุกคำขอ auth ตรวจลายเซ็น JWT กับ JWKS ของ user pool (issuer, `token_use=access`, `client_id`) และ refresh ให้เองเมื่อหมดอายุ
- Logout เพิกถอน refresh token ที่ Cognito; access token ที่ออกไปแล้วยังใช้ได้จนหมดอายุ (ตั้งอายุสั้นที่ app client)
- **สร้างบน AWS:** (1) Cognito User Pool: sign-in = phone number, auto-verify phone, ตั้ง SMS (SNS role) และ password policy ≥ 8 ตัว + ตัวเลข (2) App client แบบ public (ไม่มี secret) เปิด `ALLOW_USER_PASSWORD_AUTH` และ `ALLOW_REFRESH_TOKEN_AUTH` (3) ตั้งค่าใน `.env`: `COGNITO_ENDPOINT=` (ว่าง), `AWS_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, และเอา `local-auth` ออกจาก `COMPOSE_PROFILES` — สิ่งที่ต้องตรวจเอง: SNS SMS ยังอยู่ใน sandbox/มี spending limit หรือไม่ และข้อกำหนดการส่ง SMS ไปไทย
- production ไม่ต้องมี IAM credentials สำหรับ auth-service (operation ฝั่งผู้ใช้ของ Cognito ไม่ต้องเซ็น)

## แชทกลุ่ม
เข้าจากปุ่ม "💬 แชทกลุ่ม" ในหน้า "กลุ่มของฉัน" (`/groups/<id>`) เฉพาะสมาชิกกลุ่ม
- ส่ง: `POST /api/groups/:id/chat`; ประวัติ: `GET …/chat`; สตรีมสด: `GET …/chat/stream` (Server-Sent Events) — ต่อใหม่อัตโนมัติและเติมข้อความที่พลาดด้วย `Last-Event-ID`
- สิทธิ์ถูกถาม group-service ทุกครั้ง (`/groups/:id/membership`); จำกัด 10 ข้อความ/10 วินาทีต่อคน, ยาวสุด 1,000 ตัวอักษร
- ข้อความหมดอายุพร้อมกลุ่ม (ลบอัตโนมัติ) และสตรีมปิดเองเมื่อกลุ่มหมดอายุ
- ข้อจำกัด: ตัวกระจายข้อความสดอยู่ในหน่วยความจำของ chat-service → รันได้ 1 instance (ขยายเป็นหลายตัวต้องเพิ่ม Redis pub/sub); ยังไม่มีแก้ไข/ลบข้อความ, แจ้งเตือนขณะไม่ได้เปิดหน้า, ส่งรูป

## ฐานข้อมูล: AWS RDS PostgreSQL
ทุก service ที่ใช้ DB (location, cinema, group, auth, chat) อ่าน `DATABASE_URL` เหมือนเดิม — ย้ายไป RDS แค่เปลี่ยนค่า ไม่ต้องแก้โค้ด
1. สร้าง RDS PostgreSQL (แนะนำ 15+ อยู่ VPC เดียวกับ EC2, security group เปิดพอร์ต 5432 เฉพาะจาก security group ของ EC2)
2. สร้าง database + user แยกต่อ service: `psql "host=<endpoint> user=<master> dbname=postgres sslmode=require" -v location_pw=… -v cinema_pw=… -v groups_pw=… -v auth_pw=… -v chat_pw=… -f infra/rds-bootstrap.sql`
3. ตั้งค่า `DB_LOCATION / DB_CINEMA / DB_GROUPS / DB_AUTH / DB_CHAT` (ดูตัวอย่างใน `.env.example`) ต่อท้ายด้วย `?sslmode=require&connection_limit=5`
4. Dockerfile ใส่ RDS CA bundle เข้า trust store ของ image แล้ว (ดาวน์โหลดจาก `truststore.pki.rds.amazonaws.com` ตอน build) เพื่อให้ตรวจใบรับรองของ RDS ได้
- ใช้ RDS: เอา `local-db` ออกจาก `COMPOSE_PROFILES` ใน `.env` แล้ว `docker compose up --build` (ไม่สตาร์ท container `db` ในเครื่อง)
- ค้นสาขาตามรัศมี GPS ทำใน Postgres (กรอบ lat/lng + Haversine ด้วย SQL ธรรมดา ไม่ต้องใช้ PostGIS); ถ้าสาขาเยอะมากค่อยพิจารณา PostGIS + GiST (RDS รองรับ)
- ยังใช้ `prisma db push` ตอนสตาร์ทเหมือนเดิม — ก่อนขึ้น production จริงควรเปลี่ยนเป็น `prisma migrate deploy` (รันเป็นขั้นตอนเดียวก่อน `up` — ตอนนี้รัน service ละ 1 container จึงยังไม่ชน)

## GPS → จังหวัด/เขต
กด "ใช้ตำแหน่งปัจจุบัน" → เบราว์เซอร์ส่งพิกัด → `GET /api/locations/reverse` → location service แปลงพิกัดด้วย Nominatim แล้วจับคู่กับรหัสจังหวัด/เขต/แขวงในฐานข้อมูล → หน้าแรกเติมช่องจังหวัด/เขตและ **ล็อก** ไว้ตามพิกัด (กด "ปิดตำแหน่งปัจจุบัน" เพื่อแก้เอง); หน้ากลุ่มเติมเขต/แขวงให้ด้วย
- Geolocation ของเบราว์เซอร์ใช้ได้เฉพาะ **HTTPS** (หรือ localhost) — ใช้ Caddy ตามหัวข้อ Deploy ด้านล่าง
- location service ต้องออกอินเทอร์เน็ตไปหา `NOMINATIM_URL` ได้ (ตั้ง `GEOCODER_USER_AGENT` ด้วย); Nominatim สาธารณะไม่เหมาะกับโหลดจริง

## Deploy บน AWS (EC2 + Docker Compose + RDS + Cognito)
ไม่ใช้ Kubernetes — รันทุก service ด้วย Docker Compose บน EC2 เครื่องเดียว หน้าบ้านเป็น Caddy ที่ขอใบรับรอง HTTPS ให้เอง
1. สร้าง RDS PostgreSQL และ Cognito User Pool ตามหัวข้อด้านบน; EC2 (Docker + Compose ≥ 2.20) อยู่ VPC เดียวกับ RDS
2. ชี้ DNS ของโดเมนมาที่ EC2 และเปิด security group เฉพาะพอร์ต 80/443 (ห้ามเปิด 3000/5433/9229 — ผูกกับ 127.0.0.1 อยู่แล้ว)
3. `.env` (สิทธิ์ `chmod 600`; ถ้าต้องการเก็บความลับนอกไฟล์ ให้ดึงจาก Secrets Manager/SSM ก่อนสตาร์ท): `INTERNAL_KEY`, `TMDB_ACCESS_TOKEN`, `DB_*` (RDS), `COGNITO_*`, `SITE_ADDRESS=ชื่อโดเมน`, `COMPOSE_PROFILES=edge`
4. `docker compose up -d --build` แล้วเปิด https://ชื่อโดเมน
- เครื่องเดียว = ไม่มี high availability; ถ้าต้องการหลายเครื่อง/ปรับขนาดอัตโนมัติ ให้พิจารณา ECS Fargate (image เดิมใช้ได้) และต้องย้ายตัวกระจายข้อความแชทไป Redis ก่อน

## เปลี่ยนแหล่งรอบฉายจริง
- `services/showtime/src/index.ts` เปลี่ยน `provider` เป็นตัวที่ `implements ShowtimeProvider`

## ข้อจำกัดที่ควรรู้
ยังไม่เคยรันทั้งระบบผ่าน Docker จริง (ทดสอบรายส่วนด้วย Postgres 16 + ตัวจำลอง Cognito + Next dev server); ไม่มี rate limit ต่อ IP, tracing, CI/CD; session ถูกตรวจกับ auth ทุกคำขอ (ตรวจ JWT ในเครื่อง ไม่แคชผู้ใช้); `prisma db push` เหมาะกับช่วงพัฒนา

## กติกากลุ่ม / การกรองหนัง
- ค้นหาชื่อหนังที่หน้าแรก; ค้นหาชื่อกลุ่ม/ชื่อหนังที่หน้า "กลุ่มของฉัน" (แสดงเฉพาะกลุ่มที่เข้าร่วม)
- 1 คนเป็นเจ้าของกลุ่มได้ 1 กลุ่มที่รอบหนังยังไม่จบ — สร้างใหม่ได้เมื่อลบกลุ่มเดิม (เฉพาะเจ้าของ) หรือรอบหนังจบ
- ต้องระบุวันเวลารอบหนัง; รอบจบ = เวลานัด + ความยาวหนัง (ไม่ทราบใช้ 120 นาที); กลุ่มถูกลบอัตโนมัติ 12 ชม. หลังรอบจบ (group-service ล้างทุก 30 นาที)
- หลังรอบจบ: คนนอกกลุ่มไม่เห็น/เข้าร่วมไม่ได้, สมาชิกยังเห็นในหน้า "กลุ่มของฉัน" จนครบ 12 ชม.
- หนัง "กำลังฉาย" = วันเข้าโรงของไทย (release type 2/3 จาก TMDB) ≤ วันนี้ (เวลาไทย); "เข้าเร็วๆ นี้" = > วันนี้; หน้าหนังไม่แสดงรอบก่อนวันเข้าโรง
