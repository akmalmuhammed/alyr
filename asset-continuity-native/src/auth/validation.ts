import type { AuthCredentials } from "./types";

export interface FieldErrors {
  readonly email?: string;
  readonly pilotAccessCode?: string;
  readonly password?: string;
  readonly confirmPassword?: string;
  readonly householdName?: string;
}

const SIMPLE_EMAIL =
  /^[^\s<>()[\]\\.,;:"]+(?:\.[^\s<>()[\]\\.,;:"]+)*@[^\s<>()[\]\\.,;:"]+(?:\.[^\s<>()[\]\\.,;:"]+)+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePilotAccessCode(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/gu, "");
}

export function validatePilotAccessCode(value: string): string | null {
  const code = normalizePilotAccessCode(value);
  if (!code) return "Enter your early access code.";
  if (code.length < 16 || code.length > 64 || !/^[A-Z0-9]+$/u.test(code)) {
    return "Use the full early access code from your invitation.";
  }
  return null;
}

export function validateEmail(value: string): string | null {
  const email = normalizeEmail(value);
  if (!email) return "Enter your email address.";
  if (email.length > 254 || !SIMPLE_EMAIL.test(email)) {
    return "Enter a complete email address, such as name@example.com.";
  }
  return null;
}

export function validatePassword(
  value: string,
  email = ""
): string | null {
  if (!value) return "Enter your password.";
  if (value.length < 10) {
    return "Use at least 10 characters.";
  }
  if (value.length > 128) {
    return "Use 128 characters or fewer.";
  }
  const localPart = normalizeEmail(email).split("@")[0] ?? "";
  if (localPart.length >= 4 && value.toLowerCase().includes(localPart)) {
    return "Choose a password that does not contain your email name.";
  }
  return null;
}

export function validateSignIn(
  credentials: AuthCredentials
): FieldErrors {
  const email = validateEmail(credentials.email);
  const password = credentials.password
    ? null
    : "Enter your password.";
  return {
    ...(email ? { email } : {}),
    ...(password ? { password } : {})
  };
}

export function validateCreateAccount(input: {
  readonly email: string;
  readonly password: string;
  readonly confirmPassword: string;
  readonly pilotAccessCode?: string | undefined;
  readonly requirePilotAccess?: boolean | undefined;
}): FieldErrors {
  const email = validateEmail(input.email);
  const pilotAccessCode = input.requirePilotAccess
    ? validatePilotAccessCode(input.pilotAccessCode ?? "")
    : null;
  const password = validatePassword(input.password, input.email);
  const confirmPassword =
    input.confirmPassword.length === 0
      ? "Enter the password again."
      : input.password !== input.confirmPassword
        ? "The passwords do not match."
        : null;
  return {
    ...(email ? { email } : {}),
    ...(pilotAccessCode ? { pilotAccessCode } : {}),
    ...(password ? { password } : {}),
    ...(confirmPassword ? { confirmPassword } : {})
  };
}

export function validatePasswordReset(input: {
  readonly email: string;
  readonly password: string;
  readonly confirmPassword: string;
}): FieldErrors {
  const password = validatePassword(input.password, input.email);
  const confirmPassword =
    input.confirmPassword.length === 0
      ? "Enter the password again."
      : input.password !== input.confirmPassword
        ? "The passwords do not match."
        : null;
  return {
    ...(password ? { password } : {}),
    ...(confirmPassword ? { confirmPassword } : {})
  };
}

export function validateHouseholdName(value: string): string | null {
  const name = value.trim();
  if (!name) return "Enter a household name.";
  if (name.length < 2) return "Use at least 2 characters.";
  if (name.length > 60) return "Use 60 characters or fewer.";
  return null;
}

export function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function maskEmail(value: string): string {
  const email = normalizeEmail(value);
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return email;
  const visible =
    local.length <= 2
      ? local.slice(0, 1)
      : `${local.slice(0, 2)}${"•".repeat(Math.min(4, local.length - 2))}`;
  return `${visible}@${domain}`;
}
