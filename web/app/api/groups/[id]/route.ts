import { getCurrentUser } from "@/lib/auth";
import { forward } from "@/lib/svc";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forward("group", `/groups/${Number(id)}`, { method: "DELETE", user: await getCurrentUser() });
}
