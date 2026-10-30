"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import MockBadge from "./MockBadge";
import TimeSlot from "./TimeSlot";

type Group = { cinema: { id: number; name: string; chain: string; address: string; distanceKm: number | null }; showtimes: { startTime: string; format: string; language: string }[] };
const time = (s: string) => new Date(s).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export default function Showtimes({ movieId }: { movieId: number }) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.now() + 7 * 3600e3 + i * 864e5).toISOString().slice(0, 10));
  const [date, setDate] = useState(days[0]);
  const [data, setData] = useState<{ groups: Group[]; isMock: boolean; releaseDate?: string | null } | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let loc: any = {};
    try { loc = JSON.parse(localStorage.getItem("loc") ?? "{}"); } catch {}
    const p = new URLSearchParams({ date });
    if (loc.geo) { p.set("lat", loc.geo.lat); p.set("lng", loc.geo.lng); p.set("radius", loc.radius ?? 10); }
    else { if (loc.province) p.set("province", loc.province); if (loc.district) p.set("district", loc.district); }
    setData(null); setErr(false);
    fetch(`/api/movies/${movieId}/showtimes?${p}`).then((r) => r.json()).then(setData).catch(() => setErr(true));
  }, [date, movieId]);

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2"><h2 className="text-xl font-semibold">รอบฉาย</h2>{data?.isMock && <MockBadge />}</div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => (
          <button key={d} onClick={() => setDate(d)} className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${d === date ? "border-red-600 bg-red-600 text-white" : "border-zinc-300 dark:border-zinc-700"}`}>
            {new Date(d + "T00:00:00+07:00").toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })}
          </button>
        ))}
      </div>
      {err && <p className="text-red-600">โหลดรอบฉายไม่สำเร็จ ลองใหม่อีกครั้ง</p>}
      {!data && !err && <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />)}</div>}
      {data && data.groups.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-zinc-500">{data.releaseDate && data.releaseDate > date ? `หนังเรื่องนี้เข้าฉายวันที่ ${new Date(data.releaseDate + "T00:00:00+07:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}` : "ยังไม่มีหนังฉายในพื้นที่นี้ (เลือกจังหวัดที่หน้าแรกก่อน)"}</p>}
      <div className="space-y-3">
        {data?.groups.map((g) => (
          <div key={g.cinema.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/cinemas/${g.cinema.id}`} className="font-semibold hover:underline">{g.cinema.name}</Link>
              {g.cinema.distanceKm != null && <span className="text-sm text-zinc-500">{g.cinema.distanceKm.toFixed(1)} กม.</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {g.showtimes.map((s) => (
                <TimeSlot key={s.startTime} movieId={movieId} cinemaId={g.cinema.id} startTime={s.startTime} format={s.format} language={s.language} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
