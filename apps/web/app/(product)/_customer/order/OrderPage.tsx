"use client";

// The door of the order page: it picks the page for the shop. A shop that has switched the
// Catalog on gets the new page; a shop that has not gets the page it always had
// (`LegacyOrder`). The server normally hands over the shop's first page with the HTML; if it
// could not reach the API, this asks from the browser.

import { useEffect, useState } from "react";
import { Empty } from "../Frame";
import { type Lang } from "../price";
import { loadStore } from "./api";
import { T } from "./copy";
import LegacyOrder from "./LegacyOrder";
import Order from "./Order";
import type { Store } from "./types";

type Props = {
  slug: string;
  token: string | null;
  table: string;
  initial: Store | null;
  missing: boolean;
  lang: Lang;
  focusItem: string | null;
  focusCategory: string | null;
};

export default function OrderPage({ initial, missing, ...rest }: Props) {
  const [store, setStore] = useState<Store | null>(initial);
  const [failed, setFailed] = useState(missing);
  const t = T[rest.lang];

  useEffect(() => {
    if (store || missing) return;
    let live = true;
    loadStore(rest.slug, rest.token, rest.table, { limit: 48 })
      .then((r) => { if (live) setStore(r); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [store, missing, rest.slug, rest.token, rest.table]);

  if (failed) return <Empty text={missing ? t.notFound : t.oops} />;
  if (!store) return null;
  return store.shop.catalog
    ? <Order {...rest} initial={store} />
    : <LegacyOrder slug={rest.slug} token={rest.token} initial={store} lang={rest.lang} />;
}
