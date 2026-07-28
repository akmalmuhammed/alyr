const root = process.cwd();

function read(path: string): string {
  const { existsSync, readFileSync } = jest.requireActual("fs") as {
    existsSync(filePath: string): boolean;
    readFileSync(filePath: string, encoding: "utf8"): string;
  };
  const absolutePath = `${root}/${path}`;
  expect(existsSync(absolutePath)).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("liability and recorded-net-position UI contract", () => {
  it("registers the create, detail and balance routes in the protected stack", () => {
    const layout = read("app/_layout.tsx");
    const dashboard = read("app/dashboard.tsx");

    expect(layout).toContain('name="liability-create"');
    expect(layout).toContain('name="liability/[id]"');
    expect(layout).toContain('name="liability-balance"');
    expect(dashboard).toContain('router.push("/liability-create")');
    expect(dashboard).toContain("`/liability/${subject.liabilityId}`");
  });

  it("keeps one stable selector contract across the complete liability journey", () => {
    const portfolio = read(
      "src/components/PortfolioDashboard/index.tsx"
    );
    const create = read("app/liability-create.tsx");
    const detail = read("app/liability/[id].tsx");
    const balance = read("app/liability-balance.tsx");
    const combined = [portfolio, create, detail, balance].join("\n");

    for (const testID of [
      "portfolio-net-position",
      "portfolio-net-position-visibility",
      "liabilities-list",
      "liability-add",
      "liability-name",
      "liability-category",
      "liability-amount",
      "liability-currency",
      "liability-as-of",
      "liability-save",
      "liability-edit",
      "liability-delete",
      "liability-delete-confirm",
      "liability-status",
      "liability-balance-save"
    ]) {
      expect(combined).toContain(`"${testID}"`);
    }
  });

  it("uses exact money, dated balances and the shared private-value formatter", () => {
    const create = read("app/liability-create.tsx");
    const detail = read("app/liability/[id].tsx");
    const balance = read("app/liability-balance.tsx");
    const portfolio = read(
      "src/components/PortfolioDashboard/index.tsx"
    );

    expect(create).toContain("parsePortfolioMoney");
    expect(create).toContain("createLiability");
    expect(create).toContain("asOf");
    expect(balance).toContain("parsePortfolioMoney");
    expect(balance).toContain("recordPortfolioValue");
    expect(balance).toContain("liabilityId");
    expect(balance).toContain("asOf");
    expect(detail).toContain("getPortfolioValueHistory");
    expect(detail).toContain("formatRecordedValue");
    expect(portfolio).toContain("buildNetPositionSnapshot");
    expect(portfolio).toContain("formatSignedRecordedValue");
    expect(portfolio).toContain("amountsHidden");
  });

  it("formats date-only financial records in UTC so device timezone cannot shift the calendar day", () => {
    const portfolio = read(
      "src/components/PortfolioDashboard/index.tsx"
    );

    expect(portfolio).toMatch(
      /new Intl\.DateTimeFormat\([\s\S]*?timeZone:\s*"UTC"[\s\S]*?\)\.format\(new Date\(value\)\)/u
    );
  });

  it("gives every financial control a semantic label and focuses invalid input", () => {
    const create = read("app/liability-create.tsx");
    const balance = read("app/liability-balance.tsx");
    const detail = read("app/liability/[id].tsx");

    expect(create).toContain("accessibilityLabel");
    expect(create).toContain("description=");
    expect(create).toMatch(/\.focus\(\)|focusFirstInvalid/u);
    expect(balance).toContain("accessibilityLabel");
    expect(balance).toContain("description=");
    expect(balance).toMatch(/\.focus\(\)|focusFirstInvalid/u);
    expect(detail).toContain('accessibilityRole="button"');
    expect(detail).toContain('testID="liability-delete-confirm"');
    expect(detail).toMatch(/destructive|Destructive/u);
  });

  it("ships independently authored Arabic copy for state, form and consequences", () => {
    const copy = read("src/i18n/portfolioCopy.ts");
    const combined = [
      copy,
      read("src/components/PortfolioDashboard/index.tsx"),
      read("app/liability-create.tsx"),
      read("app/liability/[id].tsx"),
      read("app/liability-balance.tsx")
    ].join("\n");

    expect(combined).toMatch(/[\u0600-\u06ff]/u);
    expect(combined).not.toMatch(
      /[ÃƒÆ’Ãƒâ€šÃƒËœÃƒâ„¢ï¿½\u0080-\u009f]/u
    );
    expect(copy).toMatch(/\bar\s*:/u);
    expect(combined).toMatch(/rtl|writingDirection/u);
    expect(combined).toMatch(/(?:recorded|tracked) net position/i);
    expect(combined).toMatch(/liabilit/i);
  });
});
