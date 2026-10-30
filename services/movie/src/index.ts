import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { guard } from "../../shared/guard";
import { getGenres, getMovieDetail, getReleaseInfo, listMovies } from "./tmdb";

const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));
app.use("*", guard());
const fail = (c: any, e: unknown) => c.json({ error: (e as Error).message }, /→ 404/.test((e as Error).message) ? 404 : 502);
const todayTH = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

// กำลังฉาย = วันเข้าโรงของไทย <= วันนี้ | เข้าเร็วๆ นี้ = วันเข้าโรง > วันนี้ (TMDB บางเรื่องอยู่ผิดหมวด)
app.get("/movies", async (c) => {
  const status = c.req.query("status") === "upcoming" ? "upcoming" : "now_playing";
  try {
    const today = todayTH();
    const list = await listMovies(status);
    const movies = (await Promise.all(list.map(async (m) => {
      const info = await getReleaseInfo(m.id);
      return { ...m, certification: info.certification, release_date: info.releaseDate ?? m.release_date };
    }))).filter((m) => { const rd: string = m.release_date || ""; return status === "now_playing" ? !rd || rd <= today : rd > today; });
    return c.json({ movies });
  } catch (e) { return fail(c, e); }
});
app.get("/movies/:id", async (c) => { try { return c.json(await getMovieDetail(Number(c.req.param("id")))); } catch (e) { return fail(c, e); } });
app.get("/genres", async (c) => { try { return c.json(await getGenres()); } catch (e) { return fail(c, e); } });

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4004) });
