import {
  createPendingHouseholdInviteStore,
  normalizeHouseholdInviteCode
} from "@/auth/pendingHouseholdInvite";

describe("pending household invitation storage", () => {
  it("normalizes a bounded code and rejects control characters", () => {
    expect(normalizeHouseholdInviteCode("  abcd-1234  ")).toBe(
      "ABCD-1234"
    );
    expect(normalizeHouseholdInviteCode("bad\u0000code")).toBeNull();
    expect(normalizeHouseholdInviteCode("x".repeat(129))).toBeNull();
  });

  it("fails closed and erases malformed encrypted payloads", async () => {
    const values = new Map([
      ["alyr.pending-household-invite.v1", '{"version":1,"oneTimeCode":7}']
    ]);
    const removeItem = jest.fn(async (key: string) => {
      values.delete(key);
    });
    const store = createPendingHouseholdInviteStore({
      async getItem(key) {
        return values.get(key) ?? null;
      },
      async setItem(key, value) {
        values.set(key, value);
      },
      removeItem
    });

    await expect(store.read()).resolves.toBeNull();
    expect(removeItem).toHaveBeenCalledWith(
      "alyr.pending-household-invite.v1"
    );
    expect(values.size).toBe(0);
  });
});
