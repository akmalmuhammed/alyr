import { localizedWorkspaceError } from "@/i18n/coreJourneyCopy";

describe("workspace error localization", () => {
  it("keeps diagnostic English and prevents raw English from leaking into Arabic", () => {
    const diagnostic = "The encrypted vault could not be opened.";

    expect(localizedWorkspaceError(diagnostic, "en", "open")).toBe(
      diagnostic
    );
    expect(localizedWorkspaceError(diagnostic, "ar", "open")).toBe(
      "تعذّر فتح الخزنة. لم تتم الكتابة فوق أي سجل."
    );
    expect(localizedWorkspaceError(diagnostic, "ar", "save")).toBe(
      "تعذّر حفظ التغيير. بقي سجلك الحالي كما هو."
    );
  });
});
