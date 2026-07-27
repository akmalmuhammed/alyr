import { COPY } from "@/i18n/copy";

describe("native bilingual copy contract", () => {
  it("keeps English and Arabic keys in parity", () => {
    expect(Object.keys(COPY.ar).sort()).toEqual(Object.keys(COPY.en).sort());
  });

  it("uses native UTF-8 Arabic without mojibake", () => {
    const arabic = Object.values(COPY.ar).join(" ");

    expect(arabic).toMatch(/[\u0600-\u06ff]/u);
    expect(arabic).not.toMatch(/[ÃÂØÙ�\u0080-\u009f]/u);
  });

  it("defines the revised consumer navigation and nouns", () => {
    expect(COPY.en).toMatchObject({
      navToday: "Today",
      navTodayA11y: "Today. Review priorities and continue documenting.",
      navItems: "Assets",
      navItemsA11y: "Assets. Browse items and places.",
      navFamily: "Family",
      navFamilyA11y: "Family. Review household members and access.",
      navSearch: "Search",
      navVault: "Vault",
      navVaultA11y: "Vault. Review proof, recovery, privacy and sync.",
      place: "Place",
      items: "Items",
      item: "Item",
      spaces: "Spaces",
      proof: "Proof"
    });
    expect(COPY.ar).toMatchObject({
      navToday: "اليوم",
      navTodayA11y: "اليوم. راجع الأولويات وواصل التوثيق.",
      navItems: "الأصول",
      navItemsA11y: "الأصول. تصفّح أغراضك والأماكن التي تحفظها.",
      navFamily: "الأسرة",
      navFamilyA11y: "الأسرة. راجع الأعضاء وصلاحيات الوصول.",
      navSearch: "بحث",
      navVault: "الخزنة",
      navVaultA11y: "الخزنة. راجع الإثباتات والاستعادة والخصوصية والمزامنة.",
      place: "مكان",
      items: "الأغراض",
      item: "غرض",
      spaces: "المساحات",
      proof: "إثبات"
    });
  });
});
