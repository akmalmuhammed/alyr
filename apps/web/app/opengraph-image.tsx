import { ImageResponse } from "next/og";

// The card shown when a link to ALYR is shared, for example in a WhatsApp chat.
// Reversed logo on Carbon, as the logo rules require on dark surfaces.

export const alt = "ALYR. Go digital without the IT team.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const VOLT = "#B7F34A";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", padding: 80, background: "#15171A", color: "#FFFFFF",
        }}
      >
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
          <div style={{ fontSize: 84, fontWeight: 600, letterSpacing: -2, lineHeight: 1.02 }}>
            Go digital.
          </div>
          <div style={{ fontSize: 84, fontWeight: 600, letterSpacing: -2, lineHeight: 1.02, color: "#A7ADB5" }}>
            Without the IT team.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 26, color: "#A7ADB5" }}>
          <div style={{ width: 28, height: 6, background: VOLT, marginRight: 18 }} />
          alyr.qa
        </div>
      </div>
    ),
    size,
  );
}
