// Meta's Embedded Signup in the owner's browser (ALY-39, specs/063-embedded-signup). Nothing here
// is trusted by the server: the code and the session message are only what the browser was handed,
// and the server reads every claim back from Meta with the business's own token.
//
// Written against Meta's implementation page (checked 31 Oct 2026): the Facebook JS SDK is loaded
// from connect.facebook.net, `FB.login` opens the configuration with `response_type: "code"` and
// `override_default_response_type: true`, the code comes back in the callback (it lives 30
// seconds), and the session message arrives as a `message` event whose origin is facebook.com with
// `type: "WA_EMBEDDED_SIGNUP"`.

export type Session = { event: string; waba_id: string; phone_number_id: string; business_id: string };
export type Heard =
  | { kind: "finish"; session: Session }
  | { kind: "cancel"; step: string }
  | { kind: "error"; message: string; code: string }
  | null;

const FINISH = ["FINISH", "FINISH_ONLY_WABA", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", "FINISH_GRANT_ONLY_API_ACCESS"];

// Only Meta's own pages may speak to us this way. "ends with facebook.com" is not enough:
// evilfacebook.com does, so the host must be facebook.com or a subdomain of it, over https.
export function isFacebookOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && (url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com"));
  } catch {
    return false;
  }
}

// What a `message` event said, or null when it is not Embedded Signup's, or not from Meta.
export function readMessage(origin: string, data: unknown): Heard {
  if (!isFacebookOrigin(origin)) return null;
  let body: unknown = data;
  if (typeof data === "string") {
    try { body = JSON.parse(data); } catch { return null; }
  }
  if (typeof body !== "object" || body === null) return null;
  const message = body as { type?: unknown; event?: unknown; data?: Record<string, unknown> };
  if (message.type !== "WA_EMBEDDED_SIGNUP") return null;
  const event = String(message.event ?? "");
  const d = message.data ?? {};
  if (FINISH.includes(event)) {
    return { kind: "finish", session: {
      event, waba_id: String(d.waba_id ?? ""), phone_number_id: String(d.phone_number_id ?? ""),
      business_id: String(d.business_id ?? ""),
    } };
  }
  if (event === "CANCEL") return { kind: "cancel", step: String(d.current_step ?? "") };
  if (event === "ERROR") return { kind: "error", message: String(d.error_message ?? ""), code: String(d.error_code ?? "") };
  return null;
}

type Facebook = {
  init(options: object): void;
  login(callback: (response: { authResponse?: { code?: string } | null }) => void, options: object): void;
};
declare global {
  interface Window { FB?: Facebook; fbAsyncInit?: () => void }
}

// Load Meta's SDK once, initialised for ALYR's app.
export function loadSdk(appId: string, version: string): Promise<Facebook> {
  return new Promise((resolve, reject) => {
    const ready = () => {
      if (!window.FB) return reject(new Error("sdk"));
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version });
      resolve(window.FB);
    };
    if (window.FB) return ready();
    window.fbAsyncInit = ready;
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new Error("sdk"));
    document.head.appendChild(script);
  });
}

// Open Meta's pop-up for ALYR's configuration. Answers the one-time code, or null when the owner
// closed it. The session message arrives separately, through `readMessage`.
export function openPopup(facebook: Facebook, configId: string, extras: object): Promise<string | null> {
  return new Promise((resolve) => {
    facebook.login((response) => resolve(response.authResponse?.code ?? null), {
      config_id: configId, response_type: "code", override_default_response_type: true, extras,
    });
  });
}
