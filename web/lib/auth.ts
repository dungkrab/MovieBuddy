import { cookies } from "next/headers";
import { call, type SessionUser } from "./svc";

export const COOKIE = "session";          // Cognito access token (หมดอายุสั้น ตามที่ตั้งใน user pool/app client)
export const REFRESH_COOKIE = "refresh";  // Cognito refresh token (ใช้ขอ access token ใหม่)
export const cookieOpts = () => ({
  httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 30 * 864e2,
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
});

/** ผู้ใช้ปัจจุบันจากคุกกี้; access token หมดอายุ → ใช้ refresh token ขอใหม่แล้วเซ็ตคุกกี้ (ทำได้เมื่อเรียกจาก Route Handler) */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value, refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!token && !refresh) return null;
  const session = (t: string) => call("auth", "/session", { headers: { authorization: `Bearer ${t}` } });
  try {
    if (token) {
      const r = await session(token);
      if (r.ok && r.data.user) return r.data.user;
      if (r.data.reason !== "expired") return null;
    }
    if (!refresh) return null;
    const rr = await call("auth", "/refresh", { method: "POST", body: { refreshToken: refresh } });
    if (!rr.ok) return null;
    try { jar.set(COOKIE, rr.data.accessToken, cookieOpts()); } catch { /* อยู่ใน Server Component: เซ็ตคุกกี้ไม่ได้ รอบหน้าจะ refresh อีกครั้ง */ }
    const r2 = await session(rr.data.accessToken);
    return r2.ok ? r2.data.user ?? null : null;
  } catch { return null; }
}
