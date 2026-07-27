describe("Atlas premium interaction contract", () => {
  const source = (() => {
    const { readFileSync } = jest.requireActual("fs") as {
      readFileSync(filePath: string, encoding: "utf8"): string;
    };
    return readFileSync(`${process.cwd()}/app/atlas.tsx`, "utf8");
  })();

  it("keeps one Atlas title and exposes clear Globe and List tabs", () => {
    expect(source).not.toContain("<ScreenTitle>Atlas</ScreenTitle>");
    expect(source).toContain('accessibilityRole="tab"');
    expect(source).toContain("{atlasCopy.globe}");
    expect(source).toContain("{atlasCopy.list}");
    expect(source).toContain("useSecondarySurfaceCopy");
  });

  it("keeps direct drag plus accessible previous and next controls", () => {
    expect(source).toContain("PanResponder.create");
    expect(source).toContain(
      "accessibilityLabel={atlasCopy.previousPlace}"
    );
    expect(source).toContain(
      "accessibilityLabel={atlasCopy.nextPlace}"
    );
    expect(source).toMatch(
      /atlasNavButton:\s*\{[\s\S]*?width:\s*44,[\s\S]*?height:\s*44,/
    );
    expect(source).toMatch(
      /pinTarget:\s*\{[\s\S]*?width:\s*44,[\s\S]*?height:\s*44,/
    );
  });

  it("claims only horizontal-dominant drags and yields to vertical scrolling", () => {
    expect(source).toContain(
      "return horizontalTravel > 7 && horizontalTravel > verticalTravel"
    );
    expect(source).toContain(
      "onPanResponderTerminationRequest: () => true"
    );
    expect(source).toContain(
      "onShouldBlockNativeResponder: () => false"
    );
    expect(source).not.toContain(
      "Math.abs(gesture.dx) > 7 || Math.abs(gesture.dy) > 7"
    );
  });

  it("renders restrained offline geography at the mobile command size", () => {
    expect(source).toContain("ATLAS_COASTLINES");
    expect(source).toContain("ATLAS_GRATICULE");
    expect(source).toMatch(
      /const diameter = Math\.min\(\s*318,\s*Math\.max\(248,/
    );
    expect(source).toContain("opacity={0.09}");
    expect(source).toContain("opacity={0.56}");
    expect(source).toContain("fill={themes.dark.surface}");
  });

  it("uses a quiet 8 point selected marker with a 22 point halo", () => {
    expect(source).toContain('key={`halo-${entry.place.id}`}');
    expect(source).toContain("r={isSelected ? 11 : 0}");
    expect(source).toContain("r={isSelected ? 4 : 3}");
    expect(source).toContain(
      "opacity={isSelected ? 0.16 : 0}"
    );
    expect(source).not.toContain("pinCallout");
    expect(source).not.toContain("selectedCalloutWidth");
  });

  it("keeps selection detail below the globe rather than obscuring geography", () => {
    const globeClose = source.indexOf("</View>", source.indexOf("styles.globe"));
    const selectedSummary = source.indexOf("styles.selectedSummary");

    expect(globeClose).toBeGreaterThan(-1);
    expect(selectedSummary).toBeGreaterThan(globeClose);
    expect(source).toContain("atlasMappedPlaceLabel(");
    expect(source).toContain("{atlasCopy.openPlace}");
    expect(source).not.toMatch(/LinearGradient|BlurView/);
  });

  it("keeps every Place available in the native list with provenance", () => {
    expect(source).toContain("title={atlasCopy.everyPlace}");
    expect(source).toContain("places.map((place)");
    expect(source).toContain("placePinLabel(");
    expect(source).toContain("localizedAtlasPinDisclosure");
  });

  it("keeps the Globe and List targets at least 44 points tall", () => {
    expect(source).toMatch(
      /viewTab:\s*\{[\s\S]*?minHeight:\s*44,/
    );
  });
});
