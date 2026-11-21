// The calls Settings makes, on the kit's one fetch client. A refusal throws `ApiError` (status, code,
// the API's words), so the dialog can say it; nothing here pretends a call worked. The preview
// route never uses this file: it passes its own actions that touch no network.

import { api } from "@/app/_ui/api";
import type { AccountData, Business, Role } from "./logic";

interface AccountResponse {
  me: { name: string; email: string; role: Role };
  signed_in: boolean;
  businesses: Array<{ id: string; name: string; name_ar: string; slug: string; role: Role; current: boolean }>;
  can_change_email: boolean;
  can_export: boolean;
}

/** `GET /api/account`: who is signed in, the businesses they work for, what they may do here. */
export async function fetchAccount(): Promise<AccountData> {
  const answer = await api<AccountResponse>("/api/account");
  const businesses: Business[] = answer.businesses.map((b) => ({
    id: b.id, name: b.name, nameAr: b.name_ar, role: b.role, current: b.current,
  }));
  return { me: answer.me, businesses, canChangeEmail: answer.can_change_email, canExport: answer.can_export };
}

/** What the screen does, and nothing else; the host passes these in. */
export interface SettingsActions {
  /** `POST /api/account/email/code`: emails a 6-digit code to the new address. */
  requestEmailCode: (email: string) => Promise<void>;
  /** `POST /api/account/email`: the code makes the address the sign-in email. */
  confirmEmailChange: (email: string, code: string) => Promise<string>;
  /** `POST /api/account/switch`: a session in the other business, then the workspace reloads. */
  switchBusiness: (businessId: string) => Promise<void>;
  /** `POST /api/auth/logout`: this device only. */
  signOut: () => Promise<void>;
  /** `GET /api/account/export`: the ZIP, as a download of the browser's own. */
  download: () => void;
  /**
   * Asks ALYR to end the plan with seven days' notice. There is no route for an owner to do this
   * today (cancelling is back office only, D-082): leave it out and the screen draws no close
   * button at all.
   */
  requestClose?: () => Promise<void>;
}

export const settingsActions: Omit<SettingsActions, "requestClose"> = {
  async requestEmailCode(email) {
    await api("/api/account/email/code", { method: "POST", body: { email } });
  },
  async confirmEmailChange(email, code) {
    const answer = await api<{ email: string }>("/api/account/email", { method: "POST", body: { email, code } });
    return answer.email;
  },
  async switchBusiness(businessId) {
    await api("/api/account/switch", { method: "POST", body: { business_id: businessId } });
    window.location.reload();
  },
  async signOut() {
    await api("/api/auth/logout", { method: "POST", signOut: false });
    window.location.replace("/login");
  },
  download() {
    // A link of the browser's own, so the ZIP downloads without leaving the page.
    const link = document.createElement("a");
    link.href = "/api/account/export";
    link.download = "";
    link.click();
  },
};
