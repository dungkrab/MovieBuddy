import { forward } from "@/lib/svc";
export const GET = (req: Request) => forward("location", `/reverse${new URL(req.url).search}`);
