/** ตรวจและทำอีเมลให้เป็นรูปแบบเดียวกัน (ตัดช่องว่าง + ตัวพิมพ์เล็ก) — คืน null ถ้ารูปแบบไม่ถูกต้อง */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const e = input.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}
/** ซ่อนอีเมลก่อนส่งให้เบราว์เซอร์ เช่น somchai@example.com → so***@example.com */
export const maskEmail = (e: string) => { const [u, d] = e.split("@"); return `${u.slice(0, 2)}***@${d}`; };
