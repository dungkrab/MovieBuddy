import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { guard } from "../../shared/guard";
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

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4001) });
(async () => { for (;;) { try { return await ensureSeed(prisma); } catch (e) { console.error("seed failed, retry in 30s:", (e as Error).message); await new Promise((r) => setTimeout(r, 30000)); } } })();
