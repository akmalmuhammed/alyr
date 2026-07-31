import { canOfferGoogleOAuth } from "@/auth/oauthProviderPolicy";

describe("OAuth provider release policy", () => {
  it("offers Google on Android but not iOS before Apple parity exists", () => {
    expect(canOfferGoogleOAuth("android")).toBe(true);
    expect(canOfferGoogleOAuth("ios")).toBe(false);
  });
});
