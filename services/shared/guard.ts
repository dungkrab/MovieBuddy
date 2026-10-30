/** ทุก service ยกเว้น /health ต้องแนบ x-internal-key (เรียกได้เฉพาะภายในเครือข่าย — ภายนอกเข้าได้เฉพาะ web) */
export function guard() {
  const key = process.env.INTERNAL_KEY;
  if (!key || key.length < 16) throw new Error("INTERNAL_KEY must be set (>= 16 chars)");
  return async (c: any, next: () => Promise<void>) => {
    if (c.req.path === "/health") return next();
    if (c.req.header("x-internal-key") !== key) return c.json({ error: "forbidden" }, 403);
    return next();
  };
}
