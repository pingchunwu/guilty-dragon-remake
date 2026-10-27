import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Build-time flag: only a dedicated test user (password set in the Supabase dashboard) can use this; real users have no password.
const TEST_LOGIN = import.meta.env.VITE_TEST_LOGIN === "1";

interface Props {
  client: SupabaseClient | null;
  onGuest: () => void;
}

/**
 * Email sign-in. The email carries a link (handled by supabase-js on return)
 * and, once the template includes {{ .Token }}, a code (its length is a Supabase setting). The code is
 * preferred because a link opened from email lands in the browser, not an
 * installed PWA; editing the template requires custom SMTP.
 */
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
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
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
            {busy ? "寄送中…" : "寄送登入信"}
          </button>
        </form>
      )}
      {client && step === "code" && (
        <form className="stack" onSubmit={verify}>
          <p className="muted">登入信已寄到 {email}。請點信中的登入連結，或輸入信中的驗證碼。</p>
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
      {client && TEST_LOGIN && (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const { error } = await client.auth.signInWithPassword({
              email: String(f.get("email")),
              password: String(f.get("password")),
            });
            if (error) setMessage(`測試登入失敗：${error.message}`);
          }}
        >
          <p className="muted small">測試登入（不需驗證碼）</p>
          <input name="email" type="email" required placeholder="test email" />
          <input name="password" type="password" required placeholder="password" />
          <button>測試登入</button>
        </form>
      )}
      <hr />
      <button type="button" onClick={onGuest}>
        以訪客身分試玩
      </button>
      <p className="muted small">訪客進度不會保存，重新整理後就會消失。</p>
    </section>
  );
}
