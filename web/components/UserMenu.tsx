"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function UserMenu() {
  const [me, setMe] = useState<{ name: string | null; phone: string } | null | undefined>(undefined);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => setMe(d.user)).catch(() => setMe(null)); }, []);
  if (me === undefined) return null;
  if (!me) return <Link href="/login" className="ml-4 rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white">เข้าสู่ระบบ</Link>;
  return (
    <span className="ml-4 flex items-center gap-2 text-sm">
      <span>{me.name ?? me.phone}</span>
      <button className="underline" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); location.reload(); }}>ออกจากระบบ</button>
    </span>
  );
}
