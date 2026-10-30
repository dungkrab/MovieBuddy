import { forward } from "@/lib/svc";
export const GET = (req: Request) => forward("location", `/districts${new URL(req.url).search}`);
