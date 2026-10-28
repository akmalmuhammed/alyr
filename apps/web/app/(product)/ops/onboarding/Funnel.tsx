"use client";

// The onboarding funnel (ALY-169, specs/025): how many businesses started, where they stop, how
// long each step takes, and how many needed ALYR's hand. Read from the record the onboarding
// engine keeps; counts of businesses and step names only, no customer data.

import { useEffect, useState } from "react";
import { api } from "../api";

type Funnel = {
  started: number; ready: number; live: number;
  median_hours_to_ready: number | null; median_hours_to_live: number | null;
  helped: number; helped_live: number; quiet: number;
  steps: { key: string; label: string; reached: number; share: number; median_hours: number | null }[];
  stuck_on: { key: string; label: string; count: number }[];
};

const STEPS: Record<string, string> = {
  content: "What they sell", hours: "Opening hours", test: "Test order or booking",
  price: "Plan accepted", paid: "Payment received", payments: "How customers pay", whatsapp: "WhatsApp number",
};

// "5 h" under a day, "2.5 days" over; a dash when nobody has got there yet.
function span(hours: number | null) {
  if (hours === null) return "–";
  return hours < 24 ? `${hours} h` : `${Math.round(hours / 2.4) / 10} days`;
}

export default function FunnelView() {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    api<Funnel>("/api/admin/onboarding/funnel").then((a) => { if (live && a.ok) setFunnel(a.data); });
    return () => { live = false; };
  }, []);

  if (!funnel || funnel.started === 0) return null;
  return (
    <section className="ops-funnel" aria-label="Onboarding funnel">
      <p>
        <b className="num">{funnel.started}</b> started · <b className="num">{funnel.ready}</b> ready · <b className="num">{funnel.live}</b> live
        {funnel.median_hours_to_live !== null && <> · typically live after {span(funnel.median_hours_to_live)}</>}
        {" "}· <b className="num">{funnel.helped}</b> needed ALYR’s hand
        {funnel.quiet > 0 && <> · <b className="num">{funnel.quiet}</b> quiet for a week</>}
        {" "}<button type="button" className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide steps" : "Steps"}</button>
      </p>
      {open && (
        <div className="tablewrap"><table>
          <thead><tr><th>Step</th><th className="r">Reached</th><th className="r">Typically after</th><th className="r">Not done now</th></tr></thead>
          <tbody>
            {funnel.steps.map((s) => (
              <tr key={s.key} className="norow">
                <td>{STEPS[s.key] ?? s.label}</td>
                <td className="r num">{s.reached} of {funnel.started} ({s.share}%)</td>
                <td className="r num">{span(s.median_hours)}</td>
                <td className="r num">{funnel.stuck_on.find((x) => x.key === s.key)?.count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}
