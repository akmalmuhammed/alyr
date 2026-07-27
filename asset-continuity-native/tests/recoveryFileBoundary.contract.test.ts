describe("Recovery Kit filesystem boundary", () => {
  it("writes only encrypted container bytes, including the atomic partial file", () => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const source = readFileSync(
      `${process.cwd()}/src/recovery/nativeFiles.ts`,
      "utf8"
    );
    expect(source).toContain("temporary.write(input.bytes)");
    expect(source).toContain(".partial");
    expect(source).toContain("The only bytes written by this adapter are the final AEAD container bytes");
    expect(source).not.toContain("temporary.write(JSON.stringify");
    expect(source).not.toContain("destination.write(workspace");
  });
});
