import { serve } from "@hono/node-server";
import { Prisma, PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { guard } from "../../shared/guard";
import * as cognito from "./cognito";
import { AuthError } from "./cognito";
import { maskEmail, normalizeEmail } from "./email";

const prisma = new PrismaClient();
const app = new Hono();
app.get("/health", (c) => c.json({ ok: true }));
app.use("*", guard());
cognito.config().catch((e) => { console.error("[auth] cognito config error:", e.message); if (process.env.NODE_ENV === "production") process.exit(1); }); // fail fast

app.onError((e, c) => {
  if (e instanceof AuthError) return c.json({ error: e.message, ...e.extra }, e.status as any);
  console.error("[auth] unhandled:", e);
  return c.json({ error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" }, 500);
});

const body = async (c: any) => (await c.req.json().catch(() => null)) ?? {};
const emailOf = (b: any) => { const e = normalizeEmail(b.email); if (!e) throw new AuthError(400, "อีเมลไม่ถูกต้อง"); return e; };
const codeOf = (b: any) => { const s = String(b.code ?? "").trim(); if (!/^\d{4,8}$/.test(s)) throw new AuthError(400, "รหัสไม่ถูกต้องหรือหมดอายุ"); return s; };
// password policy ของ Cognito user pool: ตัวเลข + อักขระพิเศษ + ตัวพิมพ์ใหญ่ + ตัวพิมพ์เล็ก (+ ยาวขั้นต่ำ 8) — ต้องตรงกับ LoginForm และค่าใน Cognito console
const SPECIAL = /[\^$*.\[\]{}()?\-"!@#%&\/\\,><':;|_~`+=]/;
const passwordOk = (s: string) => s.length >= 8 && s.length <= 64 && /\d/.test(s) && /[a-z]/.test(s) && /[A-Z]/.test(s) && SPECIAL.test(s);
const PASSWORD_MSG = "รหัสผ่านต้องยาว 8–64 ตัวอักษร และมีตัวพิมพ์เล็ก ตัวพิมพ์ใหญ่ ตัวเลข และอักขระพิเศษอย่างน้อยอย่างละ 1 ตัว";
const passwordOf = (b: any) => { const s = typeof b.password === "string" ? b.password : ""; if (!passwordOk(s)) throw new AuthError(400, PASSWORD_MSG); return s; };
const tokenOf = (c: any) => c.req.header("authorization")?.replace(/^Bearer /i, "") ?? "";

/** หาผู้ใช้ภายในจาก sub ของ Cognito; ครั้งแรกจะดึงอีเมล/ชื่อจาก Cognito แล้วสร้างแถว หรือผูกกับแถวเดิมที่อีเมลเดียวกัน (เช่น สร้าง user pool ใหม่ → sub เปลี่ยน) */
async function userFor(sub: string, accessToken: string) {
  const found = await prisma.user.findUnique({ where: { cognitoSub: sub } });
  if (found) return found;
  const p = await cognito.getProfile(accessToken);
  const email = normalizeEmail(p.email);
  if (!email) throw new AuthError(502, "บัญชี Cognito ไม่มีอีเมล");
  const name = p.name?.trim().slice(0, 40) || null;
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return await prisma.user.update({ where: { id: existing.id }, data: { cognitoSub: sub, name: existing.name ?? name } }); // อีเมลผ่านการยืนยันรหัสแล้ว (ล็อกอินได้เฉพาะบัญชีที่ confirm) → ผูกแถวเดิมให้ กลุ่มเดิมยังอยู่
    return await prisma.user.create({ data: { cognitoSub: sub, email, name } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") { // คำขอแรกสองอันชนกัน → ใช้แถวที่อีกอันสร้างไว้
      const again = await prisma.user.findUnique({ where: { cognitoSub: sub } });
      if (again) return again;
    }
    throw e;
  }
}
const publicUser = (u: { id: number; name: string | null; email: string }) => ({ id: u.id, name: u.name, email: maskEmail(u.email) });

app.post("/signup", async (c) => {
  const b = await body(c);
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 40) : "";
  if (!name) throw new AuthError(400, "กรอกชื่อที่ใช้แสดง");
  await cognito.signUp(emailOf(b), passwordOf(b), name);
  return c.json({ ok: true, needsConfirm: true });
});
app.post("/confirm", async (c) => { const b = await body(c); await cognito.confirmSignUp(emailOf(b), codeOf(b)); return c.json({ ok: true }); });
app.post("/resend", async (c) => { const b = await body(c); await cognito.resendCode(emailOf(b)); return c.json({ ok: true }); });

app.post("/login", async (c) => {
  const b = await body(c);
  const t = await cognito.login(emailOf(b), typeof b.password === "string" ? b.password : "");
  const v = await cognito.verifyAccessToken(t.accessToken);
  if (!v || "expired" in v) throw new AuthError(502, "ตรวจโทเคนไม่ผ่าน (ตั้งค่า issuer/JWKS ของ Cognito ถูกต้องหรือไม่)");
  const u = await userFor(v.sub, t.accessToken);
  return c.json({ ...t, user: publicUser(u), needsName: !u.name }); // web เก็บโทเคนใน cookie HttpOnly ไม่ส่งต่อให้เบราว์เซอร์
});
app.post("/refresh", async (c) => {
  const b = await body(c);
  if (typeof b.refreshToken !== "string" || !b.refreshToken) throw new AuthError(401, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  return c.json(await cognito.refresh(b.refreshToken));
});
app.get("/session", async (c) => {
  const token = tokenOf(c);
  const v = token ? await cognito.verifyAccessToken(token) : null;
  if (!v) return c.json({ user: null });
  if ("expired" in v) return c.json({ user: null, reason: "expired" });
  return c.json({ user: publicUser(await userFor(v.sub, token)) });
});
app.post("/logout", async (c) => { const b = await body(c); if (typeof b.refreshToken === "string" && b.refreshToken) await cognito.revoke(b.refreshToken); return c.json({ ok: true }); });

// ลืมรหัสผ่าน: ตอบ ok เสมอ ไม่บอกว่าอีเมลนี้มีบัญชีหรือไม่
app.post("/password/forgot", async (c) => {
  const email = emailOf(await body(c));
  try { await cognito.forgotPassword(email); }
  catch (e) { if (!(e instanceof AuthError && [400, 401, 403, 404].includes(e.status))) throw e; }
  return c.json({ ok: true });
});
app.post("/password/reset", async (c) => { const b = await body(c); await cognito.resetPassword(emailOf(b), codeOf(b), passwordOf(b)); return c.json({ ok: true }); });

app.patch("/users/:id", async (c) => {
  const b = await body(c);
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 40) : "";
  if (!name) return c.json({ error: "กรอกชื่อที่ใช้แสดง" }, 400);
  const id = Number(c.req.param("id"));
  await prisma.user.update({ where: { id }, data: { name } });
  return c.json({ user: { id, name } });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4006) });