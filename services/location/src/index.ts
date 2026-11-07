import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { guard } from "../../shared/guard";
import { inThailand, reverseGeocode, type Db } from "./reverse";
import { ensureSeed } from "./seed";

const prisma = new PrismaClient();
const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));
app.use("*", guard());
const th = (a: { nameTh: string }, b: { nameTh: string }) => a.nameTh.localeCompare(b.nameTh, "th");

app.get("/provinces", async (c) => c.json((await prisma.province.findMany({ select: { code: true, nameTh: true } })).sort(th)));
app.get("/districts", async (c) => {
  const province = c.req.query("province");
  return c.json(province ? (await prisma.district.findMany({ where: { provinceCode: province }, select: { code: true, nameTh: true } })).sort(th) : []);
});
app.get("/subdistricts", async (c) => {
  const district = c.req.query("district");
  return c.json(district ? (await prisma.subdistrict.findMany({ where: { districtCode: district }, select: { code: true, nameTh: true } })).sort(th) : []);
});
// service อื่นใช้ตรวจว่าจังหวัด > เขต > ตำบล สัมพันธ์กัน พร้อมรับชื่อกลับไป
app.get("/validate", async (c) => {
  const { province, district, subdistrict } = c.req.query();
  const p = province ? await prisma.province.findUnique({ where: { code: province } }) : null;
  if (!p) return c.json({ ok: false, error: "ไม่พบจังหวัด" });
  const d = district ? await prisma.district.findFirst({ where: { code: district, provinceCode: p.code } }) : null;
  if (district && !d) return c.json({ ok: false, error: "เขตไม่อยู่ในจังหวัดที่เลือก" });
  const s = subdistrict && d ? await prisma.subdistrict.findFirst({ where: { code: subdistrict, districtCode: d.code } }) : null;
  if (subdistrict && !s) return c.json({ ok: false, error: "ตำบลไม่อยู่ในเขตที่เลือก" });
  return c.json({ ok: true, province: { nameTh: p.nameTh }, district: d && { nameTh: d.nameTh }, subdistrict: s && { nameTh: s.nameTh } });
});

// GPS → จังหวัด/เขต/แขวง (หน้าเว็บใช้เติมและล็อกช่องตำแหน่งให้ตามพิกัด)
const db: Db = {
  provinces: () => prisma.province.findMany({ select: { code: true, nameTh: true } }),
  districts: (provinceCode) => prisma.district.findMany({ where: { provinceCode }, select: { code: true, nameTh: true } }),
  subdistricts: (districtCode) => prisma.subdistrict.findMany({ where: { districtCode }, select: { code: true, nameTh: true } }),
};
app.get("/reverse", async (c) => {
  const lat = Number(c.req.query("lat")), lng = Number(c.req.query("lng"));
  if (!c.req.query("lat") || !c.req.query("lng") || !Number.isFinite(lat) || !Number.isFinite(lng)) return c.json({ ok: false, error: "พิกัดไม่ถูกต้อง" }, 400);
  if (!inThailand(lat, lng)) return c.json({ ok: false, error: "ตำแหน่งปัจจุบันอยู่นอกประเทศไทย" });
  try {
    const place = await reverseGeocode(db, lat, lng);
    return c.json(place ? { ok: true, ...place } : { ok: false, error: "ระบุจังหวัด/เขตจากตำแหน่งไม่ได้" });
  } catch (e) {
    console.error("reverse failed:", (e as Error).message);
    return c.json({ ok: false, error: "บริการค้นหาที่อยู่จากพิกัดไม่พร้อมใช้งาน" }, 502);
  }
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4001) });
(async () => { for (;;) { try { return await ensureSeed(prisma); } catch (e) { console.error("seed failed, retry in 30s:", (e as Error).message); await new Promise((r) => setTimeout(r, 30000)); } } })();
