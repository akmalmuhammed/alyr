import type { PermissionCapability } from "@alyr/contracts";

import {
  hasHouseholdCapability,
  PermissionDeniedError,
  requireHouseholdCapability
} from "@/auth/capabilityPolicy";
import { permissionConsequence } from "@/components/PermissionDenied";

describe("household capability policy", () => {
  it("uses the reviewed owner, editor, and viewer capability matrix", () => {
    const writes: readonly PermissionCapability[] = [
      "place.write",
      "asset.write",
      "evidence.write",
      "export.create"
    ];

    for (const capability of writes) {
      expect(hasHouseholdCapability("owner", capability)).toBe(true);
      expect(hasHouseholdCapability("editor", capability)).toBe(true);
    }
    expect(hasHouseholdCapability("viewer", "place.read")).toBe(true);
    expect(hasHouseholdCapability("viewer", "asset.read")).toBe(true);
    expect(hasHouseholdCapability("viewer", "evidence.read")).toBe(true);
    for (const capability of writes) {
      expect(hasHouseholdCapability("viewer", capability)).toBe(false);
    }
    expect(hasHouseholdCapability("editor", "household.manage")).toBe(false);
    expect(hasHouseholdCapability("editor", "member.manage")).toBe(false);
  });

  it("fails closed when the provider role is absent or malformed", () => {
    expect(hasHouseholdCapability(null, "asset.read")).toBe(false);
    expect(hasHouseholdCapability(undefined, "asset.read")).toBe(false);
    expect(
      hasHouseholdCapability(
        "administrator" as "owner",
        "asset.read"
      )
    ).toBe(false);
    expect(() =>
      requireHouseholdCapability(null, "asset.write")
    ).toThrow(PermissionDeniedError);
  });

  it("explains the consequence in English and Arabic", () => {
    expect(permissionConsequence("en", "asset.write").body).toContain(
      "cannot add or change"
    );
    expect(permissionConsequence("ar", "asset.write").body).toContain(
      "ولا يسمح"
    );
    expect(permissionConsequence("en", "export.create").title).toContain(
      "Export"
    );
    expect(permissionConsequence("ar", "evidence.write").title).toContain(
      "الإثباتات"
    );
  });
});
