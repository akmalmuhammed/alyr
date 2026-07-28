import { shouldActivateAtlasDrag } from "../app/atlas";

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

  it("activates horizontal, vertical, and diagonal globe drags after a 2D threshold", () => {
    expect(shouldActivateAtlasDrag(8, 0)).toBe(true);
    expect(shouldActivateAtlasDrag(0, 8)).toBe(true);
    expect(shouldActivateAtlasDrag(6, 6)).toBe(true);
    expect(shouldActivateAtlasDrag(4, 4)).toBe(false);
    expect(source).toContain(
      "shouldActivateAtlasDrag(gesture.dx, gesture.dy)"
    );
    expect(source).toContain(
      "Math.hypot(deltaX, deltaY) > ATLAS_DRAG_THRESHOLD"
    );
  });

  it("keeps the surrounding ScrollView and List route available", () => {
    expect(source).toContain(
      "onPanResponderTerminationRequest: () => true"
    );
    expect(source).toContain(
      "onShouldBlockNativeResponder: () => false"
    );
    expect(source).toContain('onPress={() => setView("list")}');
    expect(source).not.toContain("horizontalTravel > verticalTravel");
  });

  it("coalesces drag updates to one animation frame and cleans up pending work", () => {
    expect(source).toContain(
      "cameraFrame.current = requestAnimationFrame(() =>"
    );
    expect(source).toContain(
      "if (cameraFrame.current !== null) return"
    );
    expect(source).toContain(
      "cancelAnimationFrame(cameraFrame.current)"
    );
    expect(source).toContain("pendingDrag.current = null");
  });

  it("renders restrained offline geography at the mobile command size", () => {
    expect(source).toContain("ATLAS_COASTLINE_RENDER_LINES");
    expect(source).toContain("ATLAS_GRATICULE_RENDER_LINES");
    expect(source).toContain("projectPreparedAtlasPolyline");
    expect(source).not.toContain("projectAtlasPolyline");
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

  it("uses the approved Arabic font for user-facing Place and region text while preserving bidi isolation", () => {
    for (const styleName of [
      "canvasRegion",
      "positionName",
      "selectedTitle",
      "placeName"
    ]) {
      expect(source).toMatch(
        new RegExp(
          `styles\\.${styleName},[\\s\\S]*?rtl && styles\\.arabicMedium,[\\s\\S]*?styles\\.mixedScript,[\\s\\S]*?rtl && styles\\.textRight`
        )
      );
    }

    for (const styleName of ["selectedMeta", "placeMeta"]) {
      expect(source).toMatch(
        new RegExp(
          `styles\\.${styleName},[\\s\\S]*?rtl && styles\\.arabic,[\\s\\S]*?styles\\.mixedScript,[\\s\\S]*?rtl && styles\\.textRight`
        )
      );
    }

    expect(source).toMatch(
      /arabic:\s*\{[\s\S]*?fontFamily:\s*typography\.arabic/
    );
    expect(source).toMatch(
      /arabicMedium:\s*\{[\s\S]*?fontFamily:\s*typography\.arabicMedium/
    );
    expect(source).toMatch(
      /mixedScript:\s*\{[\s\S]*?writingDirection:\s*"auto"/
    );
  });

  it("keeps visible Atlas copy at 12 points or larger and reserves metadata type for operational annotations", () => {
    const visibleFontSizes = [
      ...source.matchAll(/fontSize:\s*(\d+),/g)
    ].map((match) => Number(match[1]));

    expect(Math.min(...visibleFontSizes)).toBeGreaterThanOrEqual(12);

    for (const styleName of [
      "canvasKicker",
      "selectedKicker"
    ]) {
      expect(source).toMatch(
        new RegExp(
          `${styleName}:\\s*\\{[\\s\\S]*?fontSize:\\s*13,`
        )
      );
    }

    const metadataStyles = [
      ...source.matchAll(
        /(\w+):\s*\{[^{}]*fontFamily:\s*typography\.metadata/g
      )
    ].map((match) => match[1]);

    expect(metadataStyles.sort()).toEqual(
      [
        "canvasCountLabel",
        "canvasCountValue",
        "currentLabel",
        "listSummary",
        "placePinMeta",
        "positionLabel",
        "selectedPrecision"
      ].sort()
    );
  });
});
