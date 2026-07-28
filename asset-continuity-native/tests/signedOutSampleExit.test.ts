import {
  canExitSignedOutSample,
  completeSignedOutSampleExit
} from "@/auth/signedOutSampleExit";
import type { AuthSessionDescriptor } from "@/auth/types";

const verifiedSession: AuthSessionDescriptor = {
  identity: {
    id: "account-owner",
    email: "owner@example.com",
    emailVerified: true
  },
  assurance: "verified-email",
  expiresAt: "2026-07-29T12:00:00.000Z",
  onboarding: "complete",
  activeHouseholdId: "household-owner",
  activeMembershipId: "membership-owner",
  activeHouseholdRole: "owner"
};

describe("signed-out sample exit boundary", () => {
  it("admits only a device-local sample without an account session", () => {
    expect(
      canExitSignedOutSample({
        mode: "supabase",
        session: null,
        workspaceMode: "sample"
      })
    ).toBe(true);
    expect(
      canExitSignedOutSample({
        mode: "unavailable",
        session: null,
        workspaceMode: "sample"
      })
    ).toBe(true);
    expect(
      canExitSignedOutSample({
        mode: "supabase",
        session: verifiedSession,
        workspaceMode: "sample"
      })
    ).toBe(false);
    expect(
      canExitSignedOutSample({
        mode: "supabase",
        session: null,
        workspaceMode: "personal"
      })
    ).toBe(false);
    expect(
      canExitSignedOutSample({
        mode: "preview",
        session: null,
        workspaceMode: "sample"
      })
    ).toBe(false);
  });

  it("rejects a signed account before any destructive callback runs", async () => {
    const resetSampleVault = jest.fn(async () => undefined);
    const clearDeviceAuthorization = jest.fn();
    const routeToWelcome = jest.fn();

    await expect(
      completeSignedOutSampleExit({
        mode: "supabase",
        session: verifiedSession,
        workspaceMode: "sample",
        resetSampleVault,
        clearDeviceAuthorization,
        routeToWelcome
      })
    ).resolves.toBe("not-signed-out-sample");

    expect(resetSampleVault).not.toHaveBeenCalled();
    expect(clearDeviceAuthorization).not.toHaveBeenCalled();
    expect(routeToWelcome).not.toHaveBeenCalled();
  });

  it("routes only after the isolated reset completes", async () => {
    const order: string[] = [];

    await expect(
      completeSignedOutSampleExit({
        mode: "supabase",
        session: null,
        workspaceMode: "sample",
        resetSampleVault: async () => {
          order.push("reset");
        },
        clearDeviceAuthorization: () => {
          order.push("clear-device-authorization");
        },
        routeToWelcome: () => {
          order.push("welcome");
        }
      })
    ).resolves.toBe("exited");

    expect(order).toEqual([
      "reset",
      "clear-device-authorization",
      "welcome"
    ]);
  });

  it("keeps navigation and device authorization unchanged after reset failure", async () => {
    const clearDeviceAuthorization = jest.fn();
    const routeToWelcome = jest.fn();

    await expect(
      completeSignedOutSampleExit({
        mode: "supabase",
        session: null,
        workspaceMode: "sample",
        resetSampleVault: async () => {
          throw new Error("device storage unavailable");
        },
        clearDeviceAuthorization,
        routeToWelcome
      })
    ).resolves.toBe("reset-failed");

    expect(clearDeviceAuthorization).not.toHaveBeenCalled();
    expect(routeToWelcome).not.toHaveBeenCalled();
  });
});
