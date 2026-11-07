"use client";
import { useEffect, useState } from "react";

const post = (url: string, body: unknown, method = "POST") =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

type Mode = "login" | "signup" | "confirm" | "forgot" | "reset" | "name";
const btn = "w-full rounded-lg bg-red-600 py-2 text-white disabled:opacity-50";

// ล็อกอินด้วยเบอร์โทร + รหัสผ่าน (Amazon Cognito) — สมัครครั้งแรกต้องยืนยันรหัสที่ส่งทาง SMS
export default function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [phone, setPhone] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState(""); const [code, setCode] = useState("");
  const [msg, setMsg] = useState(""); const [info, setInfo] = useState(""); const [busy, setBusy] = useState(false); const [cool, setCool] = useState(0);

  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.user && !d.user.name) setMode("name"); else if (d.user) location.assign(next); }).catch(() => {}); }, [next]);
  useEffect(() => { if (cool > 0) { const t = setTimeout(() => setCool(cool - 1), 1000); return () => clearTimeout(t); } }, [cool]);

  const go = (m: Mode, i = "") => { setMode(m); setMsg(""); setInfo(i); setCode(""); };
  async function act(fn: () => Promise<void>) { setBusy(true); setMsg(""); try { await fn(); } finally { setBusy(false); } }

  const login = () => act(async () => {
    const { ok, data } = await post("/api/auth/login", { phone, password });
    if (ok) return data.needsName ? go("name") : location.assign(next);
    if (data.needsConfirm) return go("confirm", "เบอร์นี้ยังไม่ได้ยืนยัน — กดส่งรหัสอีกครั้งเพื่อรับรหัสใหม่ทาง SMS");
    setMsg(data.error ?? "เข้าสู่ระบบไม่สำเร็จ");
  });
  const signup = () => act(async () => {
    const { ok, data } = await post("/api/auth/signup", { phone, password, name });
    if (ok) { setCool(60); return go("confirm", "ส่งรหัส 6 หลักทาง SMS แล้ว"); }
    if (data.exists) return go("confirm", "เบอร์นี้สมัครไว้แล้ว — ถ้ายังไม่ได้ยืนยัน ใส่รหัส SMS หรือกดส่งรหัสอีกครั้ง");
    setMsg(data.error ?? "สมัครไม่สำเร็จ");
  });
  const confirm = () => act(async () => {
    const c = await post("/api/auth/confirm", { phone, code });
    if (!c.ok) return setMsg(c.data.error ?? "ยืนยันไม่สำเร็จ");
    const l = await post("/api/auth/login", { phone, password }); // ยืนยันเสร็จ เข้าสู่ระบบต่อให้เลย
    if (l.ok) return l.data.needsName ? go("name") : location.assign(next);
    go("login", "ยืนยันเบอร์แล้ว กรุณาเข้าสู่ระบบ");
  });
  const resend = () => act(async () => {
    const { ok, data } = await post("/api/auth/resend", { phone });
    if (!ok) return setMsg(data.error ?? "ส่งรหัสไม่สำเร็จ");
    setCool(60); setInfo("ส่งรหัสใหม่แล้ว");
  });
  const forgot = () => act(async () => {
    const { ok, data } = await post("/api/auth/forgot", { phone });
    if (!ok) return setMsg(data.error ?? "ส่งรหัสไม่สำเร็จ");
    setPassword(""); go("reset", "ถ้าเบอร์นี้มีบัญชี เราได้ส่งรหัส 6 หลักทาง SMS แล้ว");
  });
  const reset = () => act(async () => {
    const { ok, data } = await post("/api/auth/reset", { phone, code, password });
    if (!ok) return setMsg(data.error ?? "ตั้งรหัสผ่านไม่สำเร็จ");
    setPassword(""); go("login", "ตั้งรหัสผ่านใหม่แล้ว เข้าสู่ระบบได้เลย");
  });
  const saveName = () => act(async () => {
    const { ok, data } = await post("/api/auth/me", { name }, "PATCH");
    if (!ok) return setMsg(data.error ?? "บันทึกไม่สำเร็จ");
    location.assign(next);
  });

  const enter = (fn: () => void, can: boolean) => (e: React.KeyboardEvent) => { if (e.key === "Enter" && can && !busy) fn(); };
  const phoneInput = <input className="field w-full" inputMode="tel" autoComplete="tel" placeholder="เบอร์มือถือ 08x-xxx-xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />;
  const pwInput = (label: string, ac: string, on?: () => void) => <input className="field w-full" type="password" autoComplete={ac} placeholder={label} maxLength={64} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={on && enter(on, true)} />;
  const codeInput = <input className="field w-full text-center text-lg tracking-widest" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />;
  const link = "underline disabled:no-underline disabled:opacity-50";

  return (
    <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
      <h1 className="text-xl font-bold">{mode === "signup" ? "สมัครสมาชิก" : mode === "confirm" ? "ยืนยันเบอร์โทร" : mode === "forgot" || mode === "reset" ? "ลืมรหัสผ่าน" : mode === "name" ? "ตั้งชื่อที่แสดง" : "เข้าสู่ระบบ"}</h1>
      {info && <p className="rounded bg-zinc-100 p-2 text-sm dark:bg-zinc-800">{info}</p>}

      {mode === "login" && <>
        {phoneInput}{pwInput("รหัสผ่าน", "current-password", login)}
        <button disabled={busy || !phone || !password} onClick={login} className={btn}>เข้าสู่ระบบ</button>
        <div className="flex justify-between text-sm"><button className={link} onClick={() => go("signup")}>สมัครสมาชิก</button><button className={link} onClick={() => go("forgot")}>ลืมรหัสผ่าน</button></div>
      </>}

      {mode === "signup" && <>
        <input className="field w-full" maxLength={40} placeholder="ชื่อ/ชื่อเล่น (แสดงในกลุ่ม ไม่แสดงเบอร์)" value={name} onChange={(e) => setName(e.target.value)} />
        {phoneInput}{pwInput("รหัสผ่าน (8 ตัวขึ้นไป มีตัวเลข)", "new-password", signup)}
        <button disabled={busy || !phone || !name.trim() || password.length < 8} onClick={signup} className={btn}>สมัครและรับรหัส SMS</button>
        <button className={`${link} text-sm`} onClick={() => go("login")}>มีบัญชีแล้ว? เข้าสู่ระบบ</button>
      </>}

      {mode === "confirm" && <>
        <p className="text-sm text-zinc-500">รหัส 6 หลักที่ส่งไปที่ {phone}</p>
        {codeInput}
        <button disabled={busy || code.length !== 6} onClick={confirm} className={btn}>ยืนยัน</button>
        <div className="flex justify-between text-sm"><button className={link} onClick={() => go("signup")}>แก้เบอร์/ข้อมูล</button><button className={link} disabled={cool > 0 || busy} onClick={resend}>{cool > 0 ? `ส่งอีกครั้งใน ${cool} วิ` : "ส่งรหัสอีกครั้ง"}</button></div>
      </>}

      {mode === "forgot" && <>
        <p className="text-sm text-zinc-500">กรอกเบอร์ที่สมัครไว้ เพื่อรับรหัสตั้งรหัสผ่านใหม่ทาง SMS</p>
        {phoneInput}
        <button disabled={busy || !phone} onClick={forgot} className={btn}>ส่งรหัส</button>
        <button className={`${link} text-sm`} onClick={() => go("login")}>กลับไปเข้าสู่ระบบ</button>
      </>}

      {mode === "reset" && <>
        {codeInput}{pwInput("รหัสผ่านใหม่ (8 ตัวขึ้นไป มีตัวเลข)", "new-password", reset)}
        <button disabled={busy || code.length !== 6 || password.length < 8} onClick={reset} className={btn}>ตั้งรหัสผ่านใหม่</button>
      </>}

      {mode === "name" && <>
        <p className="text-sm text-zinc-500">ตั้งชื่อที่จะแสดงในกลุ่ม (ไม่แสดงเบอร์โทรของคุณ)</p>
        <input className="field w-full" maxLength={40} placeholder="ชื่อ/ชื่อเล่น" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={enter(saveName, !!name.trim())} />
        <button disabled={busy || !name.trim()} onClick={saveName} className={btn}>เริ่มใช้งาน</button>
      </>}

      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}
