import { getCurrentUser } from "@/lib/auth";
import { forward } from "@/lib/svc";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return forward("group", `/groups/${Number(id)}/join`, { method: "POST", body, user: await getCurrentUser() });
}
