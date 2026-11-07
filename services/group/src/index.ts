import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { guard } from "../../shared/guard";

const prisma = new PrismaClient();
const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));
app.use("*", guard());

const RETENTION_MS = 12 * 3600e3; // กลุ่มหายไปหลังหนังจบ 12 ชม.
const DEFAULT_RUNTIME_MIN = 120;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function who(c: any) { // web (BFF) ตรวจ session กับ auth แล้วส่งตัวตนมาทาง header ภายใน
  const id = Number(c.req.header("x-user-id")) || null;
  let name: string | null = null;
  try { name = decodeURIComponent(c.req.header("x-user-name") ?? "") || null; } catch {}
  return { id, name };
}
const internal = (url: string) =>
  fetch(url, { headers: { "x-internal-key": process.env.INTERNAL_KEY! }, signal: AbortSignal.timeout(8000) })
    .then(async (r) => ({ ok: r.ok, data: (await r.json().catch(() => null)) as any })).catch(() => null);

// ลบกลุ่มที่หมดอายุอัตโนมัติ (ทุก replica รันได้ ไม่ซ้ำซ้อน)
const sweep = () => prisma.movieGroup.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  .then((r) => { if (r.count) console.log("expired groups removed:", r.count); }).catch((e) => console.error("sweep failed:", e.message));
sweep(); setInterval(sweep, 30 * 60e3);

app.get("/groups", async (c) => {
  const q = c.req.query();
  const { id: uid } = who(c);
  const now = new Date();
  const mine = q.mine === "1"; // หน้า "กลุ่มของฉัน": เฉพาะกลุ่มที่เข้าร่วม (เห็นได้จนหมดอายุ 12 ชม. หลังหนังจบ)
  if (mine && !uid) return c.json([]);
  const and: any[] = [mine ? { expiresAt: { gt: now } } : { endsAt: { gt: now } }]; // หน้าค้นหา/หน้าหนัง: ซ่อนกลุ่มที่รอบหนังจบแล้ว
  if (mine) and.push({ members: { some: { userId: uid } } });
  if (Number(q.movie)) and.push({ movieTmdbId: Number(q.movie) });
  if (q.province) and.push({ provinceCode: q.province });
  if (q.district) and.push({ OR: [{ districtCode: q.district }, { districtCode: null }] });
  if (q.subdistrict) and.push({ OR: [{ subdistrictCode: q.subdistrict }, { subdistrictCode: null }] });
  const term = str(q.q, 60);
  if (term) and.push({ OR: [{ title: { contains: term, mode: "insensitive" } }, { movieTitle: { contains: term, mode: "insensitive" } }] });
  if (q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) { // date=YYYY-MM-DD(เวลาไทย) ทั้งวัน; +time=HH:mm ±1 ชม.
    if (q.time && /^\d{2}:\d{2}$/.test(q.time)) {
      const t = new Date(`${q.date}T${q.time}:00+07:00`);
      if (!isNaN(+t)) and.push({ preferredTime: { gte: new Date(+t - 3600e3), lt: new Date(+t + 3600e3 + 1) } });
    } else {
      const d = new Date(`${q.date}T00:00:00+07:00`);
      if (!isNaN(+d)) and.push({ preferredTime: { gte: d, lt: new Date(+d + 864e5) } });
    }
  }
  const rows = await prisma.movieGroup.findMany({
    where: { AND: and }, orderBy: mine ? { preferredTime: "asc" } : { createdAt: "desc" },
    take: Math.min(Number(q.limit) || 50, 100), include: { _count: { select: { members: true } } },
  });
  const memberOf = uid ? new Set((await prisma.groupMember.findMany({ where: { userId: uid, groupId: { in: rows.map((r) => r.id) } }, select: { groupId: true } })).map((m) => m.groupId)) : new Set<number>();
  return c.json(rows.map((r) => ({
    id: r.id, movieTmdbId: r.movieTmdbId, movieTitle: r.movieTitle, title: r.title, description: r.description, preferredTime: r.preferredTime, endsAt: r.endsAt,
    maxMembers: r.maxMembers, hostName: r.hostName, province: { nameTh: r.provinceName }, district: r.districtName ? { nameTh: r.districtName } : null,
    subdistrict: r.subdistrictName ? { nameTh: r.subdistrictName } : null, _count: r._count,
    isMember: memberOf.has(r.id), isHost: !!uid && r.hostUserId === uid, contact: memberOf.has(r.id) ? r.contact : null, // ช่องทางติดต่อเห็นเฉพาะสมาชิก
  })));
});

app.post("/groups", async (c) => {
  const user = who(c);
  if (!user.id) return c.json({ error: "กรุณาเข้าสู่ระบบก่อนสร้างกลุ่ม" }, 401);
  if (!user.name) return c.json({ error: "ตั้งชื่อที่ใช้แสดงก่อน", needsName: true }, 400);
  const b = await c.req.json().catch(() => null);
  if (!b) return c.json({ error: "ข้อมูลไม่ถูกต้อง" }, 400);
  const movieTmdbId = Number(b.movieTmdbId), maxMembers = Number(b.maxMembers ?? 6);
  const title = str(b.title, 80), contact = str(b.contact, 80), description = str(b.description, 500);
  const provinceCode = str(b.provinceCode, 2), districtCode = str(b.districtCode, 4) || null, subdistrictCode = str(b.subdistrictCode, 6) || null;
  const preferredTime = b.preferredTime ? new Date(b.preferredTime) : null;

  if (!movieTmdbId || !title || !provinceCode) return c.json({ error: "กรอกชื่อกลุ่ม และเลือกจังหวัด" }, 400);
  if (!contact) return c.json({ error: "ใส่ช่องทางติดต่อ (เช่น LINE ID) เพื่อให้สมาชิกนัดกัน" }, 400);
  if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 20) return c.json({ error: "จำนวนสมาชิกต้องอยู่ระหว่าง 2–20" }, 400);
  if (!preferredTime || isNaN(+preferredTime)) return c.json({ error: "ระบุวันและเวลารอบหนังที่จะดู" }, 400);
  if (+preferredTime < Date.now()) return c.json({ error: "เวลานัดต้องเป็นเวลาในอนาคต" }, 400);

  // ตรวจพื้นที่กับ location-service และดึงชื่อ/ความยาวหนังจาก movie-service
  const qs = new URLSearchParams({ province: provinceCode, ...(districtCode && { district: districtCode }), ...(subdistrictCode && { subdistrict: subdistrictCode }) });
  const [v, mv] = await Promise.all([internal(`${process.env.LOCATION_URL}/validate?${qs}`), internal(`${process.env.MOVIE_URL}/movies/${movieTmdbId}`)]);
  if (!v || !mv) return c.json({ error: "ตรวจสอบข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง" }, 503);
  if (!v.data?.ok) return c.json({ error: v.data?.error ?? "พื้นที่ไม่ถูกต้อง" }, 400);
  if (!mv.ok) return c.json({ error: "ไม่พบหนังเรื่องนี้" }, 400);
  const runtime = Number(mv.data.runtime) > 0 ? Number(mv.data.runtime) : DEFAULT_RUNTIME_MIN;
  const endsAt = new Date(+preferredTime + runtime * 60e3);
  const expiresAt = new Date(+endsAt + RETENTION_MS);

  try {
    // 1 คนสร้างได้ 1 กลุ่มที่รอบหนังยังไม่จบ (ลบกลุ่มเดิม หรือรอให้รอบหนังจบก่อนสร้างใหม่) — Serializable กันกดซ้อน
    const r = await prisma.$transaction(async (tx) => {
      const existing = await tx.movieGroup.findFirst({ where: { hostUserId: user.id!, endsAt: { gt: new Date() } }, select: { id: true, title: true } });
      if (existing) return { conflict: existing };
      const g = await tx.movieGroup.create({
        data: {
          movieTmdbId, movieTitle: String(mv.data.title ?? "").slice(0, 200), title, description: description || null,
          provinceCode, provinceName: v.data.province.nameTh, districtCode, districtName: v.data.district?.nameTh ?? null,
          subdistrictCode, subdistrictName: v.data.subdistrict?.nameTh ?? null,
          preferredTime, endsAt, expiresAt, maxMembers, hostName: user.name!, hostUserId: user.id!, contact,
          members: { create: { userId: user.id!, name: user.name!, contact } }, // ผู้สร้างเป็นสมาชิกคนแรก
        },
      });
      return { id: g.id };
    }, { isolationLevel: "Serializable" });
    if ("conflict" in r) return c.json({ error: `คุณมีกลุ่ม "${r.conflict.title}" อยู่แล้ว (สร้างได้ 1 กลุ่ม) — ลบกลุ่มเดิมที่หน้า "กลุ่มของฉัน" หรือรอให้รอบหนังจบก่อน`, existingId: r.conflict.id }, 409);
    return c.json({ id: r.id }, 201);
  } catch { return c.json({ error: "สร้างกลุ่มไม่สำเร็จ ลองใหม่อีกครั้ง" }, 409); }
});

app.delete("/groups/:id", async (c) => {
  const { id: uid } = who(c);
  if (!uid) return c.json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
  const id = Number(c.req.param("id"));
  const g = await prisma.movieGroup.findUnique({ where: { id }, select: { hostUserId: true } });
  if (!g) return c.json({ error: "ไม่พบกลุ่มนี้" }, 404);
  if (g.hostUserId !== uid) return c.json({ error: "เฉพาะเจ้าของกลุ่มเท่านั้นที่ลบได้" }, 403);
  await prisma.movieGroup.delete({ where: { id } }); // สมาชิกถูกลบตามด้วย (cascade)
  return c.json({ ok: true });
});

// chat-service เรียกเช็กสิทธิ์: เป็นสมาชิกของกลุ่มที่ยังไม่หมดอายุหรือไม่ (ส่งตัวตนมาทาง x-user-id เหมือน endpoint อื่น)
app.get("/groups/:id/membership", async (c) => {
  const { id: uid } = who(c);
  if (!uid) return c.json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
  const id = Number(c.req.param("id"));
  const g = Number.isInteger(id) ? await prisma.movieGroup.findUnique({ where: { id }, select: { title: true, endsAt: true, expiresAt: true } }) : null;
  if (!g || g.expiresAt <= new Date()) return c.json({ error: "ไม่พบกลุ่มนี้" }, 404);
  const member = !!(await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: id, userId: uid } }, select: { id: true } }));
  return c.json({ member, title: g.title, endsAt: g.endsAt, expiresAt: g.expiresAt });
});

app.post("/groups/:id/join", async (c) => {
  const user = who(c);
  if (!user.id) return c.json({ error: "กรุณาเข้าสู่ระบบก่อนเข้าร่วมกลุ่ม" }, 401);
  if (!user.name) return c.json({ error: "ตั้งชื่อที่ใช้แสดงก่อน", needsName: true }, 400);
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const contact = str(b?.contact, 80);
  try {
    const r = await prisma.$transaction(async (tx) => {
      const g = await tx.movieGroup.findUnique({ where: { id }, include: { members: { select: { userId: true } } } });
      const now = new Date();
      if (!g || g.expiresAt <= now) return { status: 404 as const, error: "ไม่พบกลุ่มนี้" };
      if (g.endsAt <= now) return { status: 409 as const, error: "รอบหนังของกลุ่มนี้จบแล้ว" };
      if (g.members.some((m) => m.userId === user.id)) return { status: 409 as const, error: "คุณเข้าร่วมกลุ่มนี้แล้ว" };
      if (g.members.length >= g.maxMembers) return { status: 409 as const, error: "กลุ่มนี้เต็มแล้ว" };
      await tx.groupMember.create({ data: { groupId: id, userId: user.id!, name: user.name!, contact: contact || null } });
      return { status: 200 as const, contact: g.contact, hostName: g.hostName, memberCount: g.members.length + 1 };
    }, { isolationLevel: "Serializable" });
    if ("error" in r) return c.json({ error: r.error }, r.status);
    return c.json(r);
  } catch { return c.json({ error: "เข้าร่วมไม่สำเร็จ ลองใหม่อีกครั้ง" }, 409); }
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4005) });
