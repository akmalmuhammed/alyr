import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { copy } from "./_site/copy";

// The card shown when a link to ALYR is shared, for example in a WhatsApp chat.
// Reversed logo on Carbon, as the logo rules require on dark surfaces. The words are the
// homepage's own (copy.ts), in English: one card serves both languages. An Arabic card was
// tried on 17 Oct with IBM Plex Sans Arabic from the design system: the renderer (next/og)
// loads the font and joins the letters, but does not order Arabic words right to left and
// measures each word as if its letters stood alone, so the gaps between words come out
// uneven. Not good enough to send. The two fonts are the design system's own files, copied from
// the branch codex/alyr-native-foundation (asset-continuity-web/public/alyr/fonts), both
// under the SIL Open Font Licence. They are read at build time and never sent to browsers.

const fonts = join(process.cwd(), "app/_site/fonts");
const instrument = await readFile(join(fonts, "InstrumentSans-SemiBold.ttf"));
const plexMono = await readFile(join(fonts, "IBMPlexMono-Regular.ttf"));

const t = copy.en.home.hero;
// The headline's no-break spaces are for narrow phones; here they would only widen gaps.
const title = t.title.map((line) => line.replace(/ /g, " "));

export const alt = `ALYR. ${title.join(" ")}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const VOLT = "#B7F34A";
const CONCRETE = "#A7ADB5";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", padding: 80, background: "#15171A", color: "#FFFFFF",
          position: "relative",
        }}
      >
        {/* the 45° cut corner the homepage uses on its figures and its button */}
        <svg width="120" height="120" viewBox="0 0 120 120" style={{ position: "absolute", top: 0, right: 0 }}>
          <polygon fill={VOLT} points="0,0 120,0 120,120" />
        </svg>
        <svg width="400" height="64" viewBox="20 30 1000 160">
          <g transform="translate(20 30)">
            <polygon fill="#FFFFFF" points="50,0 180,0 130,62 0,62" />
            <polygon fill="#FFFFFF" points="0,72 126,72 39,160" />
            <polygon fill={VOLT} points="134,72 190,72 142,160 46,160" />
          </g>
          <g transform="translate(300 35)" fill="#FFFFFF">
            <polygon points="0,150 69,10 92,10 28,150" />
            <polygon points="76,37 92,10 164,150 134,150" />
            <polygon points="190,10 216,10 216,124 326,124 326,150 190,150" />
            <polygon points="348,10 379,10 433,80 414,107" />
            <polygon points="478,10 511,10 421,150 389,150" />
            <path fillRule="evenodd" d="M540 10H672L702 40V84L672 114H569V150H540ZM569 36V88H661L674 75V49L661 36Z" />
            <polygon points="620,88 655,88 706,150 671,150" />
          </g>
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 22, color: CONCRETE, letterSpacing: 2, textTransform: "uppercase", marginBottom: 30 }}>
            {t.eyebrow}
          </div>
          {title.map((line, index) => (
            <div key={line} style={{ fontFamily: "Instrument Sans", fontSize: 88, fontWeight: 600, letterSpacing: -3, lineHeight: 1.02, color: index ? CONCRETE : "#FFFFFF" }}>
              {line}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "Instrument Sans", fontSize: 26, color: CONCRETE }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 28, height: 6, background: VOLT, marginRight: 18 }} />
            alyr.qa
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 22 }}>
            {t.facts.flatMap((fact, index) => (index ? [<span key={`s${index}`} style={{ color: "#5F666D" }}>·</span>, <span key={fact}>{fact}</span>] : [<span key={fact}>{fact}</span>]))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Instrument Sans", data: instrument, style: "normal", weight: 600 },
        { name: "IBM Plex Mono", data: plexMono, style: "normal", weight: 400 },
      ],
    },
  );
}
