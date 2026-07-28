describe("SQLite outbox dependency ordering", () => {
  it("uses row insertion order when operations share one timestamp", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/src/data/sqliteRepository.ts`,
      "utf8"
    );

    expect(source).toContain(
      "ORDER BY created_at ASC, rowid ASC"
    );
  });
});
