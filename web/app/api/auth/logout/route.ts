import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import { call } from "@/lib/svc";

export async function POST() {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (refreshToken) await call("auth", "/logout", { method: "POST", body: { refreshToken } }).catch(() => {}); // เพิกถอน refresh token ที่ Cognito
  jar.delete(COOKIE); jar.delete(REFRESH_COOKIE);
  return NextResponse.json({ ok: true });
}
