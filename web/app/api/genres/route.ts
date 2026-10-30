import { forward } from "@/lib/svc";
export const GET = () => forward("movie", "/genres");
