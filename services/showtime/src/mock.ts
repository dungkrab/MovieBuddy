import type { Format, Lang, ShowtimeProvider, ShowtimeQuery, Slot } from "./provider";

// สุ่มแบบ deterministic (ผลเดิมทุกครั้งสำหรับ สาขา+หนัง+วัน) จึงไม่ต้องเขียนลง DB
function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const FORMATS: Format[] = ["2D", "2D", "3D", "IMAX", "4DX"];
const LANGS: Lang[] = ["พากย์ไทย", "ซับไทย", "ซับไทย", "ต้นฉบับ"];

export class MockShowtimeProvider implements ShowtimeProvider {
  readonly isMock = true;
  async getShowtimes({ cinemaIds, movieIds, date }: ShowtimeQuery): Promise<Slot[]> {
    const out: Slot[] = [];
    for (const cinemaId of cinemaIds) for (const movieId of movieIds) {
      if (hash(`${cinemaId}:${movieId}`) % 100 >= 70) continue; // สาขานี้ไม่ฉายเรื่องนี้
      const h = hash(`${cinemaId}:${movieId}:${date}`);
      const n = 3 + (h % 3);
      for (let i = 0; i < n; i++) {
        const x = hash(`${h}:${i}`);
        const hh = 10 + i * 3 + (x % 2), mm = ["00", "15", "30", "45"][x % 4];
        if (hh > 23) continue;
        out.push({ cinemaId, movieId, startTime: `${date}T${String(hh).padStart(2, "0")}:${mm}:00+07:00`, format: FORMATS[x % FORMATS.length], language: LANGS[(x >> 3) % LANGS.length] });
      }
    }
    return out;
  }
}
