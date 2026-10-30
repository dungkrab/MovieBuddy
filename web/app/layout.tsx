import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import Link from "next/link";
import UserMenu from "@/components/UserMenu";
import "./globals.css";

const font = Noto_Sans_Thai({ subsets: ["thai", "latin"], display: "swap" });
export const metadata: Metadata = { title: "ดูหนังเข้าโรงใกล้ฉัน", description: "หนังกำลังฉายและกำลังเข้า พร้อมรอบฉายตามจังหวัด/เขต" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={`${font.className} bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}>
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-6xl items-center px-4 py-3"><Link href="/" className="text-lg font-bold">🎬 ดูหนังเข้าโรงใกล้ฉัน</Link><Link href="/groups" className="ml-auto text-sm hover:underline">กลุ่มของฉัน</Link><UserMenu /></div>
        </header>
        <main className="mx-auto min-h-[70vh] max-w-6xl px-4 py-6">{children}</main>
        <footer className="border-t border-zinc-200 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" alt="TMDB" className="mx-auto mb-2 h-4" />
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </footer>
      </body>
    </html>
  );
}
