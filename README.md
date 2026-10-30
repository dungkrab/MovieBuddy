# ดูหนังเข้าโรงใกล้ฉัน — Microservices

```
Browser → ALB → web (Next.js, ทำหน้าที่ BFF) ──► movie ──► TMDB (+ Redis cache)
                                            ├─► location  (Postgres: locations)
                                            ├─► cinema    (Postgres: cinema)
                                            ├─► showtime  (ไม่มี DB — ShowtimeProvider)
                                            ├─► group ──► location (ตรวจพื้นที่)   (Postgres: groups)
                                            └─► auth      (Postgres: auth, SMS OTP)
```
| service | พอร์ต | หน้าที่ |
|---|---|---|
| web | 3000 | UI + API สำหรับ browser, ตรวจ session กับ auth, ประกอบข้อมูลข้าม service, ตั้ง cookie |
| location | 4001 | จังหวัด/เขต/ตำบล (รหัสกรมการปกครอง), `/validate` |
| cinema | 4002 | สาขา, ค้นหาตามพื้นที่/รัศมี (Haversine) |
| showtime | 4003 | `ShowtimeProvider` (Mock → แหล่งจริง) |
| movie | 4004 | TMDB + แคช 6 ชม. (Redis; fallback หน่วยความจำ), เจ้าของ `TMDB_ACCESS_TOKEN` |
| group | 4005 | สร้าง/เข้าร่วม/ค้นหากลุ่ม (ไม่มี FK ข้าม service, เก็บชื่อพื้นที่ซ้ำตอนสร้าง) |
| auth | 4006 | OTP เบอร์มือถือ, session, ผู้ใช้ |

หลักการ: 1 service = 1 database, ไม่อ่านตารางข้ามกัน, service เปิดเฉพาะในเครือข่ายภายใน เรียกได้ด้วย `x-internal-key` (web ส่งตัวตนผู้ใช้ผ่าน `x-user-id`/`x-user-name`)

## รันด้วย Docker Compose
```bash
cp .env.example .env     # ใส่ INTERNAL_KEY, AUTH_SECRET (≥32 ตัว) และ TMDB_ACCESS_TOKEN
docker compose up --build
```
เปิด http://localhost:3000 — location/cinema seed ตัวเองเมื่อ DB ว่าง (location ต้องออกเน็ตไป GitHub) ตารางสร้างด้วย `prisma db push` ตอนสตาร์ท (production ควรเปลี่ยนเป็น migration)
โหมด dev: OTP แสดงบนหน้าล็อกอิน/ใน `docker compose logs auth`

## Deploy บน AWS EKS
1. build/push image ของทุก service + web ไป ECR (`docker build -f services/<name>/Dockerfile -t <ecr>/movie-groups-<name> .` และ `-f web/Dockerfile` สำหรับ web — context คือโฟลเดอร์รากนี้)
2. RDS Postgres (สร้าง 4 database: location, cinema, groups, auth) + ElastiCache Redis
3. แก้ `REGISTRY`/โดเมนใน `k8s/*.yaml`, สร้าง Secret ตาม `k8s/01-secrets.example.yaml` (แนะนำ Secrets Manager)
4. `kubectl apply -f k8s/` (ต้องติดตั้ง AWS Load Balancer Controller และ CNI ที่รองรับ NetworkPolicy)

## เปลี่ยนแหล่งรอบฉายจริง / SMS จริง
- `services/showtime/src/index.ts` เปลี่ยน `provider` เป็นตัวที่ `implements ShowtimeProvider`
- `services/auth/src/sms/` เพิ่ม provider ที่ `implements SmsProvider` (ตั้ง `SMS_PROVIDER=twilio` + `TWILIO_*` สำหรับ Twilio)

## ข้อจำกัดที่ควรรู้
ยังไม่ได้รันทดสอบจริง; ไม่มี rate limit ต่อ IP, tracing, HPA, CI/CD; session ถูกตรวจกับ auth ทุกคำขอ (ยังไม่แคช); การแยกด้วย `prisma db push` เหมาะกับ dev เท่านั้น

## กติกากลุ่ม / การกรองหนัง
- ค้นหาชื่อหนังที่หน้าแรก; ค้นหาชื่อกลุ่ม/ชื่อหนังที่หน้า "กลุ่มของฉัน" (แสดงเฉพาะกลุ่มที่เข้าร่วม)
- 1 คนเป็นเจ้าของกลุ่มได้ 1 กลุ่มที่รอบหนังยังไม่จบ — สร้างใหม่ได้เมื่อลบกลุ่มเดิม (เฉพาะเจ้าของ) หรือรอบหนังจบ
- ต้องระบุวันเวลารอบหนัง; รอบจบ = เวลานัด + ความยาวหนัง (ไม่ทราบใช้ 120 นาที); กลุ่มถูกลบอัตโนมัติ 12 ชม. หลังรอบจบ (group-service ล้างทุก 30 นาที)
- หลังรอบจบ: คนนอกกลุ่มไม่เห็น/เข้าร่วมไม่ได้, สมาชิกยังเห็นในหน้า "กลุ่มของฉัน" จนครบ 12 ชม.
- หนัง "กำลังฉาย" = วันเข้าโรงของไทย (release type 2/3 จาก TMDB) ≤ วันนี้ (เวลาไทย); "เข้าเร็วๆ นี้" = > วันนี้; หน้าหนังไม่แสดงรอบก่อนวันเข้าโรง
