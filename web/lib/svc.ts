import { NextResponse } from "next/server";

// web ทำหน้าที่ BFF: เรียก microservices ภายในด้วย x-internal-key (service ไม่เปิดสู่ภายนอก)
const BASE = {
  movie: process.env.MOVIE_URL, location: process.env.LOCATION_URL, cinema: process.env.CINEMA_URL,
  showtime: process.env.SHOWTIME_URL, group: process.env.GROUP_URL, auth: process.env.AUTH_URL,
} as const;
export type Svc = keyof typeof BASE;
export type SessionUser = { id: number; name: string | null };

export async function call<T = any>(name: Svc, path: string, opts: { method?: string; body?: unknown; user?: SessionUser | null } = {}) {
  const base = BASE[name];
  if (!base) throw new Error(`${name.toUpperCase()}_URL is not set`);
  const headers: Record<string, string> = { "x-internal-key": process.env.INTERNAL_KEY ?? "" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.user) { headers["x-user-id"] = String(opts.user.id); headers["x-user-name"] = encodeURIComponent(opts.user.name ?? ""); }
  const res = await fetch(base + path, { method: opts.method ?? "GET", headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, cache: "no-store", signal: AbortSignal.timeout(10000) });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

/** ส่งต่อคำตอบของ service ตรงๆ (ใช้กับ endpoint ที่ไม่ต้องประกอบข้อมูล) */
export async function forward(name: Svc, path: string, opts: Parameters<typeof call>[2] = {}) {
  try { const r = await call(name, path, opts); return NextResponse.json(r.data, { status: r.status }); }
  catch { return NextResponse.json({ error: `${name}-service unavailable` }, { status: 503 }); }
}
