import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { forward } from "@/lib/svc";

export async function GET() { return NextResponse.json({ user: await getCurrentUser() }); }
export async function PATCH(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  return forward("auth", `/users/${u.id}`, { method: "PATCH", body: await req.json().catch(() => null) });
}
