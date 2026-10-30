import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { guard } from "../../shared/guard";
import { cinemas } from "./cinemas.seed";

const prisma = new PrismaClient();
const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));
app.use("*", guard());

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

app.get("/cinemas", async (c) => {
  const q = c.req.query();
  const rows = await prisma.cinema.findMany({
    where: { ...(q.province && { provinceCode: q.province }), ...(q.district && { districtCode: q.district }) },
    orderBy: { name: "asc" },
  });
  const lat = q.lat ? Number(q.lat) : NaN, lng = q.lng ? Number(q.lng) : NaN;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return c.json(rows.map((r) => ({ ...r, distanceKm: null })));
  const radius = Number(q.radius) || 10;
  return c.json(rows.map((r) => ({ ...r, distanceKm: haversineKm({ lat, lng }, r) })).filter((r) => r.distanceKm <= radius).sort((a, b) => a.distanceKm - b.distanceKm));
});
app.get("/cinemas/:id", async (c) => {
  const row = await prisma.cinema.findUnique({ where: { id: Number(c.req.param("id")) || 0 } });
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4002) });
prisma.cinema.count().then(async (n) => { if (n === 0) { await prisma.cinema.createMany({ data: cinemas }); console.log("cinema seed done"); } }).catch((e) => console.error("seed failed", e));
