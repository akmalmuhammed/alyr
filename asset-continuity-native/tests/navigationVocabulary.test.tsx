import { fireEvent, render } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ItemsScreen, {
  initialCollectionView
} from "../app/(tabs)/assets";
import { createWorkspace } from "@/domain/sample";
import { COPY } from "@/i18n/copy";
import { CORE_JOURNEY_COPY } from "@/i18n/coreJourneyCopy";
import { PRIMARY_ROUTES } from "@/navigation/primaryRoutes";

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  setParams: jest.fn()
};
let mockParams: {
  view?: string;
  filter?: string;
  itemSort?: string;
  itemGroup?: string;
  placeSort?: string;
  placeGroup?: string;
} = {};
let mockCanWrite = true;
let mockWorkspace = createWorkspace("personal");
const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 }
};

function SafeAreaTestProvider({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      {children}
    </SafeAreaProvider>
  );
}

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter
}));

jest.mock("@/components/AssetPhotoPreview", () => ({
  AssetPhotoPreview: () => null
}));

jest.mock("@/state/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    can: (capability: string) =>
      capability.endsWith(".read") || mockCanWrite,
    workspace: mockWorkspace
  })
}));

describe("ALYR navigation vocabulary", () => {
  beforeEach(() => {
    mockParams = {};
    mockCanWrite = true;
    mockWorkspace = createWorkspace("personal");
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    mockRouter.setParams.mockClear();
  });

  it("opens the Items destination on the Items view by default", async () => {
    const screen = await render(<ItemsScreen />, {
      wrapper: SafeAreaTestProvider
    });
    const itemsTab = screen.getByRole("tab", { name: "Items · 0" });
    const placesTab = screen.getByRole("tab", { name: "Places · 0" });

    expect(screen.getByText("Assets")).toBeTruthy();
    expect(itemsTab.props.accessibilityState).toEqual({ selected: true });
    expect(placesTab.props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByText("Start with one important item")).toBeTruthy();
  });

  it("keeps Places discoverable as a peer view without another bottom tab", async () => {
    const screen = await render(<ItemsScreen />, {
      wrapper: SafeAreaTestProvider
    });
    const placesTab = screen.getByRole("tab", { name: "Places · 0" });

    await fireEvent.press(placesTab);

    expect(
      screen.getByRole("tab", { name: "Places · 0" }).props
        .accessibilityState
    ).toEqual({ selected: true });
    expect(screen.getByText("Your places")).toBeTruthy();
    expect(screen.getByText("Add a place you recognise")).toBeTruthy();
    expect(mockRouter.setParams).toHaveBeenCalledWith({
      view: "places"
    });
  });

  it("restores each peer view's independent URL-backed organization state", async () => {
    mockWorkspace = createWorkspace("sample");
    mockParams = {
      view: "places",
      filter: "evidence",
      itemSort: "name",
      itemGroup: "place",
      placeSort: "item-count",
      placeGroup: "region"
    };
    const screen = await render(<ItemsScreen />, {
      wrapper: SafeAreaTestProvider
    });

    expect(screen.getByText("Most items · Region")).toBeTruthy();

    await fireEvent.press(
      screen.getByRole("tab", { name: "Items · 6" })
    );

    expect(screen.getByText("Needs proof · Name A–Z · Place")).toBeTruthy();
    expect(mockRouter.setParams).toHaveBeenLastCalledWith({
      view: undefined
    });
  });

  it("keeps organize controls explicit, accessible and reflected in URL params", async () => {
    mockWorkspace = createWorkspace("sample");
    const screen = await render(<ItemsScreen />, {
      wrapper: SafeAreaTestProvider
    });

    await fireEvent.press(
      screen.getByRole("button", { name: "Organize" })
    );

    expect(screen.getByTestId("register-organizer")).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "All active items" }).props
        .accessibilityState
    ).toEqual({ checked: true });

    await fireEvent.press(
      screen.getByRole("radio", { name: "Needs proof" })
    );
    expect(mockRouter.setParams).toHaveBeenLastCalledWith({
      filter: "evidence"
    });

    await fireEvent.press(
      screen.getByRole("radio", { name: "Place" })
    );
    expect(mockRouter.setParams).toHaveBeenLastCalledWith({
      itemGroup: "place"
    });
  });

  it("honours direct Places links and rejects unknown view names", () => {
    expect(initialCollectionView("places")).toBe("places");
    expect(initialCollectionView("items")).toBe("items");
    expect(initialCollectionView(undefined)).toBe("items");
    expect(initialCollectionView("spaces")).toBe("items");
  });

  it("keeps viewer navigation readable without exposing capture CTAs", async () => {
    mockCanWrite = false;
    const screen = await render(<ItemsScreen />, {
      wrapper: SafeAreaTestProvider
    });

    expect(screen.getByTestId("items-view-only-notice")).toBeTruthy();
    expect(screen.getByText("View-only item access")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Add item" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add first item" })
    ).toBeNull();
  });

  it("opens the hidden Search route from Items for every household role", async () => {
    mockCanWrite = false;
    const screen = await render(<ItemsScreen />, {
      wrapper: SafeAreaTestProvider
    });

    await fireEvent.press(screen.getByRole("button", { name: "Search" }));

    expect(mockRouter.push).toHaveBeenCalledWith(PRIMARY_ROUTES.search);
  });

  it("keeps exactly four visible tabs and gives Family one canonical URL", () => {
    const { existsSync, readFileSync } = jest.requireActual("fs") as {
      existsSync(path: string): boolean;
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const layout = readFileSync(
      `${process.cwd()}/app/(tabs)/_layout.tsx`,
      "utf8"
    );
    const rootLayout = readFileSync(
      `${process.cwd()}/app/_layout.tsx`,
      "utf8"
    );
    const home = readFileSync(
      `${process.cwd()}/app/(tabs)/index.tsx`,
      "utf8"
    );
    const search = readFileSync(
      `${process.cwd()}/app/(tabs)/search.tsx`,
      "utf8"
    );
    const family = readFileSync(
      `${process.cwd()}/app/(tabs)/family.tsx`,
      "utf8"
    );

    expect(layout.match(/<Tabs\.Screen/g)).toHaveLength(5);
    for (const route of ["index", "assets", "family", "vault"]) {
      expect(layout).toContain(`name="${route}"`);
    }
    expect(layout).toMatch(
      /name="search"[\s\S]*?href:\s*null[\s\S]*?title:\s*text\.navSearch/u
    );
    expect(layout).toContain("title: text.navItems");
    expect(layout).toContain("title: text.navFamily");
    expect(layout).toContain(
      "tabBarAccessibilityLabel: text.navFamilyA11y"
    );
    expect(layout).not.toContain("title: text.navSpaces");
    expect(rootLayout).not.toContain('name="family"');
    expect(
      existsSync(`${process.cwd()}/app/(tabs)/family.tsx`)
    ).toBe(true);
    expect(existsSync(`${process.cwd()}/app/family.tsx`)).toBe(false);
    expect(PRIMARY_ROUTES.family).toBe("/family");
    expect(COPY.en.navItems).toBe("Assets");
    expect(COPY.ar.navItems).toBe("الأصول");
    expect(COPY.en.navItemsA11y).toBe(
      "Assets. Browse items and places."
    );
    expect(COPY.ar.navItemsA11y).toBe(
      "الأصول. تصفّح أغراضك والأماكن التي تحفظها."
    );
    expect(CORE_JOURNEY_COPY.en.items.title).toBe("Assets");
    expect(CORE_JOURNEY_COPY.ar.items.title).toBe("الأصول");
    expect(CORE_JOURNEY_COPY.en.items.itemsTab).toBe("Items");
    expect(CORE_JOURNEY_COPY.en.items.placesTab).toBe("Places");
    expect(CORE_JOURNEY_COPY.ar.items.itemsTab).toBe("الأغراض");
    expect(CORE_JOURNEY_COPY.ar.items.placesTab).toBe("الأماكن");
    expect(COPY.en.navFamily).toBe("Family");
    expect(COPY.ar.navFamily).toBe("الأسرة");
    expect(family).toContain("<ScreenTitle>{copy.family.title}</ScreenTitle>");
    expect(search).toContain("router.canGoBack()");
    expect(search).toContain("router.back()");
    expect(search).toContain("router.replace(PRIMARY_ROUTES.items)");
    expect(home).toContain('router.push("/assets?view=places")');
    expect(home).toContain("copy.today.viewPlaces");
    expect(CORE_JOURNEY_COPY.en.today.viewPlaces).toBe("View places");
    expect(CORE_JOURNEY_COPY.ar.today.viewPlaces).toBe("عرض الأماكن");
  });
});
