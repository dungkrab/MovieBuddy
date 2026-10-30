"use client";
import Link from "next/link";
import { useState } from "react";

const hm = (s: string) => new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

/** ปุ่มเวลารอบฉาย — กดแล้วเลือก "สร้างกลุ่ม" หรือ "ค้นหากลุ่ม" ของหนัง/วัน/เวลานั้น */
export default function TimeSlot(p: { movieId: number; cinemaId: number; startTime: string; format: string; language: string }) {
  const [open, setOpen] = useState(false);
  const date = new Date(p.startTime).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD (เวลาไทย)
  const href = (mode: "create" | "search") => `/movies/${p.movieId}?mode=${mode}&cinema=${p.cinemaId}&date=${date}&time=${hm(p.startTime)}#groups`;
  return (
    <span className="relative inline-block">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:border-red-600 dark:border-zinc-700">
        <b>{new Date(p.startTime).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}</b>{" "}
        <span className="text-xs text-zinc-500">{p.format} · {p.language}</span>
      </button>
      {open && (
        <span className="absolute left-0 top-full z-10 mt-1 flex w-48 flex-col rounded-lg border border-zinc-200 bg-white p-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <Link href={href("create")} onClick={() => setOpen(false)} className="rounded px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800">＋ สร้างกลุ่มรอบนี้</Link>
          <Link href={href("search")} onClick={() => setOpen(false)} className="rounded px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800">🔍 ค้นหากลุ่มรอบนี้</Link>
        </span>
      )}
    </span>
  );
}
