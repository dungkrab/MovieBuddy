/** เบอร์มือถือไทย (06/08/09) → E.164 เช่น 0812345678 → +66812345678 */
export function normalizeThaiPhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const m = input.replace(/[\s-]/g, "").match(/^(?:\+66|66|0)([689]\d{8})$/);
  return m ? `+66${m[1]}` : null;
}
export const maskPhone = (e164: string) => { const l = "0" + e164.slice(3); return `${l.slice(0, 3)}-xxx-${l.slice(-4)}`; };
