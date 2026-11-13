// Nuqta Car Care fixtures matching settings-03 designer drawings

import type {
  UserDevice,
  BusinessItem,
  CustomerDataRequest,
  TermsItem,
  DownloadRecord,
} from "./logic";

export interface AccountProfile {
  name: string;
  replyName: string;
  email: string;
  whatsapp: string;
  whatsappLinkedDate: string;
  role: "owner" | "admin" | "agent";
  lastSignIn: string;
  language: "en" | "ar";
  theme: "light" | "dark" | "auto";
  noticesChannel: "workspace" | "whatsapp" | "both";
}

export const FIXTURE_PROFILE: AccountProfile = {
  name: "Hana Saeed",
  replyName: "Hana",
  email: "hana@nuqta.qa",
  whatsapp: "+974 5555 0100",
  whatsappLinkedDate: "3 SEP",
  role: "owner",
  lastSignIn: "Sun 8 Nov 06:58",
  language: "en",
  theme: "light",
  noticesChannel: "both",
};

export const FIXTURE_DEVICES: UserDevice[] = [
  {
    id: "dev-win",
    kind: "globe",
    name: "Chrome on Windows",
    location: "Doha",
    signedInAt: "Sun 8 Nov 06:58",
    expiresAt: "Tue 8 Dec",
    isCurrent: true,
  },
  {
    id: "dev-iphone",
    kind: "phone",
    name: "Safari on iPhone",
    location: "Doha",
    signedInAt: "Mon 2 Nov",
    lastUsedAt: "Wed 11 Nov 21:40",
    expiresAt: "Wed 2 Dec",
    isCurrent: false,
  },
  {
    id: "dev-tablet",
    kind: "globe",
    name: "Chrome on an Android tablet",
    location: "Doha",
    signedInAt: "Wed 14 Oct",
    lastUsedAt: "Sat 31 Oct 19:12",
    expiresAt: "ends tomorrow",
    isCurrent: false,
  },
];

export const FIXTURE_BUSINESSES: BusinessItem[] = [
  {
    id: "biz-nuqta",
    nameEn: "Nuqta Car Care",
    nameAr: "نقطة للعناية بالسيارات",
    role: "owner",
    peopleCount: 7,
    initial: "N",
    isOpenNow: true,
  },
  {
    id: "biz-qirfa",
    nameEn: "Qirfa Bakery",
    nameAr: "مخبز قرفة",
    role: "admin",
    peopleCount: 4,
    initial: "Q",
    isOpenNow: false,
  },
];

export const FIXTURE_DOWNLOADS: DownloadRecord[] = [
  {
    id: "dl-1",
    downloadedAt: "Sun 1 Nov 2026 10:14",
    downloadedBy: "Hana",
    size: "212 MB",
    followedNote: "Hana and Omar were emailed",
  },
  {
    id: "dl-2",
    downloadedAt: "Thu 1 Oct 2026 09:02",
    downloadedBy: "Hana",
    size: "188 MB",
    followedNote: "Hana and Omar were emailed",
  },
  {
    id: "dl-3",
    downloadedAt: "Wed 2 Sep 2026 16:40",
    downloadedBy: "Hana",
    size: "3 MB",
    followedNote: "Hana was emailed",
  },
];

export const FIXTURE_REQUESTS: CustomerDataRequest[] = [
  {
    id: "req-1",
    askedDate: "Mon 9 Nov",
    customerIdentifier: "+974 5555 0188",
    askedFor: "copy",
    state: "sent",
    handledBy: "Omar",
    note: "A file, sent the same day",
  },
  {
    id: "req-2",
    askedDate: "Thu 5 Nov",
    customerIdentifier: "Layla Farouk",
    askedFor: "forget",
    state: "waiting",
    handledBy: "Hana",
    note: "Order 1033 is still open",
  },
  {
    id: "req-3",
    askedDate: "Mon 2 Nov",
    customerIdentifier: "Sara Haddad",
    askedFor: "no_messages",
    state: "done",
    handledBy: "By rule",
    note: "She wrote STOP",
  },
  {
    id: "req-4",
    askedDate: "Wed 28 Oct",
    customerIdentifier: "Noor Abdullah",
    askedFor: "name_correction",
    state: "done",
    handledBy: "Salma",
    note: 'Was "Nour Abdulla"',
  },
  {
    id: "req-5",
    askedDate: "Sun 18 Oct",
    customerIdentifier: "Forgotten customer",
    askedFor: "forget",
    state: "forgotten",
    handledBy: "Hana",
    note: "2 receipts kept, no name",
  },
  {
    id: "req-6",
    askedDate: "Sat 3 Oct",
    customerIdentifier: "Yousef Hassan",
    askedFor: "copy",
    state: "sent",
    handledBy: "Omar",
    note: "A file, sent the next day",
  },
];

export const FIXTURE_TERMS: TermsItem[] = [
  {
    id: "term-1",
    document: "Customer Agreement",
    version: "3",
    acceptedAt: "Mon 2 Nov 2026 08:14",
    acceptedBy: "Hana",
    isCurrent: true,
  },
  {
    id: "term-2",
    document: "Privacy Notice",
    version: "2",
    acceptedAt: "Mon 2 Nov 2026 08:14",
    acceptedBy: "Hana",
    isCurrent: true,
  },
  {
    id: "term-3",
    document: "Customer Agreement",
    version: "2",
    acceptedAt: "Tue 1 Sep 2026 11:26",
    acceptedBy: "Hana",
    isCurrent: false,
  },
  {
    id: "term-4",
    document: "Privacy Notice",
    version: "1",
    acceptedAt: "Tue 1 Sep 2026 11:26",
    acceptedBy: "Hana",
    isCurrent: false,
  },
];
