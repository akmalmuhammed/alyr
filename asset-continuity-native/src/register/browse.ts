import type {
  LanguageCode,
  NativeAsset,
  NativePlace
} from "@/domain/model";
import { localizedCategoryLabel } from "@/i18n/captureCopy";

export type CollectionView = "items" | "places";
export type AssetFilter =
  | "all"
  | "location"
  | "evidence"
  | "value"
  | "review"
  | "archived";
export type ItemSort = "recent" | "name" | "oldest";
export type ItemGroup = "none" | "place" | "category";
export type PlaceSort = "recent" | "name" | "item-count";
export type PlaceGroup = "none" | "region";

export interface RegisterSection<T> {
  readonly id: string;
  readonly label: string | null;
  readonly records: readonly T[];
}

export function initialCollectionView(
  value: string | undefined
): CollectionView {
  return value === "places" ? "places" : "items";
}

export function initialAssetFilter(
  value: string | undefined
): AssetFilter {
  return value === "location" ||
    value === "evidence" ||
    value === "value" ||
    value === "review" ||
    value === "archived"
    ? value
    : "all";
}

export function initialItemSort(
  value: string | undefined
): ItemSort {
  return value === "name" || value === "oldest" ? value : "recent";
}

export function initialItemGroup(
  value: string | undefined
): ItemGroup {
  return value === "place" || value === "category" ? value : "none";
}

export function initialPlaceSort(
  value: string | undefined
): PlaceSort {
  return value === "name" || value === "item-count"
    ? value
    : "recent";
}

export function initialPlaceGroup(
  value: string | undefined
): PlaceGroup {
  return value === "region" ? value : "none";
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function collator(language: LanguageCode): Intl.Collator {
  return new Intl.Collator(language, {
    numeric: true,
    sensitivity: "base"
  });
}

function stableNameCompare<T extends { readonly id: string; readonly name: string }>(
  left: T,
  right: T,
  compare: Intl.Collator
): number {
  return (
    compare.compare(left.name, right.name) ||
    left.id.localeCompare(right.id)
  );
}

export function sortRegisterAssets(
  assets: readonly NativeAsset[],
  sort: ItemSort,
  language: LanguageCode
): readonly NativeAsset[] {
  const compare = collator(language);
  return [...assets].sort((left, right) => {
    if (sort === "name") {
      return stableNameCompare(left, right, compare);
    }
    if (sort === "oldest") {
      return (
        timestamp(left.createdAt) - timestamp(right.createdAt) ||
        stableNameCompare(left, right, compare)
      );
    }
    return (
      timestamp(right.updatedAt) - timestamp(left.updatedAt) ||
      stableNameCompare(left, right, compare)
    );
  });
}

export function sortRegisterPlaces(
  places: readonly NativePlace[],
  sort: PlaceSort,
  language: LanguageCode,
  activeItemCountByPlace: ReadonlyMap<string, number>
): readonly NativePlace[] {
  const compare = collator(language);
  return [...places].sort((left, right) => {
    if (sort === "name") {
      return stableNameCompare(left, right, compare);
    }
    if (sort === "item-count") {
      return (
        (activeItemCountByPlace.get(right.id) ?? 0) -
          (activeItemCountByPlace.get(left.id) ?? 0) ||
        stableNameCompare(left, right, compare)
      );
    }
    return (
      timestamp(right.updatedAt) - timestamp(left.updatedAt) ||
      stableNameCompare(left, right, compare)
    );
  });
}

function orderedSections<T>(
  sections: ReadonlyMap<
    string,
    { readonly label: string; readonly records: readonly T[] }
  >,
  language: LanguageCode,
  lastSectionId?: string
): readonly RegisterSection<T>[] {
  const compare = collator(language);
  return [...sections.entries()]
    .sort(([leftId, left], [rightId, right]) => {
      if (leftId === lastSectionId) return 1;
      if (rightId === lastSectionId) return -1;
      return (
        compare.compare(left.label, right.label) ||
        leftId.localeCompare(rightId)
      );
    })
    .map(([id, section]) => ({
      id,
      label: section.label,
      records: section.records
    }));
}

export function groupRegisterAssets(
  assets: readonly NativeAsset[],
  group: ItemGroup,
  language: LanguageCode,
  places: readonly NativePlace[],
  noPlaceLabel: string
): readonly RegisterSection<NativeAsset>[] {
  if (group === "none") {
    return [{ id: "all", label: null, records: assets }];
  }

  const placeById = new Map(places.map((place) => [place.id, place]));
  const sections = new Map<
    string,
    { readonly label: string; readonly records: NativeAsset[] }
  >();
  const noPlaceId = "place:none";

  for (const asset of assets) {
    const place = asset.placeId ? placeById.get(asset.placeId) : undefined;
    const id =
      group === "place"
        ? place
          ? `place:${place.id}`
          : noPlaceId
        : `category:${asset.categoryId}`;
    const label =
      group === "place"
        ? place?.name ?? noPlaceLabel
        : localizedCategoryLabel(
            asset.categoryId,
            asset.categoryLabel,
            language
          );
    const section = sections.get(id);
    if (section) {
      section.records.push(asset);
    } else {
      sections.set(id, { label, records: [asset] });
    }
  }

  return orderedSections(
    sections,
    language,
    group === "place" ? noPlaceId : undefined
  );
}

export function groupRegisterPlaces(
  places: readonly NativePlace[],
  group: PlaceGroup,
  language: LanguageCode,
  noRegionLabel: string
): readonly RegisterSection<NativePlace>[] {
  if (group === "none") {
    return [{ id: "all", label: null, records: places }];
  }

  const sections = new Map<
    string,
    { readonly label: string; readonly records: NativePlace[] }
  >();
  const noRegionId = "region:none";

  for (const place of places) {
    const region = place.regionLabel.trim();
    const id = region
      ? `region:${region.toLocaleLowerCase(language)}`
      : noRegionId;
    const label = region || noRegionLabel;
    const section = sections.get(id);
    if (section) {
      section.records.push(place);
    } else {
      sections.set(id, { label, records: [place] });
    }
  }

  return orderedSections(sections, language, noRegionId);
}
