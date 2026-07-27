describe("recorded-value form interaction contract", () => {
  it("uses one currency choice and reveals a custom code only on demand", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/app/asset-value.tsx`,
      "utf8"
    );

    expect(source).toContain(
      "accessibilityLabel={copy.assetValue.otherCurrency}"
    );
    expect(source).toContain("{customCurrencyActive ? (");
    expect(source).toContain(
      "label={copy.assetValue.otherCurrency}"
    );
    expect(source).toContain("label={copy.assetValue.amount}");
    expect(source).not.toContain('label="Currency"');
    expect(source).toContain("label={copy.assetValue.day}");
    expect(source).toContain("label={copy.assetValue.month}");
    expect(source).toContain("label={copy.assetValue.year}");
    expect(source).not.toContain('placeholder="YYYY-MM-DD"');
    expect(source).toContain(
      "disabled={saving || (current !== null && !hasDraft)}"
    );
    expect(source).not.toContain("disabled={!canSave}");
  });
});
