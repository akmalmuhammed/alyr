import { createWorkspace } from "@/domain/sample";
import { createPersonalWorkspaceReplacement } from "@/state/sampleConversion";

describe("sample-to-personal workspace boundary", () => {
  it("creates a clean personal record and keeps the selected Arabic language", () => {
    const sample = {
      ...createWorkspace("sample"),
      language: "ar" as const
    };

    const personal = createPersonalWorkspaceReplacement(
      sample,
      "2026-07-27T14:00:00.000Z",
      {
        householdId: "personal-household",
        ownerMemberId: "personal-owner",
        deviceId: "installation-device"
      }
    );

    expect(personal).toMatchObject({
      mode: "personal",
      language: "ar",
      deviceId: "installation-device",
      household: {
        id: "personal-household",
        name: "My household"
      },
      createdAt: "2026-07-27T14:00:00.000Z"
    });
    expect(personal.assets).toEqual([]);
    expect(personal.places).toEqual([]);
    expect(personal.placeDocuments).toEqual([]);
    expect(personal.evidence).toEqual([]);
    expect(personal.activity).toEqual([]);
    expect(personal.portfolioValueRecords).toBeUndefined();
    expect(personal.members).toEqual([
      expect.objectContaining({
        id: "personal-owner",
        householdId: "personal-household",
        role: "owner"
      })
    ]);

    expect(sample.mode).toBe("sample");
    expect(sample.assets.length).toBeGreaterThan(0);
  });

  it("rejects personal records at the conversion boundary", () => {
    expect(() =>
      createPersonalWorkspaceReplacement(
        createWorkspace("personal"),
        "2026-07-27T14:00:00.000Z",
        {
          householdId: "replacement-household",
          ownerMemberId: "replacement-owner",
          deviceId: "replacement-device"
        }
      )
    ).toThrow(
      "Only a sample workspace can be converted to a personal workspace."
    );
  });
});
