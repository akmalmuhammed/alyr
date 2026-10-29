// The bakery sales demo (ALY-263, docs/sales/demo-bakery.md): the founder's 15-minute visit
// to a bakery, on his laptop. Not in search (the product layout says noindex, and this page
// says it again) and not linked from the public site. It is drawn in the browser only
// (DemoClient), since every screen depends on the visit: the bakery's name, its colour, the
// owner's numbers and taps.

import type { Metadata } from "next";
import DemoClient from "./DemoClient";

export const metadata: Metadata = {
  title: "ALYR · The Thursday before Eid",
  robots: { index: false, follow: false, nocache: true },
};

// Light by default, as a shop is lit: set before the first paint, whatever the laptop's own
// setting; the founder's choice of dark (D) is kept under its own key.
const LIGHT =
  "(function(){try{var t=localStorage.getItem('alyr-demo-theme');" +
  "document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')}catch(e){" +
  "document.documentElement.setAttribute('data-theme','light')}})()";

export default function DemoBakeryPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: LIGHT }} />
      <DemoClient />
    </>
  );
}
