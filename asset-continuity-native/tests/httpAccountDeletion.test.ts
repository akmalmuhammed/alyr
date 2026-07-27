import type { AccountDeletionRequest } from "@alyr/contracts";

import { HttpAccountDeletion } from "@/adapters/httpAccountDeletion";

const request: AccountDeletionRequest = {
  apiVersion: 1,
  expectedAccountId: "00000000-0000-4000-8000-000000000001",
  expectedActiveHouseholdId: "00000000-0000-4000-8000-000000000002",
  expectedActiveHouseholdRole: "owner",
  confirmationEmail: "owner@example.com",
  password: "private-password",
  acknowledgeIrreversibleDeletion: true
};

describe("HTTP account deletion", () => {
  it("sends re-authentication only to the authenticated destructive route", async () => {
    const fetchImpl = jest.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({
        Accept: "application/json",
        Authorization: "Bearer user-bearer",
        "Content-Type": "application/json"
      });
      expect(JSON.parse(String(init.body))).toEqual(request);
      return new Response(
        JSON.stringify({
          accountId: request.expectedAccountId,
          deletedHouseholdIds: [request.expectedActiveHouseholdId],
          departedHouseholdIds: [],
          deletedAt: "2026-07-27T08:00:00.000Z"
        }),
        { status: 200 }
      );
    });
    const port = new HttpAccountDeletion({
      baseUrl: "https://fixture.invalid/functions/v1/api/",
      getAccessToken: async () => "user-bearer",
      fetchImpl
    });

    await expect(port.deleteAccount(request)).resolves.toEqual({
      ok: true,
      value: {
        accountId: request.expectedAccountId,
        deletedHouseholdIds: [request.expectedActiveHouseholdId],
        departedHouseholdIds: [],
        deletedAt: "2026-07-27T08:00:00.000Z"
      }
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://fixture.invalid/functions/v1/api/account/deletion",
      expect.any(Object)
    );
  });

  it("preserves reviewed ownership conflicts from the server", async () => {
    const port = new HttpAccountDeletion({
      baseUrl: "https://fixture.invalid/functions/v1/api",
      getAccessToken: async () => "user-bearer",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              errorVersion: 1,
              code: "CONFLICT_REQUIRES_REVIEW",
              message:
                "Transfer ownership of every shared household before deleting this account.",
              retryable: false
            }
          }),
          { status: 409 }
        )
    });

    await expect(port.deleteAccount(request)).resolves.toEqual({
      ok: false,
      error: {
        errorVersion: 1,
        code: "CONFLICT_REQUIRES_REVIEW",
        message:
          "Transfer ownership of every shared household before deleting this account.",
        retryable: false
      }
    });
  });

  it("fails locally before fetching when the confirmation tuple is malformed", async () => {
    const fetchImpl = jest.fn();
    const port = new HttpAccountDeletion({
      baseUrl: "https://fixture.invalid/functions/v1/api",
      getAccessToken: async () => "user-bearer",
      fetchImpl
    });

    const result = await port.deleteAccount({
      ...request,
      expectedAccountId: "not-an-account"
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", retryable: false }
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a success receipt for a different account", async () => {
    const port = new HttpAccountDeletion({
      baseUrl: "https://fixture.invalid/functions/v1/api",
      getAccessToken: async () => "user-bearer",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            accountId: "00000000-0000-4000-8000-000000000009",
            deletedHouseholdIds: [],
            departedHouseholdIds: [],
            deletedAt: "2026-07-27T08:00:00.000Z"
          }),
          { status: 200 }
        )
    });

    const result = await port.deleteAccount(request);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", retryable: false }
    });
  });
});
