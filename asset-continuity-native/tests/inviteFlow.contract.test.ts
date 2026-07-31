import {
  formatInvitationExpiry,
  groupInvitationCode,
  INVITE_COPY,
  invitationShareMessage
} from "@/i18n/inviteCopy";
import { heldatPublicJoinUrl } from "@/release/publicEndpoints";

const { readFileSync } = jest.requireActual("fs") as {
  readFileSync(path: string, encoding: "utf8"): string;
};

describe("household invitation journey", () => {
  it("ships complete English and Arabic consequences", () => {
    expect(INVITE_COPY.en.screen.editorDescription).toContain(
      "Cannot manage members"
    );
    expect(INVITE_COPY.en.screen.volatileNotice).toContain(
      "does not save"
    );
    expect(INVITE_COPY.ar.screen.editorDescription).toContain(
      "الأعضاء"
    );
    expect(INVITE_COPY.ar.household.joinAction).toBe(
      "الانضمام إلى الأسرة"
    );
    expect(
      invitationShareMessage(
        "Rahman household",
        "ABCD1234",
        "viewer",
        "2026-07-30T12:00:00.000Z",
        "en"
      )
    ).toContain("Code: ABCD1234");
    expect(
      invitationShareMessage(
        "Rahman household",
        "ABCD1234",
        "viewer",
        "2026-07-30T12:00:00.000Z",
        "en",
        heldatPublicJoinUrl("ABCD1234")
      )
    ).toContain(
      "Open invitation: https://heldat.app/join?code=ABCD1234"
    );
    expect(heldatPublicJoinUrl("ABCD 1234")).toBe(
      "https://heldat.app/join?code=ABCD%201234"
    );
    expect(groupInvitationCode("ABCD1234EFGH")).toEqual([
      "ABCD",
      "1234",
      "EFGH"
    ]);
    expect(groupInvitationCode("ABCD-1234 EFGH")).toEqual([
      "ABCD",
      "1234",
      "EFGH"
    ]);
    expect(
      formatInvitationExpiry(
        "2026-07-30T12:00:00.000Z",
        "en"
      )
    ).toContain("2026");
    expect(
      formatInvitationExpiry(
        "2026-07-30T12:00:00.000Z",
        "ar"
      )
    ).not.toBe("2026-07-30T12:00:00.000Z");
    expect(INVITE_COPY.ar.screen.copyAction).not.toBe(
      INVITE_COPY.en.screen.copyAction
    );
  });

  it("keeps the code volatile and gates creation by provider role", () => {
    const provider = readFileSync(
      `${process.cwd()}/src/auth/AuthFlowProvider.tsx`,
      "utf8"
    );
    const inviteScreen = readFileSync(
      `${process.cwd()}/app/invite-member.tsx`,
      "utf8"
    );
    const rootLayout = readFileSync(
      `${process.cwd()}/app/_layout.tsx`,
      "utf8"
    );
    const householdScreen = readFileSync(
      `${process.cwd()}/app/(auth)/household.tsx`,
      "utf8"
    );
    const packageJson = JSON.parse(
      readFileSync(`${process.cwd()}/package.json`, "utf8")
    ) as {
      dependencies?: Record<string, string>;
    };
    expect(provider).toContain(
      'session.activeHouseholdRole !== "owner"'
    );
    expect(provider).not.toContain("console.");
    expect(provider).not.toContain("Analytics");
    expect(inviteScreen).toContain("Share.share");
    expect(inviteScreen).toContain(
      "heldatPublicJoinUrl(invite.oneTimeCode)"
    );
    expect(inviteScreen).toContain(
      "Clipboard.setStringAsync(invite.oneTimeCode)"
    );
    expect(inviteScreen).toContain("formatInvitationExpiry(");
    expect(inviteScreen).toContain("groupInvitationCode(");
    expect(inviteScreen).toContain("setInvite(null)");
    expect(inviteScreen).toMatch(
      /copyAction:\s*\{[\s\S]*?minHeight:\s*44,/
    );
    expect(inviteScreen).not.toContain("SecureStore");
    expect(inviteScreen).not.toContain("AsyncStorage");
    expect(rootLayout).toMatch(
      /name="invite-member"[\s\S]*?headerShown: false[\s\S]*?presentation: "modal"/
    );
    expect(householdScreen).toContain(
      "stageHouseholdInvite(normalizedCode)"
    );
    expect(householdScreen).toContain(
      "router.push(AUTH_ROUTES.join)"
    );
    expect(householdScreen).not.toContain(
      "acceptHouseholdInvite(normalizedCode)"
    );
    expect(householdScreen).toContain(
      "PREVIEW_HOUSEHOLD_INVITE_CODE"
    );
    expect(packageJson.dependencies?.["expo-clipboard"]).toBe(
      "~57.0.1"
    );
  });
});
