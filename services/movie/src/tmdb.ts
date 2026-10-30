import { cacheGet, cacheSet } from "./cache";
const BASE = "https://api.themoviedb.org/3";
const TTL = 6 * 60 * 60; // 6 ชั่วโมง

async function tmdb<T>(path: string, params: Record<string, string> = {}, lang = "th-TH"): Promise<T> {
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) throw new Error("TMDB_ACCESS_TOKEN is not set");
  const qs = new URLSearchParams({ language: lang, region: "TH", ...params });
  const key = `movie:${path}?${qs}`;
  const hit = await cacheGet(key);
  if (hit) return JSON.parse(hit);
  const res = await fetch(`${BASE}${path}?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`TMDB ${path} → ${res.status}`);
  const data = await res.json();
  await cacheSet(key, JSON.stringify(data), TTL);
  return data as T;
}

export async function listMovies(status: "now_playing" | "upcoming"): Promise<any[]> {
  const pages = await Promise.all([1, 2].map((page) => tmdb<{ results: any[] }>(`/movie/${status}`, { page: String(page) })));
  const seen = new Set<number>();
  return pages.flatMap((p) => p.results).filter((m) => !seen.has(m.id) && seen.add(m.id));
}
export async function getGenres() { return (await tmdb<{ genres: { id: number; name: string }[] }>("/genre/movie/list")).genres; }
/** เรทติ้งอายุและวันเข้าโรงของไทย (release type 2/3 ที่เร็วที่สุด) */
export async function getReleaseInfo(id: number): Promise<{ certification: string | null; releaseDate: string | null }> {
  try {
    const r = await tmdb<{ results: { iso_3166_1: string; release_dates: { certification: string; type: number; release_date: string }[] }[] }>(`/movie/${id}/release_dates`);
    const th = r.results.find((x) => x.iso_3166_1 === "TH");
    const certification = th?.release_dates.find((d) => d.certification)?.certification ?? null;
    const releaseDate = th?.release_dates.filter((d) => (d.type === 2 || d.type === 3) && d.release_date).map((d) => d.release_date.slice(0, 10)).sort()[0] ?? null;
    return { certification, releaseDate };
  } catch { return { certification: null, releaseDate: null }; }
}
export async function getMovieDetail(id: number) {
  const q = { append_to_response: "videos,credits" };
  const th: any = await tmdb(`/movie/${id}`, q);
  if (!th.overview || !th.videos?.results?.length) { // fallback อังกฤษ
    const en: any = await tmdb(`/movie/${id}`, q, "en-US");
    th.overview ||= en.overview; th.title ||= en.title;
    if (!th.videos?.results?.length) th.videos = en.videos;
  }
  const info = await getReleaseInfo(id);
  return { ...th, certification: info.certification, release_date: info.releaseDate ?? th.release_date };
}
