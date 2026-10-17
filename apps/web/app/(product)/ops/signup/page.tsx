"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Pricing } from "../api";
import { SignUpSettings } from "../PriceList";

export default function SignUpPage() {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const load = useCallback(async () => {
    const answer = await api<Pricing>("/api/admin/pricing");
    if (answer.ok) setPricing(answer.data);
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);
  return pricing ? <SignUpSettings pricing={pricing} reload={load} /> : <p className="sh-note">Loading…</p>;
}
