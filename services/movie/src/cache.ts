import Redis, { Cluster } from "ioredis";

// แคชผ่าน Redis/Valkey (ElastiCache) — ไม่ตั้ง REDIS_URL หรือเชื่อมต่อไม่ได้ จะใช้หน่วยความจำของ process แทน
//
//   REDIS_URL      redis://host:6379  (ไม่เข้ารหัส)  |  rediss://host:6379  (TLS — ElastiCache ที่เปิด in-transit encryption / Serverless ต้องใช้แบบนี้)
//                  ถ้ามี AUTH: rediss://default:<password>@host:6379
//   REDIS_CLUSTER  "true" เมื่อใช้ ElastiCache แบบ cluster mode enabled (รวมถึง Serverless)
const url = process.env.REDIS_URL;
const clusterMode = process.env.REDIS_CLUSTER === "true";

// log error ไม่ถี่เกินไป (ทุก 30 วินาที) เพื่อให้เห็นสาเหตุจริงแทนที่จะกลืนเงียบ
let lastLog = 0;
function logErr(where: string, e: any) {
  if (Date.now() - lastLog < 30_000) return;
  lastLog = Date.now();
  console.error(`[cache] ${where}:`, e?.code ?? "", e?.message ?? e);
}

function connect(): Redis | Cluster | null {
  if (!url) {
    console.warn("[cache] ไม่ได้ตั้ง REDIS_URL → ใช้หน่วยความจำของ process");
    return null;
  }
  const u = new URL(url);
  const tls = u.protocol === "rediss:" ? {} : undefined;
  const host = u.hostname, port = Number(u.port || 6379);
  const username = u.username ? decodeURIComponent(u.username) : undefined;
  const password = u.password ? decodeURIComponent(u.password) : undefined;
  const opts = { connectTimeout: 5000, maxRetriesPerRequest: 1, enableOfflineQueue: false };

  const c = clusterMode
    ? new Cluster([{ host, port }], {
        dnsLookup: (address, cb) => cb(null, address), // จำเป็นเมื่อใช้ TLS กับ ElastiCache cluster
        redisOptions: { ...opts, tls, username, password },
      })
    : new Redis({ host, port, tls, username, password, ...opts });

  c.on("ready", () => console.log(`[cache] เชื่อมต่อ ${clusterMode ? "cluster" : "Redis"} ${host}:${port} สำเร็จ${tls ? " (TLS)" : ""}`));
  c.on("error", (e) => logErr("เชื่อมต่อ/คำสั่งผิดพลาด", e));
  return c;
}

const redis = connect();
const mem = new Map<string, { v: string; exp: number }>();

/** ใช้ตรวจสถานะ เช่น ใส่ใน /health: "ready" | "connecting" | "off" ... */
export const cacheStatus = () => (redis ? redis.status : "off");

export async function cacheGet(key: string): Promise<string | null> {
  if (redis) { try { const v = await redis.get(key); if (v) return v; } catch (e) { logErr("get", e); } }
  const m = mem.get(key);
  return m && m.exp > Date.now() ? m.v : null;
}
export async function cacheSet(key: string, val: string, ttlSec: number) {
  mem.set(key, { v: val, exp: Date.now() + ttlSec * 1000 });
  if (redis) { try { await redis.set(key, val, "EX", ttlSec); } catch (e) { logErr("set", e); } }
}