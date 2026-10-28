// The customer's order page (`/s/<shop>`), ALY-112. The server asks the API twice, before any
// script runs on the customer's phone:
//
//   * what a pasted link should preview (`generateMetadata`): the title, the price, the
//     description and the 800 px photo of the item, the category or the shop, as Open Graph
//     and Twitter tags in the page's own HTML, so WhatsApp, Instagram and the rest show a
//     picture, a name and a price. The photo's address is absolute and public, built from the
//     configured public web address (`ALYR_PUBLIC_WEB_URL`);
//   * the shop's first page of items, so the menu is in the HTML a slow phone gets first.
//
// Everything after that is the client's (`OrderPage`). A link is public (`?item=`, `?cat=`,
// `?table=`, none of them a person) or one customer's own (`?t=<signed token>`).

import type { Metadata } from "next";
import { headers } from "next/headers";
import OrderPage from "../../_customer/order/OrderPage";
import { askApi, visitorHeaders } from "../../_customer/order/serverApi";
import type { Store } from "../../_customer/order/types";

const API = process.env.ALYR_API_URL ?? "http://127.0.0.1:8000";

type Query = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Query> };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

type Share = {
  kind: "item" | "category" | "shop";
  site: string;
  title: string;
  description: string;
  url: string;
  image: { url: string; width: number; height: number } | null;
  price_amount?: string;
};

async function get<T>(path: string, token?: string | null): Promise<{ status: number; body: T | null }> {
  // The customer's link goes to the API in a header, so the API's request log holds none; who
  // the visitor is goes along too, so the API does not count every visitor as this server (ALY-265).
  return askApi<T>(API, path, { token, visitor: visitorHeaders(await headers()) });
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const query = await searchParams;
  const asked = new URLSearchParams();
  if (one(query.item)) asked.set("item", one(query.item));
  if (one(query.cat)) asked.set("category", one(query.cat));
  const { body } = await get<Share>(`/api/store/${encodeURIComponent(slug)}/share?${asked}`);
  if (!body) return { title: "Order", referrer: "no-referrer" };
  const image = body.image ? [{ url: body.image.url, width: body.image.width, height: body.image.height, alt: body.title }] : undefined;
  return {
    title: body.title,
    description: body.description,
    // A customer's own link is in the address (`?t=`): no page it opens may be told it.
    referrer: "no-referrer",
    alternates: { canonical: body.url },
    openGraph: { type: "website", title: body.title, description: body.description, url: body.url, siteName: body.site, images: image },
    twitter: {
      card: body.image ? "summary_large_image" : "summary", title: body.title, description: body.description,
      images: body.image ? [body.image.url] : undefined,
    },
    other: body.price_amount ? { "product:price:amount": body.price_amount, "product:price:currency": "QAR" } : undefined,
  };
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  // The link may carry a token; it is never logged here and goes only to the API.
  // (Anything that cannot be a token goes to the API as one it will call invalid, so the
  // page says the link is not valid instead of failing.)
  const rawToken = one(query.t);
  const token = rawToken ? (/^[\w.-]{1,200}$/.test(rawToken) ? rawToken : "invalid") : null;
  const table = one(query.table).slice(0, 40);
  const asked = new URLSearchParams({ limit: "48" });
  if (table) asked.set("table", table);
  const { status, body } = await get<Store>(`/api/store/${encodeURIComponent(slug)}?${asked}`, token);

  // The page speaks the customer's language: their own, from their link; else the one
  // asked for in the address; else the phone's.
  const accept = (await headers()).get("accept-language") ?? "";
  const lang = body?.customer?.lang ?? (one(query.lang) === "ar" || (!one(query.lang) && /^\s*ar/i.test(accept)) ? "ar" : "en");

  return (
    <OrderPage slug={slug} token={token} table={table} initial={body} missing={status === 404} lang={lang}
      focusItem={one(query.item) || null} focusCategory={one(query.cat) || null} />
  );
}
