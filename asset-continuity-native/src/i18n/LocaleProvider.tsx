import * as SecureStore from "expo-secure-store";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { Platform } from "react-native";

import type { LanguageCode } from "@/domain/model";

export const LOCALE_PREFERENCE_KEY = "alyr.locale.v1";

export interface LocalePreferenceStore {
  readonly load: () => Promise<LanguageCode | null>;
  readonly save: (language: LanguageCode) => Promise<void>;
}

export interface LocaleContextValue {
  readonly language: LanguageCode;
  readonly locale: "en-QA" | "ar-QA";
  readonly ready: boolean;
  readonly rtl: boolean;
  readonly setLanguage: (language: LanguageCode) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);
const fallbackLocaleContext: LocaleContextValue = {
  language: "en",
  locale: "en-QA",
  ready: true,
  rtl: false,
  setLanguage: async () => undefined
};

function isLanguageCode(value: unknown): value is LanguageCode {
  return value === "en" || value === "ar";
}

function webStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const localePreferenceStore: LocalePreferenceStore = {
  async load() {
    const value =
      Platform.OS === "web"
        ? webStorage()?.getItem(LOCALE_PREFERENCE_KEY) ?? null
        : await SecureStore.getItemAsync(LOCALE_PREFERENCE_KEY);
    return isLanguageCode(value) ? value : null;
  },
  async save(language) {
    if (Platform.OS === "web") {
      webStorage()?.setItem(LOCALE_PREFERENCE_KEY, language);
      return;
    }
    await SecureStore.setItemAsync(LOCALE_PREFERENCE_KEY, language);
  }
};

export function LocaleProvider({
  children,
  initialLanguage,
  store = localePreferenceStore
}: PropsWithChildren<{
  readonly initialLanguage?: LanguageCode;
  readonly store?: LocalePreferenceStore;
}>) {
  const [language, setLanguageState] = useState<LanguageCode>(
    initialLanguage ?? "en"
  );
  const [ready, setReady] = useState(Boolean(initialLanguage));

  useEffect(() => {
    let active = true;
    if (initialLanguage) {
      setReady(true);
      return () => {
        active = false;
      };
    }
    void store
      .load()
      .then((saved) => {
        if (active && saved) setLanguageState(saved);
      })
      .catch(() => {
        // Locale storage is a preference, not an app-start dependency.
        // Keep deterministic English and let the interface become ready.
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [initialLanguage, store]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const setLanguage = useCallback(
    async (next: LanguageCode) => {
      setLanguageState(next);
      try {
        await store.save(next);
      } catch {
        // The visible preference still applies for this session. A later
        // selection retries persistence instead of blocking the interface.
      }
    },
    [store]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      language,
      locale: language === "ar" ? "ar-QA" : "en-QA",
      ready,
      rtl: language === "ar",
      setLanguage
    }),
    [language, ready, setLanguage]
  );

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  // Component tests and isolated Storybook-style renders may intentionally
  // omit the application shell. They receive deterministic English rather
  // than inheriting a workspace or account.
  return context ?? fallbackLocaleContext;
}
