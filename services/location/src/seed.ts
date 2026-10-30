import type { PrismaClient } from "@prisma/client";
const BASE = "https://raw.githubusercontent.com/kongvut/thai-province-data/master/api/latest";
const nm = (o: any, k: "th" | "en") => (typeof o?.name === "object" ? o.name?.[k] : undefined) ?? o?.[`name_${k}`] ?? "";
async function getJson(file: string): Promise<any[]> {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

export async function ensureSeed(prisma: PrismaClient) {
  if ((await prisma.province.count()) > 0) return;
  const [provinces, districts] = await Promise.all([getJson("province.json"), getJson("district.json")]);
  const code = new Map<number, string>(); // id ภายในชุดข้อมูล → รหัส DOPA 2 หลัก (จาก 2 หลักแรกของรหัสอำเภอ)
  for (const d of districts) if (!code.has(d.province_id)) code.set(d.province_id, String(d.id).slice(0, 2));
  await prisma.province.createMany({ data: provinces.filter((p) => code.has(p.id)).map((p) => ({ code: code.get(p.id)!, nameTh: nm(p, "th"), nameEn: nm(p, "en") })), skipDuplicates: true });
  await prisma.district.createMany({ data: districts.map((d) => ({ code: String(d.id), provinceCode: code.get(d.province_id)!, nameTh: nm(d, "th"), nameEn: nm(d, "en") })), skipDuplicates: true });
  try {
    const subs = await getJson("sub_district.json");
    await prisma.subdistrict.createMany({ data: subs.map((s) => ({ code: String(s.id), districtCode: String(s.district_id ?? s.amphure_id), nameTh: nm(s, "th"), nameEn: nm(s, "en") })), skipDuplicates: true });
  } catch (e) { console.warn("ข้าม seed ตำบล:", (e as Error).message); }
  console.log("location seed done");
}
