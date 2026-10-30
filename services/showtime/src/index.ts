import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { guard } from "../../shared/guard";
import { MockShowtimeProvider } from "./mock";
import type { ShowtimeProvider } from "./provider";

// เปลี่ยนแหล่งข้อมูลจริงที่นี่ (implements ShowtimeProvider)
const provider: ShowtimeProvider = new MockShowtimeProvider();
const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));
app.use("*", guard());

const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500) : []);
app.post("/showtimes", async (c) => {
  const b = await c.req.json().catch(() => null);
  const date = String(b?.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "invalid date" }, 400);
  const slots = await provider.getShowtimes({ cinemaIds: ids(b?.cinemaIds), movieIds: ids(b?.movieIds), date });
  return c.json({ isMock: provider.isMock, slots });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4003) });
