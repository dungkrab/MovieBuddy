import { NextResponse } from "next/server";
import { todayTH } from "@/lib/geo";
import { call } from "@/lib/svc";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") === "upcoming" ? "upcoming" : "now_playing";
  const genre = Number(sp.get("genre")) || null, format = sp.get("format"), lang = sp.get("lang"), sort = sp.get("sort") ?? "release";
  try {
    const list = await call("movie", `/movies?status=${status}`);
    if (!list.ok) return NextResponse.json({ error: "movie-service error" }, { status: 502 });
    let movies: any[] = list.data.movies;
    if (genre) movies = movies.filter((m) => m.genre_ids.includes(genre));
    const q = (sp.get("q") ?? "").trim().toLowerCase().slice(0, 80);
    if (q) movies = movies.filter((m) => `${m.title} ${m.original_title ?? ""}`.toLowerCase().includes(q));

    let isMock = false, cinemaCount: number | null = null;
    if (status === "now_playing") { // ประกอบข้อมูลข้าม service: cinema (พื้นที่) → showtime (รอบ) → กรองหนัง
      const area = new URLSearchParams();
      for (const k of ["province", "district", "lat", "lng", "radius"]) if (sp.get(k)) area.set(k, sp.get(k)!);
      const cin = await call("cinema", `/cinemas?${area}`);
      if (!cin.ok) return NextResponse.json({ error: "cinema-service error" }, { status: 502 });
      const cinemas: any[] = cin.data; cinemaCount = cinemas.length;
      const st = await call("showtime", "/showtimes", { method: "POST", body: { cinemaIds: cinemas.map((c) => c.id), movieIds: movies.map((m) => m.id), date: todayTH() } });
      if (!st.ok) return NextResponse.json({ error: "showtime-service error" }, { status: 502 });
      isMock = st.data.isMock;
      const ok = new Set(st.data.slots.filter((s: any) => (!format || s.format === format) && (!lang || s.language === lang)).map((s: any) => s.movieId));
      movies = movies.filter((m) => ok.has(m.id));
    }
    const by: Record<string, (a: any, b: any) => number> = {
      release: (a, b) => (status === "upcoming" ? a.release_date.localeCompare(b.release_date) : b.release_date.localeCompare(a.release_date)),
      rating: (a, b) => b.vote_average - a.vote_average,
      popularity: (a, b) => b.popularity - a.popularity,
    };
    movies.sort(by[sort] ?? by.release);
    return NextResponse.json({ movies, isMock, cinemaCount });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
