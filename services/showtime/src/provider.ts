export type Format = "2D" | "3D" | "IMAX" | "4DX";
export type Lang = "พากย์ไทย" | "ซับไทย" | "ต้นฉบับ";
export type Slot = { cinemaId: number; movieId: number; startTime: string; format: Format; language: Lang };
export type ShowtimeQuery = { cinemaIds: number[]; movieIds: number[]; date: string }; // date = YYYY-MM-DD (เวลาไทย)

/** สลับแหล่งข้อมูลรอบฉายได้โดย implement interface นี้ */
export interface ShowtimeProvider {
  readonly isMock: boolean;
  getShowtimes(q: ShowtimeQuery): Promise<Slot[]>;
}
