import crypto from "crypto";
import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { guard } from "../../shared/guard";
import { maskPhone, normalizeThaiPhone } from "./phone";
import { getSmsProvider } from "./sms";

const prisma = new PrismaClient();
const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));
app.use("*", guard());

const SESSION_DAYS = 30;
function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (>= 32 chars)");
  return s;
}
secret(); // fail fast ตอนเริ่มระบบ
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const hashOtp = (phone: string, code: string) => crypto.createHmac("sha256", secret()).update(`${phone}:${code}`).digest("hex");
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

app.post("/otp/request", async (c) => {
  const b = await c.req.json().catch(() => null);
  const phone = normalizeThaiPhone(b?.phone);
  if (!phone) return c.json({ error: "เบอร์ไม่ถูกต้อง (เบอร์มือถือไทย 10 หลัก เช่น 0812345678)" }, 400);
  const now = Date.now();
  const recent = await prisma.otpCode.findMany({ where: { phone, createdAt: { gte: new Date(now - 3600e3) } }, orderBy: { createdAt: "desc" } });
  const wait = recent[0] ? 60 - Math.floor((now - +recent[0].createdAt) / 1000) : 0;
  if (wait > 0) return c.json({ error: `ขอรหัสใหม่ได้ใน ${wait} วินาที`, retryAfter: wait }, 429);
  if (recent.length >= 5) return c.json({ error: "ขอรหัสบ่อยเกินไป ลองใหม่ภายใน 1 ชั่วโมง" }, 429);

  let sms;
  try { sms = getSmsProvider(); } catch { return c.json({ error: "SMS provider is not configured" }, 500); }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const row = await prisma.otpCode.create({ data: { phone, codeHash: hashOtp(phone, code), expiresAt: new Date(now + 5 * 60e3) } });
  try { await sms.send(phone, `รหัสยืนยัน ${code} หมดอายุใน 5 นาที ห้ามบอกผู้อื่น`); }
  catch { await prisma.otpCode.delete({ where: { id: row.id } }).catch(() => {}); return c.json({ error: "ส่ง SMS ไม่สำเร็จ ลองใหม่อีกครั้ง" }, 502); }
  return c.json({ ok: true, expiresIn: 300, ...(sms.isConsole && process.env.NODE_ENV !== "production" && { devCode: code }) });
});

app.post("/otp/verify", async (c) => {
  const BAD = () => c.json({ error: "รหัสไม่ถูกต้องหรือหมดอายุ" }, 400);
  const b = await c.req.json().catch(() => null);
  const phone = normalizeThaiPhone(b?.phone);
  const code = String(b?.code ?? "").trim();
  if (!phone || !/^\d{6}$/.test(code)) return BAD();
  const otp = await prisma.otpCode.findFirst({ where: { phone, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!otp) return BAD();
  const bump = await prisma.otpCode.updateMany({ where: { id: otp.id, attempts: { lt: 5 }, consumedAt: null }, data: { attempts: { increment: 1 } } });
  if (bump.count === 0) return c.json({ error: "ลองผิดเกินกำหนด กรุณาขอรหัสใหม่" }, 400);
  if (!safeEqual(otp.codeHash, hashOtp(phone, code))) return BAD();
  const used = await prisma.otpCode.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (used.count === 0) return BAD();

  const user = await prisma.user.upsert({ where: { phone }, create: { phone }, update: {} });
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await prisma.session.create({ data: { tokenHash: sha256(token), userId: user.id, expiresAt } });
  prisma.otpCode.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 864e5) } } }).catch(() => {});
  return c.json({ token, expiresAt, user: { id: user.id, name: user.name }, needsName: !user.name }); // web ตั้ง cookie HttpOnly ให้
});

app.get("/session", async (c) => {
  const token = c.req.query("token");
  const s = token ? await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } }) : null;
  if (!s || s.expiresAt < new Date()) return c.json({ user: null });
  return c.json({ user: { id: s.user.id, name: s.user.name, phone: maskPhone(s.user.phone) } });
});

app.patch("/users/:id", async (c) => {
  const b = await c.req.json().catch(() => null);
  const name = typeof b?.name === "string" ? b.name.trim().slice(0, 40) : "";
  if (!name) return c.json({ error: "กรอกชื่อที่ใช้แสดง" }, 400);
  await prisma.user.update({ where: { id: Number(c.req.param("id")) }, data: { name } });
  return c.json({ user: { id: Number(c.req.param("id")), name } });
});

app.post("/logout", async (c) => {
  const b = await c.req.json().catch(() => null);
  if (typeof b?.token === "string") await prisma.session.deleteMany({ where: { tokenHash: sha256(b.token) } });
  return c.json({ ok: true });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4006) });
