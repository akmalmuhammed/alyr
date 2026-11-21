"use client";

// Discovery for one business, recorded by ALYR staff (D-169): `/ops/discovery?business=<id>`, reached
// from the business's row under Clients. The id is checked for its shape before it goes into an address.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OpsDiscovery } from "../Discovery";
import { T } from "../discoveryOpsCopy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Which() {
  const business = useSearchParams().get("business") ?? "";
  return UUID.test(business) ? <OpsDiscovery businessId={business} /> : <p role="alert">{T.pickBusiness}</p>;
}

export default function DiscoveryPage() {
  return <Suspense fallback={null}><Which /></Suspense>;
}
