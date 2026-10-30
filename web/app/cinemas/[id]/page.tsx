import Link from "next/link";
import { notFound } from "next/navigation";
import MockBadge from "@/components/MockBadge";
import TimeSlot from "@/components/TimeSlot";
import { validDate } from "@/lib/geo";
import { call } from "@/lib/svc";

export default async function CinemaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> }) {
  const { id } = await params;
  const date = validDate((await searchParams).date);
  const cr = await call("cinema", `/cinemas/${Number(id)}`).catch(() => null);
  if (!cr?.ok) notFound();
  const cinema = cr.data;
  // ประกอบข้อมูลข้าม service: ชื่อพื้นที่ (location) + หนังกำลังฉาย (movie) + รอบฉาย (showtime)
  const [loc, ml] = await Promise.all([
    call("location", `/validate?province=${cinema.provinceCode}&district=${cinema.districtCode}`).catch(() => null),
    call("movie", "/movies?status=now_playing").catch(() => null),
  ]);
  const movies: any[] = ml?.ok ? ml.data.movies : [];
  const st = await call("showtime", "/showtimes", { method: "POST", body: { cinemaIds: [cinema.id], movieIds: movies.map((m) => m.id), date } }).catch(() => null);
  const slots: any[] = st?.ok ? st.data.slots : [];
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.now() + 7 * 3600e3 + i * 864e5).toISOString().slice(0, 10));
  return (
    <div>
      <h1 className="text-2xl font-bold">{cinema.name}</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">{cinema.address} · {loc?.data?.district?.nameTh} {loc?.data?.province?.nameTh}</p>
      <div className="mt-2 flex items-center gap-3">
        <a className="text-red-600 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${cinema.lat},${cinema.lng}`}>เปิดแผนที่</a>
        {st?.data?.isMock && <MockBadge />}
      </div>
      <div className="my-4 flex gap-2 overflow-x-auto">
        {days.map((d) => <Link key={d} href={`?date=${d}`} className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${d === date ? "border-red-600 bg-red-600 text-white" : "border-zinc-300 dark:border-zinc-700"}`}>{new Date(d + "T00:00:00+07:00").toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })}</Link>)}
      </div>
      {movies.length === 0 && <p className="text-zinc-500">โหลดรายการหนังไม่สำเร็จ</p>}
      <div className="space-y-3">
        {movies.map((m) => {
          const s = slots.filter((x) => x.movieId === m.id);
          return s.length ? (
            <div key={m.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <Link href={`/movies/${m.id}`} className="font-semibold hover:underline">{m.title}</Link>
              <div className="mt-2 flex flex-wrap gap-2">{s.map((x) => <TimeSlot key={x.startTime} movieId={m.id} cinemaId={cinema.id} startTime={x.startTime} format={x.format} language={x.language} />)}</div>
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
}
