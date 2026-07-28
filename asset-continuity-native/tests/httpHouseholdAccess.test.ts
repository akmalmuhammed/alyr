import {
  HttpHouseholdAccess,
  type HttpHouseholdAccessOptions
} from "@/adapters/httpHouseholdAccess";
import type { SyncFetch } from "@/adapters/httpSyncTransport";

const householdId = "00000000-0000-4000-8000-000000000010";
const inviteId = "00000000-0000-4000-8000-000000000020";
const membershipId = "00000000-0000-4000-8000-000000000030";
const accountId = "00000000-0000-4000-8000-000000000040";
const editorMembershipId =
  "00000000-0000-4000-8000-000000000031";
const editorAccountId =
  "00000000-0000-4000-8000-000000000041";
const operationId = "00000000-0000-4000-8000-000000000050";

function accessSnapshot() {
  return {
    householdId,
    householdName: "Rahman household",
    householdVersion: 1,
    currentMembershipId: membershipId,
    currentAccountId: accountId,
    currentRole: "owner",
    members: [
      {
        membershipId,
        householdId,
        accountId,
        displayName: "Amina Owner",
        email: "owner@example.com",
        role: "owner",
        status: "active",
        version: 1,
        joinedAt: "2026-07-27T12:00:00.000Z",
        isCurrentUser: true
      },
      {
        membershipId: editorMembershipId,
        householdId,
        accountId: editorAccountId,
        displayName: "Omar Editor",
        email: "editor@example.com",
        role: "editor",
        status: "active",
        version: 2,
        joinedAt: "2026-07-27T12:05:00.000Z",
        isCurrentUser: false
      }
    ],
    pendingInvites: [
      {
        inviteId,
        householdId,
        role: "viewer",
        status: "pending",
        version: 1,
        createdAt: "2026-07-27T12:10:00.000Z",
        expiresAt: "2026-07-30T12:10:00.000Z"
      }
    ],
    refreshedAt: "2026-07-27T12:11:00.000Z"
  } as const;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function transport(
  fetchImpl: jest.MockedFunction<SyncFetch>,
  overrides: Partial<HttpHouseholdAccessOptions> = {}
) {
  return new HttpHouseholdAccess({
    baseUrl: "https://project.example/functions/v1/api/",
    getAccessToken: async () => "access-token",
    fetchImpl,
    ...overrides
  });
}

describe("HttpHouseholdAccess", () => {
  it("creates the durable household before opening its local vault", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    fetchImpl.mockResolvedValue(
      response(
        {
          operationId,
          household: {
            id: householdId,
            name: "Rahman household",
            version: 1,
            created_at: "2026-07-27T12:00:00.000Z",
            updated_at: "2026-07-27T12:00:00.000Z"
          }
        },
        201
      )
    );

    await expect(
      transport(fetchImpl).createHousehold({
        apiVersion: 1,
        operationId,
        householdId,
        name: "  Rahman household  "
      })
    ).resolves.toEqual({
      ok: true,
      value: {
        operationId,
        household: {
          householdId,
          name: "Rahman household",
          version: 1,
          createdAt: "2026-07-27T12:00:00.000Z"
        }
      }
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://project.example/functions/v1/api/households",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          apiVersion: 1,
          operationId,
          householdId,
          name: "Rahman household"
        })
      })
    );
  });

  it("rejects a creation receipt for a different household UUID", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    fetchImpl.mockResolvedValue(
      response(
        {
          operationId,
          household: {
            id: "00000000-0000-4000-8000-000000000099",
            name: "Another household",
            version: 1,
            created_at: "2026-07-27T12:00:00.000Z",
            updated_at: "2026-07-27T12:00:00.000Z"
          }
        },
        201
      )
    );

    await expect(
      transport(fetchImpl).createHousehold({
        apiVersion: 1,
        operationId,
        householdId,
        name: "Rahman household"
      })
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        retryable: false
      }
    });
  });

  it("records onboarding completion through the authenticated owner boundary", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    fetchImpl.mockResolvedValue(
      response({ householdId, onboarding: "complete" })
    );

    await expect(
      transport(fetchImpl).completeOnboarding(householdId)
    ).resolves.toEqual({
      ok: true,
      value: { householdId, onboarding: "complete" }
    });
    expect(
      JSON.parse(String(fetchImpl.mock.calls[0]![1].body))
    ).toEqual({
      apiVersion: 1,
      householdId
    });
  });

  it("creates a deliberately scoped one-time invitation", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    fetchImpl.mockResolvedValue(
      response(
        {
          inviteId,
          oneTimeCode: "ABCD1234",
          role: "editor",
          expiresAt: "2026-07-30T12:00:00.000Z"
        },
        201
      )
    );

    await expect(
      transport(fetchImpl).createInvite({
        householdId,
        role: "editor",
        expiresInHours: 72
      })
    ).resolves.toEqual({
      ok: true,
      value: {
        inviteId,
        oneTimeCode: "ABCD1234",
        role: "editor",
        expiresAt: "2026-07-30T12:00:00.000Z"
      }
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://project.example/functions/v1/api/invites",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer access-token",
          "Content-Type": "application/json"
        }
      })
    );
    expect(
      JSON.parse(String(fetchImpl.mock.calls[0]![1].body))
    ).toEqual({
      apiVersion: 1,
      householdId,
      role: "editor",
      expiresInHours: 72
    });
  });

  it("normalizes an accepted code and maps the membership boundary", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    fetchImpl.mockResolvedValue(
      response({
        membership: {
          id: membershipId,
          household_id: householdId,
          user_id: accountId,
          role: "viewer",
          status: "active",
          version: 1
        }
      })
    );

    await expect(
      transport(fetchImpl).acceptInvite("  abcd1234  ")
    ).resolves.toEqual({
      ok: true,
      value: {
        membershipId,
        householdId,
        accountId,
        role: "viewer",
        status: "active",
        version: 1
      }
    });
    expect(
      JSON.parse(String(fetchImpl.mock.calls[0]![1].body))
    ).toEqual({
      apiVersion: 1,
      oneTimeCode: "ABCD1234"
    });
  });

  it("previews only the household name, assigned role and expiry before redemption", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    fetchImpl.mockResolvedValue(
      response({
        review: {
          householdName: "Rahman household",
          role: "viewer",
          expiresAt: "2026-07-30T12:00:00.000Z"
        }
      })
    );

    await expect(
      transport(fetchImpl).previewInvite("  abcd1234  ")
    ).resolves.toEqual({
      ok: true,
      value: {
        householdName: "Rahman household",
        role: "viewer",
        expiresAt: "2026-07-30T12:00:00.000Z"
      }
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://project.example/functions/v1/api/invites/preview",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer access-token",
          "Content-Type": "application/json"
        }
      })
    );
    expect(
      JSON.parse(String(fetchImpl.mock.calls[0]![1].body))
    ).toEqual({
      apiVersion: 1,
      oneTimeCode: "ABCD1234"
    });
  });

  it("rejects malformed invitation review metadata without redeeming the code", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    fetchImpl.mockResolvedValue(
      response({
        review: {
          householdName: "",
          role: "owner",
          expiresAt: "not-a-date"
        }
      })
    );

    await expect(
      transport(fetchImpl).previewInvite("ABCD1234")
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        retryable: false
      }
    });
  });

  it("rejects owner invitations and invalid expiry before network access", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    const access = transport(fetchImpl);

    await expect(
      access.createInvite({
        householdId,
        role: "owner" as "viewer",
        expiresInHours: 721
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", retryable: false }
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("preserves versioned authorization failures", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    fetchImpl.mockResolvedValue(
      response(
        {
          error: {
            errorVersion: 1,
            code: "AUTHORIZATION_DENIED",
            message: "Only a household owner can create an invitation.",
            retryable: false
          }
        },
        403
      )
    );

    await expect(
      transport(fetchImpl).createInvite({
        householdId,
        role: "viewer",
        expiresInHours: 168
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "AUTHORIZATION_DENIED", retryable: false }
    });
  });

  it("refreshes an authoritative active-only roster without a request body", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    fetchImpl.mockResolvedValue(
      response({ snapshot: accessSnapshot() })
    );

    await expect(
      transport(fetchImpl).getAccessSnapshot(householdId)
    ).resolves.toEqual({
      ok: true,
      value: accessSnapshot()
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://project.example/functions/v1/api/household-access?householdId=${householdId}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer access-token"
        }
      }
    );
  });

  it("sends observed membership version and idempotency identity for role changes", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    const nextSnapshot = {
      ...accessSnapshot(),
      members: accessSnapshot().members.map((member) =>
        member.membershipId === editorMembershipId
          ? { ...member, role: "viewer" as const, version: 3 }
          : member
      )
    };
    fetchImpl.mockResolvedValue(
      response({
        receipt: {
          operationId,
          kind: "membership.role_changed",
          membershipId: editorMembershipId
        },
        snapshot: nextSnapshot
      })
    );

    await expect(
      transport(fetchImpl).changeMemberRole({
        householdId,
        membershipId: editorMembershipId,
        expectedVersion: 2,
        role: "viewer",
        operationId
      })
    ).resolves.toMatchObject({
      ok: true,
      value: {
        receipt: {
          operationId,
          kind: "membership.role_changed"
        },
        snapshot: {
          members: expect.arrayContaining([
            expect.objectContaining({
              membershipId: editorMembershipId,
              role: "viewer",
              version: 3
            })
          ])
        }
      }
    });
    expect(
      JSON.parse(String(fetchImpl.mock.calls[0]![1].body))
    ).toEqual({
      apiVersion: 1,
      householdId,
      operationId,
      membershipId: editorMembershipId,
      expectedVersion: 2,
      role: "viewer"
    });
  });

  it("rejects a roster that does not prove exactly one owner and current member", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    fetchImpl.mockResolvedValue(
      response({
        snapshot: {
          ...accessSnapshot(),
          members: accessSnapshot().members.map((member) => ({
            ...member,
            role: "viewer"
          }))
        }
      })
    );

    await expect(
      transport(fetchImpl).getAccessSnapshot(householdId)
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" }
    });
  });

  it("preserves visible server version conflicts for owner review", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    fetchImpl.mockResolvedValue(
      response(
        {
          error: {
            errorVersion: 1,
            code: "CONFLICT_REQUIRES_REVIEW",
            message: "Household access changed on another device.",
            retryable: false
          }
        },
        409
      )
    );

    await expect(
      transport(fetchImpl).revokeMember({
        householdId,
        membershipId: editorMembershipId,
        expectedVersion: 2,
        operationId
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "CONFLICT_REQUIRES_REVIEW" }
    });
  });

  it("does not trust malformed success payloads", async () => {
    const fetchImpl = jest.fn<ReturnType<SyncFetch>, Parameters<SyncFetch>>();
    fetchImpl.mockResolvedValue(
      response({
        inviteId,
        oneTimeCode: "",
        role: "owner",
        expiresAt: "not-a-date"
      })
    );

    await expect(
      transport(fetchImpl).createInvite({
        householdId,
        role: "viewer",
        expiresInHours: 24
      })
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", retryable: false }
    });
  });
});
