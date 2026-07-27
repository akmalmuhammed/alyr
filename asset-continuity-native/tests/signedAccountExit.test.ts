import type { AuthSessionDescriptor } from "@/auth/types";
import {
  completeSignedAccountExit,
  signedAccountExitMessage,
  signedAccountIdentity
} from "@/auth/signedAccountExit";

const verifiedSession: AuthSessionDescriptor = {
  identity: {
    id: "account-a",
    email: "owner@example.com",
    emailVerified: true
  },
  assurance: "verified-email",
  expiresAt: null,
  onboarding: "complete",
  activeHouseholdId: "household-a",
  activeMembershipId: "membership-a",
  activeHouseholdRole: "owner"
};

describe("signed account exit", () => {
  it("exposes the control only for a verified cloud account with a household", () => {
    expect(signedAccountIdentity("supabase", verifiedSession)).toEqual(
      verifiedSession.identity
    );
    expect(signedAccountIdentity("preview", verifiedSession)).toBeNull();
    expect(signedAccountIdentity("unavailable", verifiedSession)).toBeNull();
    expect(
      signedAccountIdentity("supabase", {
        ...verifiedSession,
        assurance: "preview"
      })
    ).toBeNull();
    expect(
      signedAccountIdentity("supabase", {
        ...verifiedSession,
        activeHouseholdId: null,
        activeMembershipId: null,
        activeHouseholdRole: null
      })
    ).toBeNull();
  });

  it("states the account, household, lock, retention, and transfer consequences", () => {
    const message = signedAccountExitMessage(
      "owner@example.com",
      "Pearl household"
    );
    expect(message).toContain("owner@example.com");
    expect(message).toContain("Pearl household");
    expect(message).toContain("lock");
    expect(message).toContain("pending changes remain");
    expect(message).toContain("does not delete");
    expect(message).toContain("move it to another account");
  });

  it("routes to account access only after confirmed sign-out", async () => {
    const order: string[] = [];
    const result = await completeSignedAccountExit(
      async () => {
        order.push("sign-out");
        return true;
      },
      () => {
        order.push("route-auth");
      }
    );
    expect(result).toBe("signed-out");
    expect(order).toEqual(["sign-out", "route-auth"]);
  });

  it("keeps the current route when the provider leaves the session open", async () => {
    const routeToAuth = jest.fn();
    await expect(
      completeSignedAccountExit(async () => false, routeToAuth)
    ).resolves.toBe("still-signed-in");
    expect(routeToAuth).not.toHaveBeenCalled();

    await expect(
      completeSignedAccountExit(async () => {
        throw new Error("provider error");
      }, routeToAuth)
    ).resolves.toBe("still-signed-in");
    expect(routeToAuth).not.toHaveBeenCalled();
  });
});
