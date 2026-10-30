import { forward } from "@/lib/svc";
export async function POST(req: Request) {
  return forward("auth", "/otp/request", { method: "POST", body: await req.json().catch(() => null) });
}
