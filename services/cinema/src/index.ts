import { serve } from "@hono/node-server";
import { Prisma, PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { guard } from "../../shared/guard";
import { cinemas } from "./cinemas.seed";

const prisma = new PrismaClient();
const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));
app.use("*", guard());

// ค้นตามรัศมีใน Postgres เอง: กรอบสี่เหลี่ยม (ใช้ index lat,lng) แล้วค่อยคำนวณ Haversine เฉพาะแถวที่อยู่ในกรอบ
// ไม่ต้องดึงสาขาทั้งประเทศมากรองใน Node และไม่ต้องใช้ extension เพิ่ม (RDS ใช้ได้ทันที)
// หมายเหตุ: ใส่ ::float8 ให้ทุกพารามิเตอร์ เพราะ Prisma อาจส่งเลขจำนวนเต็มเป็น bigint ทำให้ฟังก์ชัน radians()/sin() หาไม่เจอ
type CinemaRow = { id: number; chain: string; name: string; provinceCode: string; districtCode: string; address: string; lat: number; lng: number; distanceKm: number | null };
const COLS = Prisma.sql`id, chain, name, province_code AS "provinceCode", district_code AS "districtCode", address, lat, lng`;

app.get("/cinemas", async (c) => {
  const q = c.req.query();
  const lat = q.lat ? Number(q.lat) : NaN, lng = q.lng ? Number(q.lng) : NaN;
  const area = [q.province && Prisma.sql`province_code = ${q.province}`, q.district && Prisma.sql`district_code = ${q.district}`].filter(Boolean) as Prisma.Sql[];
  const areaWhere = area.length ? Prisma.sql`WHERE ${Prisma.join(area, " AND ")}` : Prisma.empty;

  if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    const rows = await prisma.$queryRaw<CinemaRow[]>`SELECT ${COLS}, NULL::float8 AS "distanceKm" FROM cinemas ${areaWhere} ORDER BY name`;
    return c.json(rows);
  }
  const radius = Math.min(Number(q.radius) || 10, 200);
  const dLat = radius / 111.32, dLng = radius / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const rows = await prisma.$queryRaw<CinemaRow[]>`
    SELECT ${COLS}, d AS "distanceKm" FROM (
      SELECT *, 6371 * 2 * asin(sqrt(least(1,
        power(sin(radians(lat - ${lat}::float8) / 2), 2) +
        cos(radians(${lat}::float8)) * cos(radians(lat)) * power(sin(radians(lng - ${lng}::float8) / 2), 2)))) AS d
      FROM cinemas
      ${areaWhere}${area.length ? Prisma.sql` AND ` : Prisma.sql`WHERE `}
        lat BETWEEN ${lat - dLat}::float8 AND ${lat + dLat}::float8
        AND lng BETWEEN ${lng - dLng}::float8 AND ${lng + dLng}::float8
    ) t WHERE d <= ${radius}::float8 ORDER BY d, name`;
  return c.json(rows);
});
app.get("/cinemas/:id", async (c) => {
  const row = await prisma.cinema.findUnique({ where: { id: Number(c.req.param("id")) || 0 } });
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4002) });
prisma.cinema.count().then(async (n) => { if (n === 0) { await prisma.cinema.createMany({ data: cinemas }); console.log("cinema seed done"); } }).catch((e) => console.error("seed failed", e));
