import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { guard } from "../../shared/guard";

const prisma = new PrismaClient();
const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));
app.use("*", guard());

const MAX_BODY = 1000, PAGE = 50, HEARTBEAT_MS = 20_000;
type Msg = { id: number; userId: number; userName: string; body: string; createdAt: Date };
const dto = (m: Msg) => ({ id: m.id, userId: m.userId, userName: m.userName, body: m.body, createdAt: m.createdAt.toISOString() });

// ผู้ติดตามห้อง (SSE) ต่อกลุ่ม — อยู่ในหน่วยความจำของ process นี้ ใช้ได้เมื่อรัน chat 1 instance (ถ้าจะขยายหลายตัวต้องใช้ Redis pub/sub)
const subs = new Map<number, Set<(m: Msg) => void>>();

function who(c: any) { // web (BFF) ตรวจ session กับ auth แล้วส่งตัวตนมาทาง header ภายใน
  const id = Number(c.req.header("x-user-id")) || null;
  let name = ""; try { name = decodeURIComponent(c.req.header("x-user-name") ?? ""); } catch {}
  return { id, name: name || "สมาชิก" };
}
const parseGid = (c: any) => { const n = Number(c.req.param("gid")); return Number.isInteger(n) && n > 0 ? n : null; };

// สิทธิ์เข้าห้อง = เป็นสมาชิกกลุ่ม (ถาม group-service ทุกครั้ง; แคชเฉพาะผลว่าเป็นสมาชิก 20 วินาที)
type Access = { ok: true; uid: number; name: string; expiresAt: Date } | { ok: false; status: 400 | 401 | 403 | 404 | 503; error: string };
const okCache = new Map<string, { until: number; expiresAt: Date }>();
async function access(c: any): Promise<Access> {
  const gid = parseGid(c); const { id: uid, name } = who(c);
  if (!uid) return { ok: false, status: 401, error: "กรุณาเข้าสู่ระบบ" };
  if (!gid) return { ok: false, status: 400, error: "กลุ่มไม่ถูกต้อง" };
  const key = `${gid}:${uid}`, hit = okCache.get(key);
  if (hit && hit.until > Date.now() && hit.expiresAt.getTime() > Date.now()) return { ok: true, uid, name, expiresAt: hit.expiresAt };
  let res: Response;
  try {
    res = await fetch(`${process.env.GROUP_URL}/groups/${gid}/membership`, {
      headers: { "x-internal-key": process.env.INTERNAL_KEY!, "x-user-id": String(uid) }, signal: AbortSignal.timeout(5000),
    });
  } catch { return { ok: false, status: 503, error: "ตรวจสิทธิ์กลุ่มไม่สำเร็จ ลองใหม่อีกครั้ง" }; }
  if (res.status === 404) return { ok: false, status: 404, error: "ไม่พบกลุ่มนี้ (อาจถูกลบหรือหมดอายุแล้ว)" };
  if (!res.ok) return { ok: false, status: 503, error: "ตรวจสิทธิ์กลุ่มไม่สำเร็จ ลองใหม่อีกครั้ง" };
  const g: any = await res.json().catch(() => null);
  if (!g?.member) return { ok: false, status: 403, error: "เฉพาะสมาชิกของกลุ่มเท่านั้นที่เข้าห้องแชทได้" };
  const expiresAt = new Date(g.expiresAt);
  if (okCache.size > 5000) okCache.clear();
  okCache.set(key, { until: Date.now() + 20_000, expiresAt });
  return { ok: true, uid, name, expiresAt };
}

// กันส่งรัว: 10 ข้อความ / 10 วินาที ต่อผู้ใช้
const hits = new Map<number, number[]>();
function limited(uid: number) {
  const now = Date.now(), recent = (hits.get(uid) ?? []).filter((t) => now - t < 10_000);
  if (recent.length >= 10) { hits.set(uid, recent); return true; }
  recent.push(now); hits.set(uid, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

app.get("/groups/:gid/messages", async (c) => {
  const a = await access(c); if (!a.ok) return c.json({ error: a.error }, a.status);
  const gid = parseGid(c)!;
  const after = Number(c.req.query("after")) || 0, limit = Math.min(Number(c.req.query("limit")) || PAGE, 100);
  const rows = after > 0
    ? await prisma.message.findMany({ where: { groupId: gid, id: { gt: after } }, orderBy: { id: "asc" }, take: limit })
    : (await prisma.message.findMany({ where: { groupId: gid }, orderBy: { id: "desc" }, take: limit })).reverse(); // ครั้งแรก: ข้อความล่าสุด เรียงเก่า→ใหม่
  return c.json({ messages: rows.map(dto) });
});

app.post("/groups/:gid/messages", async (c) => {
  const a = await access(c); if (!a.ok) return c.json({ error: a.error }, a.status);
  const gid = parseGid(c)!;
  const b = await c.req.json().catch(() => null);
  const text = typeof b?.body === "string" ? b.body.replace(/\r\n/g, "\n").trim() : "";
  if (!text) return c.json({ error: "พิมพ์ข้อความก่อนส่ง" }, 400);
  if (text.length > MAX_BODY) return c.json({ error: `ข้อความยาวเกิน ${MAX_BODY} ตัวอักษร` }, 400);
  if (limited(a.uid)) return c.json({ error: "ส่งถี่เกินไป รอสักครู่" }, 429);
  const m = await prisma.message.create({ data: { groupId: gid, userId: a.uid, userName: a.name.slice(0, 40), body: text, expiresAt: a.expiresAt } });
  subs.get(gid)?.forEach((push) => push(m));
  return c.json({ message: dto(m) }, 201);
});

// Server-Sent Events: เบราว์เซอร์ต่อซ้ำเองเมื่อหลุดและส่ง Last-Event-ID มา → เติมข้อความที่พลาดจาก DB ให้
app.get("/groups/:gid/stream", async (c) => {
  const a = await access(c); if (!a.ok) return c.json({ error: a.error }, a.status);
  const gid = parseGid(c)!;
  const lastId = Number(c.req.header("last-event-id") ?? c.req.query("after")) || 0;
  return streamSSE(c, async (stream) => {
    const queue: Msg[] = []; let wake: (() => void) | null = null; let closed = false;
    const push = (m: Msg) => { queue.push(m); wake?.(); };
    let set = subs.get(gid); if (!set) subs.set(gid, (set = new Set())); set.add(push); // สมัครก่อนแล้วค่อยเติมของที่พลาด กันข้อความตกหล่นช่วงรอยต่อ
    stream.onAbort(() => { closed = true; wake?.(); });
    let sent = lastId;
    const send = async (m: Msg) => { if (m.id <= sent) return; sent = m.id; await stream.writeSSE({ id: String(m.id), event: "message", data: JSON.stringify(dto(m)) }); };
    try {
      if (lastId > 0) for (const m of await prisma.message.findMany({ where: { groupId: gid, id: { gt: lastId } }, orderBy: { id: "asc" }, take: 200 })) await send(m);
      await stream.writeSSE({ event: "ready", data: "{}" });
      while (!closed && Date.now() < a.expiresAt.getTime()) { // กลุ่มหมดอายุ → ปิดสตรีม
        while (queue.length) await send(queue.shift()!);
        await new Promise<void>((resolve) => { const t = setTimeout(resolve, Math.max(0, Math.min(HEARTBEAT_MS, +a.expiresAt - Date.now()))); wake = () => { clearTimeout(t); resolve(); }; });
        wake = null;
        if (!closed && !queue.length) await stream.write(": ping\n\n"); // heartbeat กัน proxy ตัดการเชื่อมต่อ
      }
    } catch { /* ไคลเอนต์ตัดการเชื่อมต่อ */ }
    finally { set.delete(push); if (!set.size) subs.delete(gid); }
  });
});

const sweep = () => prisma.message.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  .then((r) => { if (r.count) console.log("expired messages removed:", r.count); }).catch((e) => console.error("sweep failed:", e.message));
sweep(); setInterval(sweep, 30 * 60e3);

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4007) });
