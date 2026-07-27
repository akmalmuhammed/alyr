import type { HouseholdId } from "@alyr/contracts";

import { createPreviewAuthGateway } from "@/auth/adapters/preview";
import type { AccountAuthGateway } from "@/auth/types";
import { createAuthenticatedCloudTransports } from "@/runtime/cloudServices";

const householdId =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as HouseholdId;

describe("authenticated cloud transport composition", () => {
  it("injects a fresh user access token into sync and household calls", async () => {
    const currentAccessToken = jest
      .fn<ReturnType<AccountAuthGateway["currentAccessToken"]>, []>()
      .mockResolvedValueOnce({ ok: true, value: "first-user-token" })
      .mockResolvedValueOnce({ ok: true, value: "second-user-token" });
    const gateway: AccountAuthGateway = {
      ...createPreviewAuthGateway(),
      mode: "supabase",
      currentAccessToken
    };
    const requests: Array<{
      readonly url: string;
      readonly authorization: string | null;
    }> = [];
    const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      requests.push({
        url,
        authorization: headers.get("Authorization")
      });
      const payload = url.includes("/sync/pull")
        ? {
            changes: [],
            cursor: {
              cursorVersion: 1,
              value: null,
              issuedAt: null
            }
          }
        : {
            inviteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            oneTimeCode: "ALYR-TEST",
            role: "viewer",
            expiresAt: "2026-07-28T00:00:00.000Z"
          };
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    const cloud = createAuthenticatedCloudTransports(
      gateway,
      "https://project-ref.supabase.co/functions/v1/api/",
      fetchImpl
    );

    await cloud.sync.pull(householdId, {
      cursorVersion: 1,
      value: null,
      issuedAt: null
    });
    await cloud.householdAccess.createInvite({
      householdId,
      role: "viewer",
      expiresInHours: 24
    });

    expect(currentAccessToken).toHaveBeenCalledTimes(2);
    expect(requests).toEqual([
      expect.objectContaining({
        authorization: "Bearer first-user-token"
      }),
      expect.objectContaining({
        authorization: "Bearer second-user-token"
      })
    ]);
    expect(requests[0]?.url).toContain("/functions/v1/api/sync/pull");
    expect(requests[1]?.url).toBe(
      "https://project-ref.supabase.co/functions/v1/api/invites"
    );
  });
});
