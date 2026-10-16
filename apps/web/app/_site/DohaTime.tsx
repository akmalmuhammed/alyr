"use client";

import { useEffect, useState } from "react";

const FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Qatar",
});

/** "Doha 16:20", the one live detail on the page. The static HTML carries only the place;
 * the time is filled in after hydration and kept to the minute, in a box that does not
 * change width, so nothing moves. Western digits in both languages, as the product does. */
export function DohaTime({ label }: { label: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    let timer = 0;
    const align = window.setTimeout(() => {
      tick();
      timer = window.setInterval(tick, 60_000);
    }, 60_000 - (Date.now() % 60_000) + 50);
    return () => {
      window.clearTimeout(align);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <span className="doha">
      <span className="doha-dot" aria-hidden="true" />
      {label}{" "}
      <time className="doha-time" dir="ltr" dateTime={now ? now.toISOString() : undefined}>
        {now ? FORMAT.format(now) : ""}
      </time>
    </span>
  );
}
