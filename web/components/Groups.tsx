"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Opt = { code: string; nameTh: string };
type Group = { id: number; title: string; description: string | null; preferredTime: string | null; maxMembers: number; hostName: string; province: { nameTh: string }; district: { nameTh: string } | null; subdistrict: { nameTh: string } | null; _count: { members: number }; isMember?: boolean; contact?: string | null };
type Props = { movieId: number; mode?: "create" | "search"; date?: string; time?: string; cinema?: { id: number; name: string; provinceCode: string; districtCode: string } };
const when = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

export default function Groups({ movieId, mode, date, time, cinema }: Props) {
  const [loc, setLoc] = useState<{ province?: string; district?: string }>({});
  const area = cinema ? { province: cinema.provinceCode, district: cinema.districtCode } : loc; // มาจากรอบฉาย → ใช้พื้นที่ของสาขานั้น
  const [me, setMe] = useState<{ id: number; name: string | null } | null | undefined>(undefined);
  const [next, setNext] = useState("/");
  const ready = !!me?.name;
  const loginHref = `/login?next=${encodeURIComponent(next)}`;
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [joining, setJoining] = useState<number | null>(null);
  const [joined, setJoined] = useState<Record<number, string>>({});
  const [jf, setJf] = useState({ name: "", contact: "" });
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(mode === "create");
  const [districts, setDistricts] = useState<Opt[]>([]);
  const [subs, setSubs] = useState<Opt[]>([]);
  const [f, setF] = useState({
    title: cinema && time ? `ดูรอบ ${time} น. ที่ ${cinema.name}` : "", description: cinema ? `นัดดูที่ ${cinema.name}` : "",
    hostName: "", contact: "", maxMembers: 6, preferredTime: date && time ? `${date}T${time}` : "", districtCode: cinema?.districtCode ?? "", subdistrictCode: "",
  });

  useEffect(() => { setNext(location.pathname + location.search + "#groups"); fetch("/api/auth/me").then((r) => r.json()).then((d) => setMe(d.user)).catch(() => setMe(null)); }, []);
  useEffect(() => { try { setLoc(JSON.parse(localStorage.getItem("loc") ?? "{}")); } catch {} }, []);
  useEffect(() => {
    if (!area.province) return;
    fetch(`/api/locations/districts?province=${area.province}`).then((r) => r.json()).then(setDistricts).catch(() => {});
    setF((x) => ({ ...x, districtCode: area.district ?? "" }));
  }, [area.province, area.district]);
  useEffect(() => { setSubs([]); if (f.districtCode) fetch(`/api/locations/subdistricts?district=${f.districtCode}`).then((r) => r.json()).then(setSubs).catch(() => {}); }, [f.districtCode]);

  const load = useCallback(() => {
    if (!area.province) return setGroups([]);
    const p = new URLSearchParams({ movie: String(movieId), province: area.province });
    if (area.district) p.set("district", area.district);
    if (date) p.set("date", date); if (date && time) p.set("time", time);
    fetch(`/api/groups?${p}`).then((r) => r.json()).then(setGroups).catch(() => setGroups([]));
  }, [area.province, area.district, movieId, date, time]);
  useEffect(load, [load]);

  async function join(id: number) {
    setMsg(""); const { ok, data } = await post(`/api/groups/${id}/join`, jf);
    if (!ok) return setMsg(data.error ?? "เข้าร่วมไม่สำเร็จ");
    setJoined((j) => ({ ...j, [id]: data.contact })); setJoining(null); load();
  }
  async function create(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    const { ok, data } = await post("/api/groups", { ...f, movieTmdbId: movieId, provinceCode: area.province, preferredTime: f.preferredTime ? `${f.preferredTime}:00+07:00` : null });
    if (!ok) return setMsg(data.error ?? "สร้างกลุ่มไม่สำเร็จ");
    setCreating(false); setF({ ...f, title: "", description: "" }); load();
  }

  return (
    <section id="groups" className="mt-10 scroll-mt-4">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-semibold">กลุ่มดูหนัง</h2>
        {area.province && (ready ? <button className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white" onClick={() => setCreating(!creating)}>{creating ? "ปิด" : "+ สร้างกลุ่ม"}</button> : me === undefined ? null : <Link href={loginHref} className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white">{me ? "ตั้งชื่อก่อนสร้างกลุ่ม" : "เข้าสู่ระบบเพื่อสร้างกลุ่ม"}</Link>)}</div>
      {date && (
        <p className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          {mode === "create" ? "สร้างกลุ่มสำหรับ" : "ค้นหากลุ่มสำหรับ"} {new Date(date + "T00:00:00+07:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" })}{time && ` เวลา ${time} น. (±1 ชม.)`}{cinema && ` · ${cinema.name}`}
          <Link href={`/movies/${movieId}#groups`} className="ml-auto underline">ดูทุกกลุ่ม</Link>
        </p>
      )}
      {!area.province && <p className="rounded-xl border border-dashed p-6 text-center text-zinc-500">เลือกจังหวัดที่หน้าแรกก่อน เพื่อดูหรือสร้างกลุ่มในพื้นที่ของคุณ</p>}
      {msg && <p className="mb-2 text-sm text-red-600">{msg}</p>}

      {creating && ready && (
        <form onSubmit={create} className="mb-4 grid gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 sm:grid-cols-2">
          <input className="field sm:col-span-2" required maxLength={80} placeholder="ชื่อกลุ่ม เช่น ดูรอบเย็นวันศุกร์" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <select className="field" value={f.districtCode} onChange={(e) => setF({ ...f, districtCode: e.target.value, subdistrictCode: "" })}><option value="">ทุกเขต/อำเภอ</option>{districts.map((d) => <option key={d.code} value={d.code}>{d.nameTh}</option>)}</select>
          <select className="field" disabled={!f.districtCode || !subs.length} value={f.subdistrictCode} onChange={(e) => setF({ ...f, subdistrictCode: e.target.value })}><option value="">ทุกตำบล/แขวง</option>{subs.map((d) => <option key={d.code} value={d.code}>{d.nameTh}</option>)}</select>
          <input className="field" required title="วัน-เวลารอบหนังที่จะดู" type="datetime-local" value={f.preferredTime} onChange={(e) => setF({ ...f, preferredTime: e.target.value })} />
          <input className="field" type="number" min={2} max={20} value={f.maxMembers} onChange={(e) => setF({ ...f, maxMembers: +e.target.value })} title="จำนวนสมาชิกสูงสุด" />
          <input className="field" required maxLength={80} placeholder="ช่องทางติดต่อ (LINE ID) — เห็นเฉพาะคนที่เข้าร่วม" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
          <textarea className="field sm:col-span-2" maxLength={500} placeholder="รายละเอียด (ไม่บังคับ)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <button className="rounded-lg bg-red-600 px-4 py-2 text-white sm:col-span-2">สร้างกลุ่ม</button>
        </form>
      )}

      {groups === null && area.province && <div className="h-20 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />}
      {groups?.length === 0 && area.province && <p className="rounded-xl border border-dashed p-6 text-center text-zinc-500">{date ? "ยังไม่มีกลุ่มในรอบนี้ — สร้างกลุ่มแรกได้เลย" : "ยังไม่มีกลุ่มในพื้นที่นี้ เป็นคนแรกที่สร้างเลย"}</p>}
      <div className="space-y-3">
        {groups?.map((g) => {
          const full = g._count.members >= g.maxMembers;
          const mine = joined[g.id] ?? (g.isMember ? g.contact ?? "" : undefined);
          return (
            <div key={g.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-semibold">{g.title}</p>
                  <p className="text-sm text-zinc-500">{[g.subdistrict?.nameTh, g.district?.nameTh, g.province.nameTh].filter(Boolean).join(" · ")} · โดย {g.hostName}{g.preferredTime && ` · ${when(g.preferredTime)}`}</p></div>
                <span className="chip shrink-0">{g._count.members}/{g.maxMembers} คน</span>
              </div>
              {g.description && <p className="mt-2 text-sm">{g.description}</p>}
              {mine !== undefined ? <p className="mt-3 rounded-lg bg-green-100 p-2 text-sm text-green-800 dark:bg-green-900/40 dark:text-green-200">คุณอยู่ในกลุ่มนี้แล้ว ติดต่อกลุ่มได้ที่: <b>{mine}</b></p>
                : joining === g.id ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input className="field" placeholder="LINE ID (ไม่บังคับ)" maxLength={80} value={jf.contact} onChange={(e) => setJf({ ...jf, contact: e.target.value })} />
                    <button className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white" onClick={() => join(g.id)}>ยืนยัน</button>
                  </div>
                ) : !ready ? (me === undefined ? null : <Link href={loginHref} className="mt-3 inline-block rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">{me ? "ตั้งชื่อก่อนเข้าร่วม" : "เข้าสู่ระบบเพื่อเข้าร่วม"}</Link>) : <button disabled={full} className="mt-3 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700" onClick={() => { setJoining(g.id); setMsg(""); }}>{full ? "เต็มแล้ว" : "เข้าร่วมกลุ่ม"}</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
