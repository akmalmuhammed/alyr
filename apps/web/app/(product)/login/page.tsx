"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CodeAnswer = { sent: boolean; dev_code?: string | null };

async function post<R>(url: string, body: object): Promise<{ ok: boolean; status: number; data: R }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
}

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode() {
    setBusy(true);
    setError("");
    try {
      const answer = await post<CodeAnswer>("/api/auth/code", { email });
      if (answer.status === 429) return setError("Too many codes requested. Try again in an hour.");
      if (!answer.ok) return setError("Codes cannot be sent right now. Try again shortly.");
      setDevCode(answer.data.dev_code ?? null);
      setStep("code");
    } catch {
      setError("Cannot reach Alyr. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError("");
    try {
      const answer = await post("/api/auth/verify", { email, code });
      if (!answer.ok) return setError("That code is wrong or has expired. Check it, or request a new one.");
      router.push("/whatsapp");
    } catch {
      setError("Cannot reach Alyr. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <h1>Alyr</h1>
      <p className="lead">Sign in to your shop&apos;s workspace</p>
      {step === "email" ? (
        <form onSubmit={(e) => { e.preventDefault(); requestCode(); }}>
          <label htmlFor="email">Work email</label>
          <input
            id="email" type="email" required autoFocus value={email} dir="ltr"
            onChange={(e) => setEmail(e.target.value)} autoComplete="email"
          />
          <button className="btn primary" type="submit" disabled={busy}>Send me a code</button>
          <p className="hint">Demo shop staff: fatima@alnoor.example (owner) or yusuf@alnoor.example (agent).</p>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <p className="hint">
            If {email} has an account, a 6-digit code is on its way. It works for 10 minutes.
          </p>
          {devCode && (
            <p className="devcode" dir="ltr">
              Local development only, no email is sent: your code is <b>{devCode}</b>
            </p>
          )}
          <label htmlFor="code">Code</label>
          <input
            id="code" inputMode="numeric" required autoFocus value={code} dir="ltr"
            onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={6}
          />
          <button className="btn primary" type="submit" disabled={busy}>Sign in</button>
          <button className="btn" type="button" onClick={() => { setStep("email"); setCode(""); setError(""); }}>
            Use a different email
          </button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
