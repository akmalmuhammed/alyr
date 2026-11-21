"use client";

// The redesigned Orders screen on the shop's real orders. `?show=`, `?open=` and the filters the
// screen writes are the address; the screen keeps it in step as filters change.

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { OrdersView } from "../../orders/OrdersView";
import { filtersToQuery, queryToFilters, type OrderFilters } from "../../orders/logic";
import type { SectionProps } from "../../sectionRegistry";

export default function OrdersV2Section({ ws }: SectionProps) {
  const search = useSearchParams();
  const [initial] = useState<OrderFilters>(() => {
    const params: Record<string, string | undefined> = {};
    search.forEach((value, key) => { params[key] = value; });
    return queryToFilters(params);
  });
  const ui = search.get("ui");
  const { router, state } = ws;

  const onNavigate = useCallback((filters: OrderFilters) => {
    const query = filtersToQuery(filters);
    if (ui) query.set("ui", ui);
    const text = query.toString();
    router.replace(text ? `/app/orders?${text}` : "/app/orders", { scroll: false });
  }, [router, ui]);

  return <OrdersView live lang={ws.lang} role={state.me.role} initialFilters={initial} onNavigate={onNavigate} />;
}
