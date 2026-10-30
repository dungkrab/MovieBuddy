import Redis from "ioredis";

// Redis ใช้ร่วมกันได้ทุก service (แยกด้วย prefix) — ถ้าไม่ตั้ง REDIS_URL หรือ Redis ล่ม จะใช้หน่วยความจำของ process แทน
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false }) : null;
redis?.on("error", () => {});
const mem = new Map<string, { v: string; exp: number }>();

export async function cacheGet(key: string): Promise<string | null> {
  if (redis) { try { const v = await redis.get(key); if (v) return v; } catch {} }
  const m = mem.get(key);
  return m && m.exp > Date.now() ? m.v : null;
}
export async function cacheSet(key: string, val: string, ttlSec: number) {
  mem.set(key, { v: val, exp: Date.now() + ttlSec * 1000 });
  if (redis) { try { await redis.set(key, val, "EX", ttlSec); } catch {} }
}
