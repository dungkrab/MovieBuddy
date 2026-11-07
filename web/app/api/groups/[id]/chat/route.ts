import { getCurrentUser } from "@/lib/auth";
import { forward } from "@/lib/svc";

type P = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: P) {
  const { id } = await params;
  return forward("chat", `/groups/${Number(id)}/messages${new URL(req.url).search}`, { user: await getCurrentUser() });
}
export async function POST(req: Request, { params }: P) {
  const { id } = await params;
  return forward("chat", `/groups/${Number(id)}/messages`, { method: "POST", body: await req.json().catch(() => null), user: await getCurrentUser() });
}
