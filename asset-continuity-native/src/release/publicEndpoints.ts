export const HELDAT_PUBLIC_ENDPOINTS = Object.freeze({
  website: "https://heldat.app/",
  privacy: "https://heldat.app/privacy/",
  terms: "https://heldat.app/terms/",
  support: "https://heldat.app/support/",
  deleteAccount: "https://heldat.app/delete-account/",
  security: "https://heldat.app/security/"
});

export const HELDAT_PUBLIC_CONTACTS = Object.freeze({
  support: "support@heldat.app",
  privacy: "privacy@heldat.app",
  security: "security@heldat.app"
});

export function heldatPublicJoinUrl(oneTimeCode: string): string {
  return `https://heldat.app/join?code=${encodeURIComponent(oneTimeCode)}`;
}
