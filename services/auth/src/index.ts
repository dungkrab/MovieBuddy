import { serve } from "@hono/node-server";
import { Prisma, PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { guard } from "../../shared/guard";
import * as cognito from "./cognito";
import { AuthError } from "./cognito";
import { maskPhone, normalizeThaiPhone } from "./phone";

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
const phoneOf = (b: any) => { const p = normalizeThaiPhone(b.phone); if (!p) throw new AuthError(400, "เบอร์ไม่ถูกต้อง (เบอร์มือถือไทย 10 หลัก เช่น 0812345678)"); return p; };
const codeOf = (b: any) => { const s = String(b.code ?? "").trim(); if (!/^\d{4,8}$/.test(s)) throw new AuthError(400, "รหัสไม่ถูกต้องหรือหมดอายุ"); return s; };
const passwordOf = (b: any) => { const s = typeof b.password === "string" ? b.password : ""; if (s.length < 8 || s.length > 64 || !/\d/.test(s)) throw new AuthError(400, "รหัสผ่านต้องยาว 8–64 ตัวอักษร และมีตัวเลข"); return s; };
const tokenOf = (c: any) => c.req.header("authorization")?.replace(/^Bearer /i, "") ?? "";

/** หาผู้ใช้ภายในจาก sub ของ Cognito; ครั้งแรกจะดึงเบอร์/ชื่อจาก Cognito แล้วสร้างแถว หรือผูกกับผู้ใช้เก่า (ระบบ OTP) ด้วยเบอร์โทรเดียวกัน */
async function userFor(sub: string, accessToken: string) {
  const found = await prisma.user.findUnique({ where: { cognitoSub: sub } });
  if (found) return found;
  const p = await cognito.getProfile(accessToken);
  const phone = normalizeThaiPhone(p.phone);
  if (!phone) throw new AuthError(502, "บัญชี Cognito ไม่มีเบอร์โทร");
  const name = p.name?.trim().slice(0, 40) || null;
  try {
    const legacy = await prisma.user.findUnique({ where: { phone } });
    if (legacy) return await prisma.user.update({ where: { id: legacy.id }, data: { cognitoSub: sub, name: legacy.name ?? name } }); // เบอร์ผ่าน SMS ยืนยันแล้ว → ผูกบัญชีเก่าให้ (กลุ่มเดิมยังอยู่)
    return await prisma.user.create({ data: { cognitoSub: sub, phone, name } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") { // คำขอแรกสองอันชนกัน → ใช้แถวที่อีกอันสร้างไว้
      const again = await prisma.user.findUnique({ where: { cognitoSub: sub } });
      if (again) return again;
    }
    throw e;
  }
}
const publicUser = (u: { id: number; name: string | null; phone: string }) => ({ id: u.id, name: u.name, phone: maskPhone(u.phone) });

app.post("/signup", async (c) => {
  const b = await body(c);
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 40) : "";
  if (!name) throw new AuthError(400, "กรอกชื่อที่ใช้แสดง");
  await cognito.signUp(phoneOf(b), passwordOf(b), name);
  return c.json({ ok: true, needsConfirm: true });
});
app.post("/confirm", async (c) => { const b = await body(c); await cognito.confirmSignUp(phoneOf(b), codeOf(b)); return c.json({ ok: true }); });
app.post("/resend", async (c) => { const b = await body(c); await cognito.resendCode(phoneOf(b)); return c.json({ ok: true }); });

app.post("/login", async (c) => {
  const b = await body(c);
  const t = await cognito.login(phoneOf(b), typeof b.password === "string" ? b.password : "");
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

// ลืมรหัสผ่าน: ตอบ ok เสมอ ไม่บอกว่าเบอร์นี้มีบัญชีหรือไม่
app.post("/password/forgot", async (c) => {
  const phone = phoneOf(await body(c));
  try { await cognito.forgotPassword(phone); }
  catch (e) { if (!(e instanceof AuthError && [400, 401, 403, 404].includes(e.status))) throw e; }
  return c.json({ ok: true });
});
app.post("/password/reset", async (c) => { const b = await body(c); await cognito.resetPassword(phoneOf(b), codeOf(b), passwordOf(b)); return c.json({ ok: true }); });

app.patch("/users/:id", async (c) => {
  const b = await body(c);
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 40) : "";
  if (!name) return c.json({ error: "กรอกชื่อที่ใช้แสดง" }, 400);
  const id = Number(c.req.param("id"));
  await prisma.user.update({ where: { id }, data: { name } });
  return c.json({ user: { id, name } });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 4006) });
