import { CATEGORY_CHOICES } from "@/domain/model";

export type ItemCategoryChoice = (typeof CATEGORY_CHOICES)[number];
export type ItemCategoryGroupId = ItemCategoryChoice["groupId"];

export const ITEM_CATEGORY_GROUP_ORDER = [
  "lifestyle-personal",
  "vehicles",
  "art-collectibles",
  "home-storage",
  "digital-records"
] as const satisfies readonly ItemCategoryGroupId[];

export const FEATURED_ITEM_CATEGORY_IDS = [
  "lifestyle.watch",
  "lifestyle.jewelry",
  "vehicle.car",
  "home.other"
] as const;

export interface ItemCategoryGroup {
  readonly id: ItemCategoryGroupId;
  readonly categories: readonly ItemCategoryChoice[];
}

export function featuredItemCategories(): readonly ItemCategoryChoice[] {
  return FEATURED_ITEM_CATEGORY_IDS.map((categoryId) => {
    const category = CATEGORY_CHOICES.find(
      (candidate) => candidate.id === categoryId
    );
    if (!category) {
      throw new Error(
        `Shared item taxonomy is missing featured category ${categoryId}.`
      );
    }
    return category;
  });
}

export function filterItemCategories(
  query: string,
  labelFor: (category: ItemCategoryChoice) => string,
  groupLabelFor: (groupId: ItemCategoryGroupId) => string
): readonly ItemCategoryChoice[] {
  const normalizedQuery = normalizeSearchTerm(query);
  if (!normalizedQuery) return CATEGORY_CHOICES;

  const directMatches = CATEGORY_CHOICES.filter((category) =>
    normalizeSearchTerm(labelFor(category)).includes(normalizedQuery)
  );
  if (directMatches.length > 0) return directMatches;

  return CATEGORY_CHOICES.filter((category) =>
    normalizeSearchTerm(groupLabelFor(category.groupId)).includes(
      normalizedQuery
    )
  );
}

export function groupItemCategories(
  categories: readonly ItemCategoryChoice[]
): readonly ItemCategoryGroup[] {
  return ITEM_CATEGORY_GROUP_ORDER.map((groupId) => ({
    id: groupId,
    categories: categories.filter(
      (category) => category.groupId === groupId
    )
  })).filter((group) => group.categories.length > 0);
}

function normalizeSearchTerm(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase();
}
