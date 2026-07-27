describe("property value route contract", () => {
  it("accepts exactly one Asset or Place subject and returns to its record", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const route = readFileSync(
      `${process.cwd()}/app/asset-value.tsx`,
      "utf8"
    );
    const place = readFileSync(
      `${process.cwd()}/app/place/[id].tsx`,
      "utf8"
    );
    const dashboard = readFileSync(
      `${process.cwd()}/app/dashboard.tsx`,
      "utf8"
    );
    const foregroundSync = readFileSync(
      `${process.cwd()}/src/data/foregroundSync.ts`,
      "utf8"
    );

    expect(route).toContain("assetId?: string");
    expect(route).toContain("placeId?: string");
    expect(route).toContain("ambiguousSubject");
    expect(route).toContain('subject.kind === "place"');
    expect(route).toContain('"place.write"');
    expect(route).toContain("recordPortfolioValue");
    expect(route).toContain("isOwnedPropertyPlace(place)");
    expect(route).toContain("asset-value-place-not-owned");
    expect(route).toContain("subjectCopy.placeSync");
    expect(route).toContain(
      "localizedWorkspaceError(error, language)"
    );
    expect(route).toContain(
      "portfolioCurrencyAccessibilityLabel("
    );
    expect(route).toContain("router.replace(`/place/${subject.placeId}`)");
    expect(place).toContain("place-recorded-value");
    expect(place).toContain("ownedProperty ?");
    expect(place).toContain(
      "/asset-value?placeId=${encodeURIComponent("
    );
    expect(dashboard).toContain(
      'subject.kind === "asset"'
    );
    expect(dashboard).toContain("`/place/${subject.placeId}`");
    expect(foregroundSync).toContain("isOwnedPropertyPlace(candidate)");
    expect(foregroundSync).not.toContain(
      'portfolioValueSubject(record)?.kind === "place"'
    );
  });

  it("ships independently authored Arabic property-value copy", () => {
    const {
      VALUE_SUBJECT_COPY,
      localizedPortfolioMoneyError,
      portfolioCurrencyAccessibilityLabel
    } = jest.requireActual(
      "../app/asset-value"
    ) as typeof import("../app/asset-value");
    const {
      parsePortfolioMoney,
      PORTFOLIO_CURRENCY_CHOICES
    } = jest.requireActual(
      "../src/domain/portfolio"
    ) as typeof import("../src/domain/portfolio");
    const qar = PORTFOLIO_CURRENCY_CHOICES.find(
      (choice) => choice.code === "QAR"
    )!;

    expect(VALUE_SUBJECT_COPY.ar.placeTitle).toBe("سجّل قيمة العقار");
    expect(VALUE_SUBJECT_COPY.ar.placeMeaning).toContain("ليست سعر سوق");
    expect(VALUE_SUBJECT_COPY.ar.placeSync).toContain("الجهاز المشفّر");
    expect(VALUE_SUBJECT_COPY.ar.placeTitle).not.toBe(
      VALUE_SUBJECT_COPY.en.placeTitle
    );
    expect(
      localizedPortfolioMoneyError(
        parsePortfolioMoney("1,000", "QAR"),
        "ar"
      )
    ).toBe(
      "استخدم الأرقام والفاصلة العشرية فقط، من دون فواصل الآلاف."
    );
    expect(
      localizedPortfolioMoneyError(
        parsePortfolioMoney("1.001", "QAR"),
        "ar"
      )
    ).toBe("تدعم QAR منزلتين عشريتين كحد أقصى.");
    expect(portfolioCurrencyAccessibilityLabel(qar, "ar")).toBe(
      "QAR, الريال القطري"
    );
    expect(portfolioCurrencyAccessibilityLabel(qar, "en")).toBe(
      "QAR, Qatari riyal"
    );
  });
});
