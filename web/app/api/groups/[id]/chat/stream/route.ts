import { getCurrentUser } from "@/lib/auth";
import { proxyStream } from "@/lib/svc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyStream("chat", `/groups/${Number(id)}/stream${new URL(req.url).search}`, req, await getCurrentUser());
}
