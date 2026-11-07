"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type G = { id: number; movieTmdbId: number; movieTitle: string; title: string; preferredTime: string | null; endsAt: string; maxMembers: number; hostName: string; province: { nameTh: string }; district: { nameTh: string } | null; _count: { members: number }; isHost: boolean; contact: string | null };
const when = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export default function MyGroupsPage() {
  const [me, setMe] = useState<{ name: string | null } | null | undefined>(undefined);
  const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  const [groups, setGroups] = useState<G[] | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => setMe(d.user)).catch(() => setMe(null)); }, []);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const load = useCallback(() => {
    if (!me) return;
    const p = new URLSearchParams({ mine: "1" }); if (dq) p.set("q", dq);
    fetch(`/api/groups?${p}`).then((r) => r.json()).then((d) => setGroups(Array.isArray(d) ? d : [])).catch(() => setGroups([]));
  }, [me, dq]);
  useEffect(load, [load]);

  async function del(g: G) {
    if (!confirm(`ลบกลุ่ม "${g.title}" ? สมาชิกทุกคนจะถูกนำออกจากกลุ่ม`)) return;
    const r = await fetch(`/api/groups/${g.id}`, { method: "DELETE" });
    if (!r.ok) return setMsg((await r.json().catch(() => ({}))).error ?? "ลบไม่สำเร็จ");
    setMsg(""); load();
  }

  if (me === undefined) return <div className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />;
  if (!me) return <p className="rounded-xl border border-dashed p-10 text-center text-zinc-500">กรุณา <Link href="/login?next=%2Fgroups" className="text-red-600 underline">เข้าสู่ระบบ</Link> เพื่อดูกลุ่มที่คุณเข้าร่วม</p>;
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">กลุ่มของฉัน</h1>
      <p className="mb-4 text-sm text-zinc-500">แสดงเฉพาะกลุ่มที่คุณเข้าร่วม กลุ่มจะหายไปเองหลังหนังจบ 12 ชั่วโมง</p>
      <input className="field mb-4 w-full" type="search" placeholder="🔍 ค้นหาชื่อกลุ่มหรือชื่อหนัง…" maxLength={60} value={q} onChange={(e) => setQ(e.target.value)} />
      {msg && <p className="mb-3 text-sm text-red-600">{msg}</p>}
      {groups === null && <div className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />}
      {groups?.length === 0 && <p className="rounded-xl border border-dashed p-10 text-center text-zinc-500">{dq ? "ไม่พบกลุ่มที่ค้นหา" : "คุณยังไม่ได้เข้าร่วมกลุ่มไหน — เลือกหนังแล้วเข้าร่วมหรือสร้างกลุ่มที่หน้ารายละเอียด"}</p>}
      <div className="space-y-3">
        {groups?.map((g) => {
          const ended = new Date(g.endsAt) <= new Date();
          return (
            <div key={g.id} className={`rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 ${ended ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{g.title} {g.isHost && <span className="chip ml-1">เจ้าของ</span>} {ended && <span className="chip ml-1">รอบนี้จบแล้ว</span>}</p>
                  <Link href={`/movies/${g.movieTmdbId}`} className="text-sm text-red-600 hover:underline">{g.movieTitle || `หนัง #${g.movieTmdbId}`}</Link>
                  <p className="text-sm text-zinc-500">{[g.district?.nameTh, g.province.nameTh].filter(Boolean).join(" ")}{g.preferredTime && ` · ${when(g.preferredTime)}`} · โดย {g.hostName}</p>
                </div>
                <span className="chip shrink-0">{g._count.members}/{g.maxMembers} คน</span>
              </div>
              {g.contact && <p className="mt-2 text-sm">ติดต่อกลุ่ม: <b>{g.contact}</b></p>}
              <div className="mt-3 flex gap-2">
                <Link href={`/groups/${g.id}`} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white">💬 แชทกลุ่ม</Link>
                {g.isHost && <button onClick={() => del(g)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600">ลบกลุ่ม</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
