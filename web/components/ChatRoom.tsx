"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Msg = { id: number; userId: number; userName: string; body: string; createdAt: string };
type G = { id: number; movieTmdbId: number; movieTitle: string; title: string; preferredTime: string | null; maxMembers: number; _count: { members: number }; contact: string | null };
const time = (s: string) => new Date(s).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
const day = (s: string) => new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

export default function ChatRoom({ groupId }: { groupId: number }) {
  const [me, setMe] = useState<{ id: number; name: string | null } | null | undefined>(undefined);
  const [group, setGroup] = useState<G | null | undefined>(undefined);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState(""); const [err, setErr] = useState(""); const [live, setLive] = useState(false); const [sending, setSending] = useState(false);
  const box = useRef<HTMLDivElement>(null); const stick = useRef(true);

  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => setMe(d.user)).catch(() => setMe(null)); }, []);
  useEffect(() => {
    if (!me) return;
    fetch("/api/groups?mine=1").then((r) => r.json()).then((d) => setGroup(Array.isArray(d) ? d.find((g: G) => g.id === groupId) ?? null : null)).catch(() => setGroup(null));
  }, [me, groupId]);

  // โหลดประวัติ → เปิดสตรีม (SSE) ต่อจากข้อความล่าสุด; หลุดแล้วเบราว์เซอร์ต่อเองและเติมข้อความที่พลาดผ่าน Last-Event-ID
  useEffect(() => {
    if (!me || !group) return;
    let es: EventSource | null = null, cancelled = false;
    (async () => {
      const r = await fetch(`/api/groups/${groupId}/chat`);
      const d = await r.json().catch(() => ({}));
      if (cancelled) return;
      if (!r.ok) return setErr(d.error ?? "โหลดแชทไม่สำเร็จ");
      setMsgs(d.messages);
      es = new EventSource(`/api/groups/${groupId}/chat/stream?after=${d.messages.at(-1)?.id ?? 0}`);
      es.addEventListener("ready", () => setLive(true));
      es.addEventListener("message", (e) => { const m: Msg = JSON.parse((e as MessageEvent).data); setMsgs((p) => (p.some((x) => x.id === m.id) ? p : [...p, m])); });
      es.onerror = () => setLive(false);
    })();
    return () => { cancelled = true; es?.close(); };
  }, [me, group, groupId]);

  useEffect(() => { if (stick.current) box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs]);

  async function send() {
    const body = text.trim(); if (!body || sending) return;
    setSending(true); setErr("");
    const r = await fetch(`/api/groups/${groupId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    const d = await r.json().catch(() => ({}));
    setSending(false);
    if (!r.ok) return setErr(d.error ?? "ส่งไม่สำเร็จ");
    setText(""); stick.current = true;
    setMsgs((p) => (p.some((x) => x.id === d.message.id) ? p : [...p, d.message])); // ไม่ต้องรอสตรีมสะท้อนกลับ
  }

  if (me === undefined || (me && group === undefined)) return <div className="h-40 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />;
  if (!me) return <p className="rounded-xl border border-dashed p-10 text-center text-zinc-500">กรุณา <Link href={`/login?next=${encodeURIComponent(`/groups/${groupId}`)}`} className="text-red-600 underline">เข้าสู่ระบบ</Link> เพื่อเข้าห้องแชท</p>;
  if (!group) return <p className="rounded-xl border border-dashed p-10 text-center text-zinc-500">ไม่พบกลุ่มนี้ หรือคุณไม่ได้เป็นสมาชิก — <Link href="/groups" className="text-red-600 underline">กลับไปกลุ่มของฉัน</Link></p>;

  return (
    <div className="mx-auto flex h-[75vh] max-w-2xl flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <Link href="/groups" className="text-sm text-zinc-500 hover:underline">← กลุ่มของฉัน</Link>
          <span className={`text-xs ${live ? "text-green-600" : "text-zinc-500"}`}>{live ? "● ออนไลน์" : "กำลังเชื่อมต่อ…"}</span>
        </div>
        <p className="font-semibold">{group.title} <span className="chip ml-1">{group._count.members}/{group.maxMembers} คน</span></p>
        <Link href={`/movies/${group.movieTmdbId}`} className="text-sm text-red-600 hover:underline">{group.movieTitle || `หนัง #${group.movieTmdbId}`}</Link>
        {group.preferredTime && <span className="text-sm text-zinc-500"> · นัด {day(group.preferredTime)} {time(group.preferredTime)}</span>}
      </div>
      <div ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="flex-1 space-y-2 overflow-y-auto p-3">
        {msgs.length === 0 && !err && <p className="py-10 text-center text-sm text-zinc-500">ยังไม่มีข้อความ — ทักทายสมาชิกได้เลย 👋</p>}
        {msgs.map((m, i) => {
          const mine = m.userId === me.id, newDay = i === 0 || day(msgs[i - 1].createdAt) !== day(m.createdAt);
          return (
            <div key={m.id}>
              {newDay && <p className="my-2 text-center text-xs text-zinc-400">{day(m.createdAt)}</p>}
              <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                {!mine && <span className="mb-0.5 text-xs text-zinc-500">{m.userName}</span>}
                <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? "bg-red-600 text-white" : "bg-zinc-200 dark:bg-zinc-800"}`}>{m.body}</div>
                <span className="mt-0.5 text-[10px] text-zinc-400">{time(m.createdAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
      {err && <p className="px-3 text-sm text-red-600">{err}</p>}
      <div className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <textarea className="field min-h-[2.5rem] flex-1 resize-none" rows={1} maxLength={1000} placeholder="พิมพ์ข้อความ… (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)" value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        <button onClick={send} disabled={sending || !text.trim()} className="rounded-lg bg-red-600 px-4 text-white disabled:opacity-50">ส่ง</button>
      </div>
      <p className="px-3 pb-2 text-[11px] text-zinc-400">ข้อความจะถูกลบอัตโนมัติพร้อมกลุ่มหลังหนังจบ 12 ชั่วโมง</p>
    </div>
  );
}
