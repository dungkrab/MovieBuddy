import { NextResponse } from "next/server";
import { COOKIE } from "@/lib/auth";
import { call } from "@/lib/svc";

export async function POST(req: Request) {
  try {
    const r = await call("auth", "/otp/verify", { method: "POST", body: await req.json().catch(() => null) });
    if (!r.ok) return NextResponse.json(r.data, { status: r.status });
    const { token, expiresAt, ...rest } = r.data;
    const res = NextResponse.json(rest);
    res.cookies.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(expiresAt) });
    return res;
  } catch { return NextResponse.json({ error: "auth-service unavailable" }, { status: 503 }); }
}
