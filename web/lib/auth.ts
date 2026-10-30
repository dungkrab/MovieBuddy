import { cookies } from "next/headers";
import { call, type SessionUser } from "./svc";
export const COOKIE = "session";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try { const r = await call("auth", `/session?token=${encodeURIComponent(token)}`); return r.ok ? r.data.user ?? null : null; } catch { return null; }
}
