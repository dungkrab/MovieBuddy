import Redis, { Cluster } from "ioredis";

// สร้าง client สำหรับ ElastiCache (Valkey/Redis) จาก env
//   REDIS_URL      redis://host:6379 (ไม่เข้ารหัส) | rediss://[user:pass@]host:6379 (TLS — ElastiCache ที่เปิด in-transit encryption / Serverless)
//   REDIS_CLUSTER  "true" เมื่อใช้ cluster mode (รวมถึง ElastiCache Serverless)
// ไม่ตั้ง REDIS_URL → คืน null (ผู้เรียกต้องถอยไปใช้หน่วยความจำของ process)

let lastLog = 0;
export function logRedisErr(where: string, e: any) { // log ไม่ถี่เกินไป เพื่อให้เห็นสาเหตุจริงแต่ไม่ท่วม log
  if (Date.now() - lastLog < 30_000) return;
  lastLog = Date.now();
  console.error(`[redis] ${where}:`, e?.code ?? "", e?.message ?? e);
}

/** failFast: คำสั่งที่ส่งตอนยังไม่เชื่อมต่อจะ error ทันที (เหมาะกับ publish/get ที่มีทางสำรอง); subscriber ไม่ควรใช้ */
export function createRedis(tag: string, opts: { failFast?: boolean } = {}): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) { console.warn(`[redis:${tag}] ไม่ได้ตั้ง REDIS_URL → ไม่ใช้ Redis`); return null; }
  const u = new URL(url);
  const tls = u.protocol === "rediss:" ? {} : undefined;
  const host = u.hostname, port = Number(u.port || 6379);
  const username = u.username ? decodeURIComponent(u.username) : undefined;
  const password = u.password ? decodeURIComponent(u.password) : undefined;
  const base = opts.failFast ? { connectTimeout: 5000, maxRetriesPerRequest: 1, enableOfflineQueue: false } : { connectTimeout: 5000 };

  const c: Redis | Cluster = process.env.REDIS_CLUSTER === "true"
    ? new Cluster([{ host, port }], {
        dnsLookup: (address, cb) => cb(null, address), // จำเป็นเมื่อใช้ TLS กับ ElastiCache cluster
        redisOptions: { ...base, tls, username, password },
        ...(opts.failFast && { enableOfflineQueue: false }),
      })
    : new Redis({ host, port, tls, username, password, ...base });

  c.on("ready", () => console.log(`[redis:${tag}] เชื่อมต่อ ${host}:${port} สำเร็จ${tls ? " (TLS)" : ""}`));
  c.on("error", (e) => logRedisErr(`${tag} error`, e));
  return c as unknown as Redis; // Cluster มี subscribe/publish/on เหมือนกัน — cast เพื่อให้ type ใช้งานง่าย
}