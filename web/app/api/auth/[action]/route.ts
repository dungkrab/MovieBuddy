import { NextResponse } from "next/server";
import { COOKIE, REFRESH_COOKIE, cookieOpts } from "@/lib/auth";
import { call } from "@/lib/svc";

// ล็อกอินด้วยเบอร์โทร + รหัสผ่านผ่าน Amazon Cognito (auth-service เป็นผู้คุยกับ Cognito)
const PATHS: Record<string, string> = { signup: "/signup", confirm: "/confirm", resend: "/resend", login: "/login", forgot: "/password/forgot", reset: "/password/reset" };

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const path = PATHS[action];
  if (!path) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const r = await call("auth", path, { method: "POST", body: await req.json().catch(() => null) });
    if (!r.ok || action !== "login") return NextResponse.json(r.data, { status: r.status });
    const { accessToken, refreshToken, accessExp: _exp, ...rest } = r.data; // โทเคนอยู่ใน cookie HttpOnly เท่านั้น ไม่ส่งให้ JS ฝั่งเบราว์เซอร์
    const res = NextResponse.json(rest);
    res.cookies.set(COOKIE, accessToken, cookieOpts());
    res.cookies.set(REFRESH_COOKIE, refreshToken, cookieOpts());
    return res;
  } catch { return NextResponse.json({ error: "auth-service unavailable" }, { status: 503 }); }
}
