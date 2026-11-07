// พิกัด GPS → จังหวัด/เขต(อำเภอ)/แขวง(ตำบล) ตามรหัสในฐานข้อมูลของเรา
// ใช้ Nominatim (OpenStreetMap) แปลงพิกัดเป็นที่อยู่ แล้วจับคู่กับตาราง provinces/districts/subdistricts
// หมายเหตุ: Nominatim สาธารณะจำกัด 1 req/วินาที และห้ามใช้หนัก — production ควรตั้ง NOMINATIM_URL เป็นของตัวเอง

export type Row = { code: string; nameTh: string };
export type Place = { province: Row; district: Row | null; subdistrict: Row | null };
export type Db = {
  provinces(): Promise<Row[]>;
  districts(provinceCode: string): Promise<Row[]>;
  subdistricts(districtCode: string): Promise<Row[]>;
};
type Addr = Record<string, string | undefined>;

const ADMIN_PREFIX = /^(จังหวัด|กิ่งอำเภอ|อำเภอ|เขต|ตำบล|แขวง)\s*/;
const DISTRICT_PREFIX = /^(กิ่งอำเภอ|อำเภอ|เขต)/;
const SUB_PREFIX = /^(ตำบล|แขวง)/;
export const norm = (s?: string) => (s ?? "").trim().replace(ADMIN_PREFIX, "").replace(/\s+/g, "");

// ขอบเขตคร่าวๆ ของประเทศไทย ใช้ตัดคำขอที่ไม่ต้องยิง geocoder
export const inThailand = (lat: number, lng: number) => lat >= 5.5 && lat <= 20.6 && lng >= 97.3 && lng <= 105.7;

function pick(rows: Row[], candidates: (string | undefined)[]): Row | null {
  for (const c of candidates) {
    const n = norm(c);
    if (!n) continue;
    const hit = rows.find((r) => norm(r.nameTh) === n);
    if (hit) return hit;
  }
  return null;
}

/** จับคู่ address ของ Nominatim กับรหัสพื้นที่ในระบบ (แยกส่วนนี้ออกมาให้เทสต์ได้โดยไม่ต้องต่อเน็ต/DB) */
export async function resolvePlace(a: Addr, db: Db): Promise<Place | null> {
  if (a.country_code && a.country_code.toLowerCase() !== "th") return null;

  // 1) จังหวัด: ใช้ ISO3166-2 (TH-10 → "10" ตรงกับรหัสกรมการปกครองเกือบทั้งหมด) ก่อน ไม่ได้ค่อยจับคู่ชื่อ
  const provinces = await db.provinces();
  const iso = (a["ISO3166-2-lvl4"] ?? "").match(/^TH-(\d{2})$/)?.[1];
  const province = (iso && provinces.find((p) => p.code === iso)) || pick(provinces, [a.state, a.province, a.city]);
  if (!province) return null;

  // 2) เขต/อำเภอ: ตัดค่าที่ขึ้นต้นด้วย ตำบล/แขวง ออก กันชื่อชนกัน (เช่น เขตปทุมวัน vs แขวงปทุมวัน)
  const districts = await db.districts(province.code);
  const dCands = [a.city_district, a.county, a.district, a.municipality, a.town, a.city].filter((v) => v && !SUB_PREFIX.test(v.trim()));
  const district = pick(districts, dCands);
  if (!district) return { province, district: null, subdistrict: null };

  // 3) แขวง/ตำบล: ตัดค่าที่ขึ้นต้นด้วย เขต/อำเภอ ออกเช่นกัน
  const subs = await db.subdistricts(district.code);
  const sCands = [a.suburb, a.village, a.hamlet, a.quarter, a.neighbourhood, a.town, a.city_district].filter((v) => v && !DISTRICT_PREFIX.test(v.trim()));
  const subdistrict = pick(subs, sCands);
  return { province, district, subdistrict };
}

// ---- เรียก Nominatim: คิวทีละคำขอ ห่างกัน ≥1.1 วินาที + แคชตามพิกัด (ทศนิยม 4 ตำแหน่ง ≈ 11 ม.) ----
const BASE = (process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const UA = process.env.GEOCODER_USER_AGENT ?? "MovieBuddy/1.0 (set GEOCODER_USER_AGENT)";
const cache = new Map<string, Place | null>();
let chain: Promise<unknown> = Promise.resolve();
let last = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

export async function reverseGeocode(db: Db, lat: number, lng: number): Promise<Place | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key)!;
  const url = `${BASE}/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=th&lat=${lat}&lon=${lng}`;
  const json: any = await throttled(async () => {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`geocoder HTTP ${res.status}`);
    return res.json();
  });
  const place = json?.address ? await resolvePlace(json.address, db) : null;
  if (cache.size >= 5000) cache.delete(cache.keys().next().value as string); // กันโตไม่จำกัด
  cache.set(key, place);
  return place;
}
