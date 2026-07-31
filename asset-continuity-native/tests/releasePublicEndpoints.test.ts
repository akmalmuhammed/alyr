import {
  HELDAT_PUBLIC_CONTACTS,
  HELDAT_PUBLIC_ENDPOINTS,
  heldatPublicJoinUrl
} from "@/release/publicEndpoints";

describe("public release endpoints", () => {
  it("uses canonical HTTPS pages on heldat.app", () => {
    expect(HELDAT_PUBLIC_ENDPOINTS).toEqual({
      website: "https://heldat.app/",
      privacy: "https://heldat.app/privacy/",
      terms: "https://heldat.app/terms/",
      support: "https://heldat.app/support/",
      deleteAccount: "https://heldat.app/delete-account/",
      security: "https://heldat.app/security/"
    });

    for (const endpoint of Object.values(
      HELDAT_PUBLIC_ENDPOINTS
    )) {
      const url = new URL(endpoint);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("heldat.app");
      expect(url.username).toBe("");
      expect(url.password).toBe("");
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
    }
  });

  it("publishes role-specific first-party contact addresses", () => {
    expect(HELDAT_PUBLIC_CONTACTS).toEqual({
      support: "support@heldat.app",
      privacy: "privacy@heldat.app",
      security: "security@heldat.app"
    });
  });

  it("creates an owned HTTPS invitation fallback", () => {
    expect(heldatPublicJoinUrl("ABCD 1234")).toBe(
      "https://heldat.app/join?code=ABCD%201234"
    );
  });
});
