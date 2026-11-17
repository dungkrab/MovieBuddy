"use client";
import { useEffect, useState } from "react";

const post = (url: string, body: unknown, method = "POST") =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

type Mode = "login" | "signup" | "confirm" | "forgot" | "reset" | "name";
const btn = "w-full rounded-lg bg-red-600 py-2 text-white disabled:opacity-50";

// กฎรหัสผ่าน — ต้องตรงกับ auth-service (passwordOf: ยาว 8–64 ตัวอักษร + ตัวพิมพ์เล็ก/ใหญ่ + ตัวเลข + อักขระพิเศษ) และ password policy ของ Cognito user pool
// ถ้าแก้กฎ ให้แก้ให้ตรงกันทั้ง 3 ที่: ที่นี่, passwordOf ใน services/auth/src/index.ts และข้อความใน cognito.ts
const PW = { min: 8, max: 64 };
const SPECIAL = /[\^$*.\[\]{}()?\-"!@#%&\/\\,><':;|_~`+=]/; // อักขระพิเศษตามที่ Cognito นับ
const pwRules = (p: string) => ({
  len: p.length >= PW.min && p.length <= PW.max,
  lower: /[a-z]/.test(p), upper: /[A-Z]/.test(p), digit: /\d/.test(p), special: SPECIAL.test(p),
});
const pwValid = (p: string) => Object.values(pwRules(p)).every(Boolean);

// ล็อกอินด้วยอีเมล + รหัสผ่าน (Amazon Cognito) — สมัครครั้งแรกต้องยืนยันรหัสที่ส่งทางอีเมล
export default function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState(""); const [code, setCode] = useState("");
  const [msg, setMsg] = useState(""); const [info, setInfo] = useState(""); const [busy, setBusy] = useState(false); const [cool, setCool] = useState(0);

  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.user && !d.user.name) setMode("name"); else if (d.user) location.assign(next); }).catch(() => {}); }, [next]);
  useEffect(() => { if (cool > 0) { const t = setTimeout(() => setCool(cool - 1), 1000); return () => clearTimeout(t); } }, [cool]);

  const go = (m: Mode, i = "") => { setMode(m); setMsg(""); setInfo(i); setCode(""); };
  async function act(fn: () => Promise<void>) { setBusy(true); setMsg(""); try { await fn(); } finally { setBusy(false); } }

  const login = () => act(async () => {
    const { ok, data } = await post("/api/auth/login", { email, password });
    if (ok) return data.needsName ? go("name") : location.assign(next);
    if (data.needsConfirm) return go("confirm", "อีเมลนี้ยังไม่ได้ยืนยัน — กดส่งรหัสอีกครั้งเพื่อรับรหัสใหม่ทางอีเมล");
    setMsg(data.error ?? "เข้าสู่ระบบไม่สำเร็จ");
  });
  const signup = () => act(async () => {
    const { ok, data } = await post("/api/auth/signup", { email, password, name });
    if (ok) { setCool(60); return go("confirm", "ส่งรหัส 6 หลักทางอีเมลแล้ว (ถ้าไม่เจอ ลองดูในกล่องสแปม)"); }
    if (data.exists) return go("confirm", "อีเมลนี้สมัครไว้แล้ว — ถ้ายังไม่ได้ยืนยัน ใส่รหัสที่ส่งทางอีเมล หรือกดส่งรหัสอีกครั้ง");
    setMsg(data.error ?? "สมัครไม่สำเร็จ");
  });
  const confirm = () => act(async () => {
    const c = await post("/api/auth/confirm", { email, code });
    if (!c.ok) return setMsg(c.data.error ?? "ยืนยันไม่สำเร็จ");
    const l = await post("/api/auth/login", { email, password }); // ยืนยันเสร็จ เข้าสู่ระบบต่อให้เลย
    if (l.ok) return l.data.needsName ? go("name") : location.assign(next);
    go("login", "ยืนยันอีเมลแล้ว กรุณาเข้าสู่ระบบ");
  });
  const resend = () => act(async () => {
    const { ok, data } = await post("/api/auth/resend", { email });
    if (!ok) return setMsg(data.error ?? "ส่งรหัสไม่สำเร็จ");
    setCool(60); setInfo("ส่งรหัสใหม่แล้ว");
  });
  const forgot = () => act(async () => {
    const { ok, data } = await post("/api/auth/forgot", { email });
    if (!ok) return setMsg(data.error ?? "ส่งรหัสไม่สำเร็จ");
    setPassword(""); go("reset", "ถ้าอีเมลนี้มีบัญชี เราได้ส่งรหัส 6 หลักไปทางอีเมลแล้ว");
  });
  const reset = () => act(async () => {
    const { ok, data } = await post("/api/auth/reset", { email, code, password });
    if (!ok) return setMsg(data.error ?? "ตั้งรหัสผ่านไม่สำเร็จ");
    setPassword(""); go("login", "ตั้งรหัสผ่านใหม่แล้ว เข้าสู่ระบบได้เลย");
  });
  const saveName = () => act(async () => {
    const { ok, data } = await post("/api/auth/me", { name }, "PATCH");
    if (!ok) return setMsg(data.error ?? "บันทึกไม่สำเร็จ");
    location.assign(next);
  });

  const enter = (fn: () => void, can: boolean) => (e: React.KeyboardEvent) => { if (e.key === "Enter" && can && !busy) fn(); };
  const emailInput = <input className="field w-full" type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="อีเมล" value={email} onChange={(e) => setEmail(e.target.value)} />;
  const pwInput = (label: string, ac: string, on?: () => void, can = true) => <input className="field w-full" type="password" autoComplete={ac} placeholder={label} maxLength={PW.max} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={on && enter(on, can)} />;
  const codeInput = <input className="field w-full text-center text-lg tracking-widest" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />;
  const r = pwRules(password); // เช็กลิสต์กฎรหัสผ่านแบบสด (ใช้ตอนสมัครและตั้งรหัสใหม่)
  const pwChecklist = (
    <ul className="space-y-0.5 text-xs" aria-live="polite">
      {([
        ["len", `ยาว ${PW.min}–${PW.max} ตัวอักษร`],
        ["lower", "มีตัวพิมพ์เล็ก (a-z) อย่างน้อย 1 ตัว"],
        ["upper", "มีตัวพิมพ์ใหญ่ (A-Z) อย่างน้อย 1 ตัว"],
        ["digit", "มีตัวเลขอย่างน้อย 1 ตัว"],
        ["special", "มีอักขระพิเศษอย่างน้อย 1 ตัว เช่น ! @ # $ %"],
      ] as const).map(([k, t]) => (
        <li key={k} className={r[k] ? "text-green-600" : "text-zinc-500"}>{r[k] ? "✓" : "○"} {t}</li>
      ))}
    </ul>
  );
  const link = "underline disabled:no-underline disabled:opacity-50";

  return (
    <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
      <h1 className="text-xl font-bold">{mode === "signup" ? "สมัครสมาชิก" : mode === "confirm" ? "ยืนยันอีเมล" : mode === "forgot" || mode === "reset" ? "ลืมรหัสผ่าน" : mode === "name" ? "ตั้งชื่อที่แสดง" : "เข้าสู่ระบบ"}</h1>
      {info && <p className="rounded bg-zinc-100 p-2 text-sm dark:bg-zinc-800">{info}</p>}

      {mode === "login" && <>
        {emailInput}{pwInput("รหัสผ่าน", "current-password", login, !!email && !!password)}
        <button disabled={busy || !email || !password} onClick={login} className={btn}>เข้าสู่ระบบ</button>
        <div className="flex justify-between text-sm"><button className={link} onClick={() => go("signup")}>สมัครสมาชิก</button><button className={link} onClick={() => go("forgot")}>ลืมรหัสผ่าน</button></div>
      </>}

      {mode === "signup" && <>
        <input className="field w-full" maxLength={40} placeholder="ชื่อ/ชื่อเล่น (แสดงในกลุ่ม ไม่แสดงอีเมล)" value={name} onChange={(e) => setName(e.target.value)} />
        {emailInput}{pwInput("รหัสผ่าน", "new-password", signup, !!email && !!name.trim() && pwValid(password))}{pwChecklist}
        <button disabled={busy || !email || !name.trim() || !pwValid(password)} onClick={signup} className={btn}>สมัครและรับรหัสทางอีเมล</button>
        <button className={`${link} text-sm`} onClick={() => go("login")}>มีบัญชีแล้ว? เข้าสู่ระบบ</button>
      </>}

      {mode === "confirm" && <>
        <p className="text-sm text-zinc-500">รหัส 6 หลักที่ส่งไปที่ {email}</p>
        {codeInput}
        <button disabled={busy || code.length !== 6} onClick={confirm} className={btn}>ยืนยัน</button>
        <div className="flex justify-between text-sm"><button className={link} onClick={() => go("signup")}>แก้อีเมล/ข้อมูล</button><button className={link} disabled={cool > 0 || busy} onClick={resend}>{cool > 0 ? `ส่งอีกครั้งใน ${cool} วิ` : "ส่งรหัสอีกครั้ง"}</button></div>
      </>}

      {mode === "forgot" && <>
        <p className="text-sm text-zinc-500">กรอกอีเมลที่สมัครไว้ เพื่อรับรหัสตั้งรหัสผ่านใหม่ทางอีเมล</p>
        {emailInput}
        <button disabled={busy || !email} onClick={forgot} className={btn}>ส่งรหัส</button>
        <button className={`${link} text-sm`} onClick={() => go("login")}>กลับไปเข้าสู่ระบบ</button>
      </>}

      {mode === "reset" && <>
        {codeInput}{pwInput("รหัสผ่านใหม่", "new-password", reset, code.length === 6 && pwValid(password))}{pwChecklist}
        <button disabled={busy || code.length !== 6 || !pwValid(password)} onClick={reset} className={btn}>ตั้งรหัสผ่านใหม่</button>
      </>}

      {mode === "name" && <>
        <p className="text-sm text-zinc-500">ตั้งชื่อที่จะแสดงในกลุ่ม (ไม่แสดงอีเมลของคุณ)</p>
        <input className="field w-full" maxLength={40} placeholder="ชื่อ/ชื่อเล่น" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={enter(saveName, !!name.trim())} />
        <button disabled={busy || !name.trim()} onClick={saveName} className={btn}>เริ่มใช้งาน</button>
      </>}

      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}