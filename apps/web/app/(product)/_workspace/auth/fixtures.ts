export interface BusinessChoice {
  id: string;
  name: string;
  name_ar: string;
  role: "owner" | "admin";
  places: number;
  initial: string;
  usedLast?: boolean;
}

export interface ServiceItem {
  id: string;
  name: string;
  length: string;
  price: string;
  deposit: string;
  isCustom?: boolean;
}

export interface BusinessTypeItem {
  id: string;
  icon: string;
  titleKey: string;
  descKey: string;
  badge?: string;
  selected?: boolean;
}

export const FIXTURE_BUSINESSES: BusinessChoice[] = [
  {
    id: "nuqta",
    name: "Nuqta Car Care",
    name_ar: "نقطة للعناية بالسيارات",
    role: "owner",
    places: 5,
    initial: "N",
    usedLast: true
  },
  {
    id: "qirfa",
    name: "Qirfa Bakery",
    name_ar: "مخبز قرفة",
    role: "admin",
    places: 1,
    initial: "Q"
  }
];

export const FIXTURE_SERVICES: ServiceItem[] = [
  { id: "s1", name: "Express wash", length: "20 min", price: "35", deposit: "" },
  { id: "s2", name: "Full wash", length: "40 min", price: "60", deposit: "" },
  { id: "s3", name: "Interior detail", length: "90 min", price: "150", deposit: "" },
  { id: "s4", name: "Engine bay clean", length: "30 min", price: "80", deposit: "" },
  { id: "s5", name: "Ceramic coating", length: "4 h", price: "1,200", deposit: "300" },
  { id: "s6", name: "Ceramic top-up", length: "60 min", price: "250", deposit: "" }
];

export const FIXTURE_TYPES: BusinessTypeItem[] = [
  { id: "salon", icon: "cal", titleKey: "salon", descKey: "salon" },
  { id: "spa", icon: "star", titleKey: "spa", descKey: "spa" },
  { id: "carcare", icon: "truck", titleKey: "carcare", descKey: "carcare", selected: true },
  { id: "home", icon: "home", titleKey: "home", descKey: "home" },
  { id: "restaurant", icon: "orders", titleKey: "restaurant", descKey: "restaurant" },
  { id: "bakery", icon: "box", titleKey: "bakery", descKey: "bakery" },
  { id: "grocery", icon: "layers", titleKey: "grocery", descKey: "grocery" },
  { id: "retail", icon: "store", titleKey: "retail", descKey: "retail" },
  { id: "fashion", icon: "tag", titleKey: "fashion", descKey: "fashion" },
  { id: "wholesale", icon: "wallet", titleKey: "wholesale", descKey: "wholesale", badge: "WITH ALYR" },
  { id: "travel", icon: "globe", titleKey: "travel", descKey: "travel", badge: "WITH ALYR" },
  { id: "other", icon: "prod", titleKey: "other", descKey: "other" }
];
