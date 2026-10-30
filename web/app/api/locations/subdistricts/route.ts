import { forward } from "@/lib/svc";
export const GET = (req: Request) => forward("location", `/subdistricts${new URL(req.url).search}`);
