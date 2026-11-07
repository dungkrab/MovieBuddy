-- สร้าง database + user แยกต่อ service บน RDS PostgreSQL (หลักการเดิม: 1 service = 1 database)
-- รันครั้งเดียวด้วย master user ของ RDS ส่งรหัสผ่านผ่านตัวแปร (ไม่ต้องเขียนลงไฟล์):
--   psql "host=<rds-endpoint> user=<master> dbname=postgres sslmode=require" \
--        -v location_pw='...' -v cinema_pw='...' -v groups_pw='...' -v auth_pw='...' -v chat_pw='...' -f infra/rds-bootstrap.sql
-- แต่ละ user เป็นเจ้าของ database ของตัวเอง (ให้ `prisma db push` สร้างตารางได้) และเข้า database ของ service อื่นไม่ได้
-- บน RDS master ต้องเป็นสมาชิกของ role ก่อนจึงสั่ง CREATE DATABASE ... OWNER role นั้นได้ จึงมี GRANT ... TO CURRENT_USER

CREATE ROLE location_app LOGIN PASSWORD :'location_pw';
CREATE ROLE cinema_app   LOGIN PASSWORD :'cinema_pw';
CREATE ROLE groups_app   LOGIN PASSWORD :'groups_pw';
CREATE ROLE auth_app     LOGIN PASSWORD :'auth_pw';
CREATE ROLE chat_app     LOGIN PASSWORD :'chat_pw';

GRANT location_app, cinema_app, groups_app, auth_app, chat_app TO CURRENT_USER;

CREATE DATABASE location OWNER location_app;
CREATE DATABASE cinema   OWNER cinema_app;
CREATE DATABASE groups   OWNER groups_app;
CREATE DATABASE auth     OWNER auth_app;
CREATE DATABASE chat     OWNER chat_app;

REVOKE ALL ON DATABASE location FROM PUBLIC;
REVOKE ALL ON DATABASE cinema   FROM PUBLIC;
REVOKE ALL ON DATABASE groups   FROM PUBLIC;
REVOKE ALL ON DATABASE auth     FROM PUBLIC;
REVOKE ALL ON DATABASE chat     FROM PUBLIC;
