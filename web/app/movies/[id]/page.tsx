import Image from "next/image";
import { notFound } from "next/navigation";
import Groups from "@/components/Groups";
import Showtimes from "@/components/Showtimes";
import { call } from "@/lib/svc";

export default async function MoviePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date : undefined;
  const time = /^\d{2}:\d{2}$/.test(sp.time ?? "") ? sp.time : undefined;
  const mode = sp.mode === "create" || sp.mode === "search" ? sp.mode : undefined;
  const cr = Number(sp.cinema) ? await call("cinema", `/cinemas/${Number(sp.cinema)}`).catch(() => null) : null;
  const cinema = cr?.ok ? cr.data : null;
  const mr = await call("movie", `/movies/${Number(id)}`).catch(() => null);
  const m = mr?.ok ? mr.data : null;
  if (!m) notFound();
  const trailer = m.videos?.results?.find((v: any) => v.site === "YouTube" && v.type === "Trailer") ?? m.videos?.results?.find((v: any) => v.site === "YouTube");
  return (
    <article>
      <div className="flex flex-col gap-6 md:flex-row">
        <div className="relative aspect-[2/3] w-48 shrink-0 self-center overflow-hidden rounded-xl bg-zinc-200 dark:bg-zinc-800 md:self-start">
          {m.poster_path && <Image src={`https://image.tmdb.org/t/p/w500${m.poster_path}`} alt={m.title} fill sizes="192px" className="object-cover" />}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{m.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {m.certification && <span className="chip">เรท {m.certification}</span>}
            <span className="chip">⭐ {m.vote_average?.toFixed(1)}</span>
            {m.runtime ? <span className="chip">{m.runtime} นาที</span> : null}
            {m.genres?.map((g: any) => <span key={g.id} className="chip">{g.name}</span>)}
          </div>
          <p className="mt-4 leading-relaxed">{m.overview || "ยังไม่มีเรื่องย่อ"}</p>
          <h2 className="mb-2 mt-5 font-semibold">นักแสดง</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{m.credits?.cast?.slice(0, 8).map((c: any) => c.name).join(", ")}</p>
        </div>
      </div>
      {trailer && (
        <div className="mt-8 aspect-video overflow-hidden rounded-xl">
          <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${trailer.key}`} title="ตัวอย่างหนัง" allowFullScreen loading="lazy" />
        </div>
      )}
      <Showtimes movieId={m.id} />
      <Groups key={`${mode}-${sp.cinema}-${date}-${time}`} movieId={m.id} mode={mode} date={date} time={time} cinema={cinema ?? undefined} />
    </article>
  );
}
