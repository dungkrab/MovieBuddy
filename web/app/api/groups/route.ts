import { getCurrentUser } from "@/lib/auth";
import { forward } from "@/lib/svc";

export async function GET(req: Request) {
  return forward("group", `/groups${new URL(req.url).search}`, { user: await getCurrentUser() });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return forward("group", "/groups", { method: "POST", body, user: await getCurrentUser() });
}
