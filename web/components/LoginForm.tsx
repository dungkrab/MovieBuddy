"use client";
import { useEffect, useState } from "react";

const post = (url: string, body: unknown, method = "POST") =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

export default function LoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<"phone" | "code" | "name">("phone");
  const [phone, setPhone] = useState(""); const [code, setCode] = useState(""); const [name, setName] = useState("");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [cool, setCool] = useState(0); const [devCode, setDevCode] = useState("");

  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.user && !d.user.name) setStep("name"); else if (d.user) location.assign(next); }).catch(() => {}); }, [next]);
  useEffect(() => { if (cool > 0) { const t = setTimeout(() => setCool(cool - 1), 1000); return () => clearTimeout(t); } }, [cool]);

  async function send() {
    setBusy(true); setMsg("");
    const { ok, data } = await post("/api/auth/otp/request", { phone });
    setBusy(false);
    if (!ok) { if (data.retryAfter) setCool(data.retryAfter); return setMsg(data.error ?? "ส่งรหัสไม่สำเร็จ"); }
    setDevCode(data.devCode ?? ""); setCode(""); setStep("code"); setCool(60);
  }
  async function verify() {
    setBusy(true); setMsg("");
    const { ok, data } = await post("/api/auth/otp/verify", { phone, code });
    setBusy(false);
    if (!ok) return setMsg(data.error ?? "ยืนยันไม่สำเร็จ");
    if (data.needsName) setStep("name"); else location.assign(next);
  }
  async function saveName() {
    setBusy(true); setMsg("");
    const { ok, data } = await post("/api/auth/me", { name }, "PATCH");
    setBusy(false);
    if (!ok) return setMsg(data.error ?? "บันทึกไม่สำเร็จ");
    location.assign(next);
  }

  return (
    <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
      <h1 className="text-xl font-bold">เข้าสู่ระบบ</h1>
      {step === "phone" && <>
        <p className="text-sm text-zinc-500">กรอกเบอร์มือถือเพื่อรับรหัส OTP ทาง SMS</p>
        <input className="field w-full" inputMode="tel" autoComplete="tel" placeholder="08x-xxx-xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button disabled={busy || !phone} onClick={send} className="w-full rounded-lg bg-red-600 py-2 text-white disabled:opacity-50">ขอรหัส OTP</button>
      </>}
      {step === "code" && <>
        <p className="text-sm text-zinc-500">ส่งรหัส 6 หลักไปที่ {phone} แล้ว (หมดอายุใน 5 นาที)</p>
        {devCode && <p className="rounded bg-amber-100 p-2 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">โหมดทดสอบ: รหัสคือ <b>{devCode}</b></p>}
        <input className="field w-full text-center text-lg tracking-widest" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()} />
        <button disabled={busy || code.length !== 6} onClick={verify} className="w-full rounded-lg bg-red-600 py-2 text-white disabled:opacity-50">ยืนยัน</button>
        <div className="flex justify-between text-sm">
          <button className="underline" onClick={() => { setStep("phone"); setMsg(""); }}>เปลี่ยนเบอร์</button>
          <button className="underline disabled:no-underline disabled:opacity-50" disabled={cool > 0 || busy} onClick={send}>{cool > 0 ? `ส่งอีกครั้งใน ${cool} วิ` : "ส่งรหัสอีกครั้ง"}</button>
        </div>
      </>}
      {step === "name" && <>
        <p className="text-sm text-zinc-500">ตั้งชื่อที่จะแสดงในกลุ่ม (ไม่แสดงเบอร์โทรของคุณ)</p>
        <input className="field w-full" maxLength={40} placeholder="ชื่อ/ชื่อเล่น" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && saveName()} />
        <button disabled={busy || !name.trim()} onClick={saveName} className="w-full rounded-lg bg-red-600 py-2 text-white disabled:opacity-50">เริ่มใช้งาน</button>
      </>}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}
