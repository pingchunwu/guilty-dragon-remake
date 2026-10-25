import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

interface Props {
  client: SupabaseClient | null;
  onGuest: () => void;
}

/** Email sign-in with a 6-digit code (works inside an installed PWA, unlike a magic link). */
export function SignIn({ client, onGuest }: Props) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setMessage(null);
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setMessage(`寄送失敗：${error.message}`);
    else setStep("code");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setMessage(null);
    const { error } = await client.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setMessage("驗證碼錯誤或已過期。");
  }

  return (
    <section className="panel stack">
      <h2>登入</h2>
      {!client && <p className="muted">此版本未設定 Supabase，只能以訪客身分試玩。</p>}
      {client && step === "email" && (
        <form className="stack" onSubmit={sendCode}>
          <label className="field">
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "寄送中…" : "寄送登入驗證碼"}
          </button>
        </form>
      )}
      {client && step === "code" && (
        <form className="stack" onSubmit={verify}>
          <p className="muted">驗證碼已寄到 {email}。</p>
          <label className="field">
            驗證碼
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "驗證中…" : "登入"}
          </button>
          <button type="button" className="link" onClick={() => setStep("email")}>
            換一個 email
          </button>
        </form>
      )}
      {message && <p className="error">{message}</p>}
      <hr />
      <button type="button" onClick={onGuest}>
        以訪客身分試玩
      </button>
      <p className="muted small">訪客進度不會保存，重新整理後就會消失。</p>
    </section>
  );
}
