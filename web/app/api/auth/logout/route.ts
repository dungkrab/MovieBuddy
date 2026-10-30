import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth";
import { call } from "@/lib/svc";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await call("auth", "/logout", { method: "POST", body: { token } }).catch(() => {});
  jar.delete(COOKIE);
  return NextResponse.json({ ok: true });
}
