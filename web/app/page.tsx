"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import MockBadge from "@/components/MockBadge";

type Opt = { code: string; nameTh: string };
type Movie = { id: number; title: string; poster_path: string | null; release_date: string; vote_average: number; certification: string | null };

export default function Home() {
  const [tab, setTab] = useState<"now_playing" | "upcoming">("now_playing");
  const [provinces, setProvinces] = useState<Opt[]>([]);
  const [districts, setDistricts] = useState<Opt[]>([]);
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
  const [pq, setPq] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(10);
  const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  const [genre, setGenre] = useState(""); const [format, setFormat] = useState(""); const [lang, setLang] = useState(""); const [sort, setSort] = useState("release");
  const [data, setData] = useState<{ movies: Movie[]; isMock: boolean } | null>(null);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { const l = JSON.parse(localStorage.getItem("loc") ?? "{}"); setProvince(l.province ?? ""); setDistrict(l.district ?? ""); } catch {}
    setReady(true);
    fetch("/api/locations/provinces").then((r) => r.json()).then(setProvinces).catch(() => {});
    fetch("/api/genres").then((r) => r.json()).then(setGenres).catch(() => {});
  }, []);
  useEffect(() => {
    if (!province) return setDistricts([]);
    fetch(`/api/locations/districts?province=${province}`).then((r) => r.json()).then(setDistricts).catch(() => {});
  }, [province]);
  useEffect(() => { if (ready) localStorage.setItem("loc", JSON.stringify({ province, district, geo, radius })); }, [province, district, geo, radius, ready]);

  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams({ status: tab, sort });
    if (geo) { p.set("lat", String(geo.lat)); p.set("lng", String(geo.lng)); p.set("radius", String(radius)); }
    else { if (province) p.set("province", province); if (district) p.set("district", district); }
    if (dq) p.set("q", dq); if (genre) p.set("genre", genre); if (format) p.set("format", format); if (lang) p.set("lang", lang);
    const ac = new AbortController(); setData(null); setError(false);
    fetch(`/api/movies?${p}`, { signal: ac.signal }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch((e) => e?.name !== "AbortError" && setError(true));
    return () => ac.abort();
  }, [ready, tab, province, district, geo, radius, dq, genre, format, lang, sort]);

  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const useGeo = () => navigator.geolocation?.getCurrentPosition(
    (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => setGeo(null), // ปฏิเสธสิทธิ์: กลับไปใช้ dropdown เงียบๆ
    { timeout: 8000 });
  const shown = provinces.filter((p) => p.nameTh.includes(pq) || p.code === province);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(["now_playing", "upcoming"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-2 text-sm font-medium ${tab === t ? "bg-red-600 text-white" : "bg-zinc-200 dark:bg-zinc-800"}`}>{t === "now_playing" ? "กำลังฉาย" : "เข้าเร็วๆ นี้"}</button>
        ))}
        {data?.isMock && tab === "now_playing" && <span className="ml-auto self-center"><MockBadge /></span>}
      </div>

      <input className="field mb-3 w-full" type="search" placeholder="🔍 ค้นหาชื่อหนัง…" maxLength={80} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        <input className="field col-span-2 md:col-span-1" placeholder="ค้นหาจังหวัด…" value={pq} onChange={(e) => setPq(e.target.value)} />
        <select className="field" value={province} onChange={(e) => { setProvince(e.target.value); setDistrict(""); setGeo(null); }}>
          <option value="">ทุกจังหวัด</option>{shown.map((p) => <option key={p.code} value={p.code}>{p.nameTh}</option>)}
        </select>
        <select className="field" value={district} disabled={!province} onChange={(e) => { setDistrict(e.target.value); setGeo(null); }}>
          <option value="">ทุกเขต/อำเภอ</option>{districts.map((d) => <option key={d.code} value={d.code}>{d.nameTh}</option>)}
        </select>
        <button className={`field ${geo ? "border-red-600 text-red-600" : ""}`} onClick={() => (geo ? setGeo(null) : useGeo())}>📍 {geo ? "ปิดตำแหน่งปัจจุบัน" : "ใช้ตำแหน่งปัจจุบัน"}</button>
        {geo && <label className="field col-span-2 flex items-center gap-2 md:col-span-4">รัศมี {radius} กม.<input type="range" min={1} max={50} value={radius} onChange={(e) => setRadius(+e.target.value)} className="flex-1" /></label>}
        <select className="field" value={genre} onChange={(e) => setGenre(e.target.value)}><option value="">ทุกประเภท</option>{genres.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        <select className="field" value={format} onChange={(e) => setFormat(e.target.value)}><option value="">ทุกฟอร์แมต</option>{["IMAX", "4DX", "3D", "2D"].map((f) => <option key={f}>{f}</option>)}</select>
        <select className="field" value={lang} onChange={(e) => setLang(e.target.value)}><option value="">พากย์/ซับ ทั้งหมด</option>{["พากย์ไทย", "ซับไทย", "ต้นฉบับ"].map((f) => <option key={f}>{f}</option>)}</select>
        <select className="field" value={sort} onChange={(e) => setSort(e.target.value)}><option value="release">เรียงตามวันฉาย</option><option value="rating">เรียงตามคะแนน</option><option value="popularity">เรียงตามความนิยม</option></select>
      </div>

      {error && <p className="rounded-xl border border-red-300 p-6 text-center text-red-600">โหลดข้อมูลไม่สำเร็จ (ตรวจสอบ TMDB_ACCESS_TOKEN และฐานข้อมูล)</p>}
      {!data && !error && <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />)}</div>}
      {data && data.movies.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-zinc-500">ยังไม่มีหนังฉายในพื้นที่นี้</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {data?.movies.map((m) => (
          <Link key={m.id} href={`/movies/${m.id}`} className="group">
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-zinc-200 dark:bg-zinc-800">
              {m.poster_path && <Image src={`https://image.tmdb.org/t/p/w500${m.poster_path}`} alt={m.title} fill sizes="(max-width:768px) 50vw, 20vw" className="object-cover transition group-hover:scale-105" />}
              {m.certification && <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">{m.certification}</span>}
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-medium">{m.title}</p>
            <p className="text-xs text-zinc-500">{m.release_date && new Date(m.release_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })} · ⭐ {m.vote_average.toFixed(1)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
