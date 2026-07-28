import type { LanguageCode } from "@/domain/model";
import type {
  AssetFilter,
  ItemGroup,
  ItemSort,
  PlaceGroup,
  PlaceSort
} from "@/register/browse";

export interface RegisterCopy {
  readonly organize: string;
  readonly organizeHint: string;
  readonly organizerTitle: string;
  readonly organizerIntro: string;
  readonly close: string;
  readonly done: string;
  readonly filterBy: string;
  readonly sortBy: string;
  readonly groupBy: string;
  readonly resultLabel: string;
  readonly noPlace: string;
  readonly noRegion: string;
  readonly filters: Readonly<Record<AssetFilter, string>>;
  readonly itemSorts: Readonly<Record<ItemSort, string>>;
  readonly itemGroups: Readonly<Record<ItemGroup, string>>;
  readonly placeSorts: Readonly<Record<PlaceSort, string>>;
  readonly placeGroups: Readonly<Record<PlaceGroup, string>>;
}

export const REGISTER_COPY: Readonly<Record<LanguageCode, RegisterCopy>> = {
  en: {
    organize: "Organize",
    organizeHint: "Change the filter, sorting and grouping for this register",
    organizerTitle: "Organize register",
    organizerIntro:
      "Choose what appears and how it is arranged. These choices stay with this view when you return.",
    close: "Close organizer",
    done: "Done",
    filterBy: "Show",
    sortBy: "Sort by",
    groupBy: "Group by",
    resultLabel: "Current view",
    noPlace: "No Place assigned",
    noRegion: "Region not recorded",
    filters: {
      all: "All active items",
      location: "Needs location",
      evidence: "Needs proof",
      value: "Needs value",
      review: "Proof to review",
      archived: "Archived"
    },
    itemSorts: {
      recent: "Recently updated",
      name: "Name A–Z",
      oldest: "Oldest added"
    },
    itemGroups: {
      none: "No grouping",
      place: "Place",
      category: "Category"
    },
    placeSorts: {
      recent: "Recently updated",
      name: "Name A–Z",
      "item-count": "Most items"
    },
    placeGroups: {
      none: "No grouping",
      region: "Region"
    }
  },
  ar: {
    organize: "تنظيم",
    organizeHint: "غيّر التصفية والترتيب والتجميع لهذا السجل",
    organizerTitle: "تنظيم السجل",
    organizerIntro:
      "اختر ما يظهر وطريقة ترتيبه. تبقى هذه الخيارات محفوظة لهذا العرض عند عودتك.",
    close: "إغلاق نافذة التنظيم",
    done: "تم",
    filterBy: "إظهار",
    sortBy: "الترتيب حسب",
    groupBy: "التجميع حسب",
    resultLabel: "العرض الحالي",
    noPlace: "من دون مكان محدد",
    noRegion: "المنطقة غير مسجلة",
    filters: {
      all: "كل الأغراض النشطة",
      location: "ينقصه الموقع",
      evidence: "ينقصه الإثبات",
      value: "تنقصه القيمة",
      review: "إثباتات للمراجعة",
      archived: "المؤرشف"
    },
    itemSorts: {
      recent: "الأحدث تحديثًا",
      name: "الاسم أبجديًا",
      oldest: "الأقدم إضافة"
    },
    itemGroups: {
      none: "من دون تجميع",
      place: "المكان",
      category: "الفئة"
    },
    placeSorts: {
      recent: "الأحدث تحديثًا",
      name: "الاسم أبجديًا",
      "item-count": "الأكثر أغراضًا"
    },
    placeGroups: {
      none: "من دون تجميع",
      region: "المنطقة"
    }
  }
};

export function getRegisterCopy(language: LanguageCode): RegisterCopy {
  return REGISTER_COPY[language];
}
