"use client";

// "Connect with Meta" on the owner's WhatsApp step (ALY-39, specs/063-embedded-signup, D-148).
// Shown only when the API says Embedded Signup is on and the owner's way uses it. It opens Meta's
// pop-up, waits for the one-time code and the session message, and hands both to ALYR at once: the
// code lives 30 seconds. The server reads every claim back from Meta before it attaches anything.
// Words in both languages; the API answers a code, never a sentence, so Arabic is Arabic.

import { useEffect, useRef, useState } from "react";
import { call } from "./api";
import { loadSdk, openPopup, readMessage, type Session } from "./signup";

type Lang = "en" | "ar";
type Config = { available: boolean; app_id?: string; config_id?: string; version?: string; extras?: object };

const T = {
  en: {
    intro: "Connect your number yourself. A window from Meta opens: you sign in, choose your WhatsApp account and your number, and finish there. ALYR gets access to the account you choose, and you can remove it in Meta at any time.",
    button: "Connect with Meta", opening: "Opening Meta", finishing: "Connecting your number",
    closed: "You closed the window. Press Connect when you are ready.",
    connected: "Your number is connected.",
    unavailable: "Connecting from here is not available right now. ALYR will connect it with you.",
    sdk: "Meta's window could not open. Check that your browser allows pop-ups from this page, then try again.",
    failed: "It did not connect.",
    errors: {
      off: "Connecting with Meta is not switched on.",
      way: "Choose how customers reach you on WhatsApp first.",
      no_number: "Meta finished without a WhatsApp number being chosen. Press Connect and choose one.",
      incomplete: "Meta's answer was not complete. Press Connect again.",
      code: "Meta did not accept the connection (it lasts half a minute). Press Connect again.",
      not_shown: "Meta does not show that number on your account. Press Connect and choose it again.",
      register: "Meta could not switch your number on. Finish setting it up in WhatsApp Manager, then try again.",
      not_connected: "Meta does not show your number as connected yet. Finish setting it up in WhatsApp Manager, then try again.",
      subscribe: "Meta did not let ALYR receive your messages. Try again in a minute.",
      taken: "That number is already connected to another business.",
      has_number: "Your business already has a WhatsApp number connected. Ask ALYR to detach it first.",
      refused: "It could not be connected. Contact ALYR.",
    } as Record<string, string>,
  },
  ar: {
    intro: "اربط رقمك بنفسك. تُفتح نافذة من Meta: تسجّل الدخول، وتختار حساب واتساب ورقمك، وتُنهي الربط هناك. تحصل ALYR على صلاحية الوصول إلى الحساب الذي تختاره، ويمكنك إزالتها من Meta في أي وقت.",
    button: "اربط عبر Meta", opening: "جارٍ فتح Meta", finishing: "جارٍ ربط رقمك",
    closed: "أغلقت النافذة. اضغط «اربط» عندما تكون جاهزاً.",
    connected: "رقمك مربوط.",
    unavailable: "الربط من هنا غير متاح الآن. ستربطه ALYR معك.",
    sdk: "تعذّر فتح نافذة Meta. تأكد من أن متصفحك يسمح بالنوافذ المنبثقة من هذه الصفحة ثم حاول مرة أخرى.",
    failed: "لم يكتمل الربط.",
    errors: {
      off: "الربط عبر Meta غير مفعّل.",
      way: "اختر أولاً كيف يصل إليك عملاؤك على واتساب.",
      no_number: "أنهت Meta العملية دون اختيار رقم واتساب. اضغط «اربط» ثم اختر رقماً.",
      incomplete: "لم تكتمل إجابة Meta. اضغط «اربط» مرة أخرى.",
      code: "لم تقبل Meta عملية الربط (صلاحيتها نصف دقيقة فقط). اضغط «اربط» مرة أخرى.",
      not_shown: "لا تُظهر Meta ذلك الرقم في حسابك. اضغط «اربط» ثم اختره من جديد.",
      register: "تعذّر على Meta تشغيل رقمك. أكمل إعداده في WhatsApp Manager ثم حاول مرة أخرى.",
      not_connected: "لا تُظهر Meta رقمك متصلاً بعد. أكمل إعداده في WhatsApp Manager ثم حاول مرة أخرى.",
      subscribe: "لم تسمح Meta لـALYR باستقبال رسائلك. حاول مرة أخرى بعد دقيقة.",
      taken: "هذا الرقم مربوط بنشاط آخر.",
      has_number: "لنشاطك رقم واتساب مربوط بالفعل. اطلب من ALYR فصله أولاً.",
      refused: "تعذّر الربط. تواصل مع ALYR.",
    } as Record<string, string>,
  },
};

// The code lives 30 seconds, so the session message is not waited for longer than this.
const WAIT_FOR_SESSION_MS = 20_000;

export default function WhatsappConnect({ lang, onConnected }: { lang: Lang; onConnected: () => void | Promise<void> }) {
  const t = T[lang];
  const [phase, setPhase] = useState<"idle" | "opening" | "finishing" | "done">("idle");
  const [problem, setProblem] = useState("");
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  async function start() {
    setPhase("opening");
    setProblem("");
    const asked = await call<Config>("/api/whatsapp/signup/config");
    if (!asked.ok || !asked.data.available) { setPhase("idle"); return setProblem(t.unavailable); }
    const { app_id, config_id, version, extras } = asked.data;
    let facebook;
    try {
      facebook = await loadSdk(app_id ?? "", version ?? "");
    } catch {
      setPhase("idle");
      return setProblem(t.sdk);
    }
    // Listen before the pop-up opens: the session message can arrive before the code does.
    let listener: (event: MessageEvent) => void = () => {};
    const heard = new Promise<Session | null>((resolve) => {
      listener = (event) => {
        const said = readMessage(event.origin, event.data);
        if (!said) return;
        if (said.kind === "finish") return resolve(said.session);
        call("/api/whatsapp/signup/cancel", "POST", said.kind === "cancel"
          ? { event: "CANCEL", step: said.step }
          : { event: "ERROR", error_message: said.message, error_code: said.code });
        resolve(null);
      };
      window.addEventListener("message", listener);
    });
    stop.current = () => window.removeEventListener("message", listener);
    const code = await openPopup(facebook, config_id ?? "", extras ?? {});
    if (!code) { stop.current(); setPhase("idle"); return setProblem(t.closed); }
    setPhase("finishing");
    const session = await Promise.race([
      heard, new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_FOR_SESSION_MS)),
    ]);
    stop.current();
    if (!session) { setPhase("idle"); return setProblem(t.closed); }
    const answer = await call<{ detail?: { code?: string } }>("/api/whatsapp/signup/complete", "POST", { code, ...session });
    if (!answer.ok) {
      setPhase("idle");
      return setProblem(t.errors[answer.data.detail?.code ?? "refused"] ?? t.failed);
    }
    setPhase("done");
    await onConnected();
  }

  if (phase === "done") return <p className="ob-wa-status connected" role="status">{t.connected}</p>;
  const busy = phase !== "idle";
  return (
    <div className="ob-connect">
      <small className="ob-fine">{t.intro}</small>
      <button type="button" className="ob-btn small ob-tall" disabled={busy} onClick={start}>
        {phase === "opening" ? t.opening : phase === "finishing" ? t.finishing : t.button}
      </button>
      {problem && <p className="ob-error" role="alert">{problem}</p>}
    </div>
  );
}
