// Pure business logic and utilities for Settings (Your account, Data and privacy)

export type ThemeChoice = "light" | "dark" | "auto";
export type LanguageChoice = "en" | "ar";
export type NoticeChannel = "workspace" | "whatsapp" | "both";

export interface UserDevice {
  id: string;
  kind: "globe" | "phone";
  name: string;
  location: string;
  signedInAt: string;
  expiresAt: string;
  lastUsedAt?: string;
  isCurrent: boolean;
}

export interface BusinessItem {
  id: string;
  nameEn: string;
  nameAr: string;
  role: "owner" | "admin" | "agent";
  peopleCount: number;
  initial: string;
  isOpenNow: boolean;
}

export interface CustomerDataRequest {
  id: string;
  askedDate: string;
  customerIdentifier: string;
  askedFor: "copy" | "forget" | "no_messages" | "name_correction";
  state: "sent" | "waiting" | "done" | "forgotten";
  handledBy: string;
  note: string;
}

export interface TermsItem {
  id: string;
  document: string;
  version: string;
  acceptedAt: string;
  acceptedBy: string;
  isCurrent: boolean;
}

export interface DownloadRecord {
  id: string;
  downloadedAt: string;
  downloadedBy: string;
  size: string;
  followedNote: string;
}

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 200) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}

export function isValidVerificationCode(code: string): boolean {
  if (!code || typeof code !== "string") return false;
  const cleaned = code.replace(/\s+/g, "");
  return /^\d{6}$/.test(cleaned);
}

export function resolveEffectiveTheme(choice: ThemeChoice, systemPrefersDark: boolean): "light" | "dark" {
  if (choice === "light") return "light";
  if (choice === "dark") return "dark";
  return systemPrefersDark ? "dark" : "light";
}

export function formatCodeDigits(code: string): string[] {
  const digits = code.replace(/\D/g, "").slice(0, 6).split("");
  while (digits.length < 6) {
    digits.push(" ");
  }
  return digits;
}

export function filterCustomerRequests(
  requests: CustomerDataRequest[],
  filter?: "all" | "waiting" | "done"
): CustomerDataRequest[] {
  if (!filter || filter === "all") return requests;
  if (filter === "waiting") {
    return requests.filter((r) => r.state === "waiting");
  }
  return requests.filter((r) => r.state === "done" || r.state === "sent" || r.state === "forgotten");
}

export function calculateDaysRemaining(targetIsoDate: string, currentIsoDate?: string): number {
  const target = new Date(targetIsoDate).getTime();
  const current = currentIsoDate ? new Date(currentIsoDate).getTime() : Date.now();
  const diffMs = target - current;
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
