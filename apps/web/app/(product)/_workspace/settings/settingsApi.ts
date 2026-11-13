// Typed API client for /api/account endpoints

import {
  FIXTURE_PROFILE,
  FIXTURE_BUSINESSES,
} from "./fixtures";
import type { BusinessItem } from "./logic";

export interface AccountInfoResponse {
  me: {
    name: string;
    email: string;
    role: "owner" | "admin" | "agent";
  };
  signed_in: boolean;
  businesses: BusinessItem[];
  can_change_email: boolean;
  can_export: boolean;
}

export async function fetchAccountInfo(): Promise<AccountInfoResponse> {
  try {
    const res = await fetch("/api/account", { credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    // Preview fallback
    return {
      me: {
        name: FIXTURE_PROFILE.name,
        email: FIXTURE_PROFILE.email,
        role: FIXTURE_PROFILE.role,
      },
      signed_in: true,
      businesses: FIXTURE_BUSINESSES,
      can_change_email: true,
      can_export: FIXTURE_PROFILE.role === "owner",
    };
  }
}

export async function requestEmailCode(email: string): Promise<{ sent: boolean; email: string; dev_code?: string }> {
  try {
    const res = await fetch("/api/account/email/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    // Preview fallback
    return { sent: true, email, dev_code: "730518" };
  }
}

export async function confirmEmailChange(email: string, code: string): Promise<{ email: string }> {
  try {
    const res = await fetch("/api/account/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    // Preview fallback
    return { email };
  }
}

export async function switchBusiness(businessId: string): Promise<{ business_id: string }> {
  try {
    const res = await fetch("/api/account/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business_id: businessId }),
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    // Preview fallback
    return { business_id: businessId };
  }
}
