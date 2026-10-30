import { NextResponse } from "next/server";
import { validDate } from "@/lib/geo";
import { call } from "@/lib/svc";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const date = validDate(sp.get("date"));
  try {
    const mv = await call("movie", `/movies/${Number(id)}`).catch(() => null);
    const releaseDate: string | null = mv?.ok ? mv.data.release_date || null : null;
    if (releaseDate && date < releaseDate) return NextResponse.json({ date, isMock: false, groups: [], releaseDate }); // ยังไม่เข้าฉายในวันนั้น
    const area = new URLSearchParams();
    for (const k of ["province", "district", "lat", "lng", "radius"]) if (sp.get(k)) area.set(k, sp.get(k)!);
    const cin = await call("cinema", `/cinemas?${area}`);
    if (!cin.ok) return NextResponse.json({ error: "cinema-service error" }, { status: 502 });
    const cinemas: any[] = cin.data;
    const st = await call("showtime", "/showtimes", { method: "POST", body: { cinemaIds: cinemas.map((c) => c.id), movieIds: [Number(id)], date } });
    if (!st.ok) return NextResponse.json({ error: "showtime-service error" }, { status: 502 });
    const groups = cinemas
      .map((c) => ({ cinema: { id: c.id, name: c.name, chain: c.chain, address: c.address, distanceKm: c.distanceKm }, showtimes: st.data.slots.filter((s: any) => s.cinemaId === c.id) }))
      .filter((g) => g.showtimes.length);
    return NextResponse.json({ date, isMock: st.data.isMock, groups, releaseDate });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
