import { forward } from "@/lib/svc";
export const GET = (req: Request) => forward("cinema", `/cinemas${new URL(req.url).search}`);
