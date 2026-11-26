// The live miniatures on the Set up cards (the approved prototype, round 4): a small piece of the
// kind of page each kind of business runs, drawn in HTML with a fictional shop's words. They are
// pictures (aria-hidden, not focusable); the page says once that the drawings show fictional shops.
// Prices go through the product's money helper («QAR 3», «3 ر.ق»). No WhatsApp green on a shop's
// surface: the chat button is Carbon.

import { money } from "../../../_ui/format";
import { T2 } from "./copy2";
import type { D2Lang } from "./copy";
import { Ic } from "./icons";
import { Ltr } from "./parts";
import { Val } from "./frame";

export function FamilyMiniature({ id, lang }: { id: string; lang: D2Lang }) {
  const m = T2[lang].mini;
  const qar = (riyals: number) => <Ltr>{money(riyals * 100, lang)}</Ltr>;
  switch (id) {
    case "food":
      return (
        <span className="d2s-mui">
          <span className="d2s-mh"><b>{m.menu}</b><span className="d2s-op">{m.openUntil}</span></span>
          <span className="d2s-mrow"><span>{m.karak}</span><span className="d2s-p">{qar(3)}</span><span className="d2s-q">2</span></span>
          <span className="d2s-mrow"><span>{m.manakish}</span><span className="d2s-p">{qar(9)}</span><span className="d2s-q">1</span></span>
          <span className="d2s-mrow"><span>{m.fatayer}</span><span className="d2s-p">{qar(12)}</span><span className="d2s-q d2s-q-add">+</span></span>
          <span className="d2s-mf"><span>{m.items} · {qar(15)}</span><span className="d2s-ob">{m.order}</span></span>
        </span>
      );
    case "appointments":
      return (
        <span className="d2s-mui">
          <span className="d2s-mh"><b>{m.wash}</b><span>{m.washMeta} · {qar(60)}</span></span>
          <span className="d2s-lab">{m.fri}</span>
          <span className="d2s-segc"><span className="d2s-off">13:00</span><span className="d2s-on">14:00</span><span>15:00</span><span>16:00</span></span>
          <span className="d2s-mf"><span>{m.fri} · <Ltr>14:00</Ltr></span><span className="d2s-ob">{m.book}</span></span>
        </span>
      );
    case "home_services":
      return (
        <span className="d2s-mui">
          <span className="d2s-mh"><b>{m.areas}</b><span>{m.areasN}</span></span>
          <span className="d2s-ac">{[m.westBay, m.sadd, m.lusail, m.pearl, m.waab].map((a) => <span key={a}>{a}</span>)}<span className="d2s-more">+1</span></span>
          <span className="d2s-hrs"><span className="d2s-ci"><Ic name="phone" size="xs" /></span><span><b>{m.callouts}</b><Val text={m.calloutHours} /></span><span className="d2s-okp">{m.open}</span></span>
        </span>
      );
    case "retail":
      return (
        <span className="d2s-mui d2s-shelf">
          <span className="d2s-ptile"><i className="d2s-sw1" /><b>{m.crepe}</b><span className="d2s-tag">{qar(420)}</span></span>
          <span className="d2s-ptile"><i className="d2s-sw2" /><b>{m.linen}</b><span className="d2s-tag">{qar(380)}</span></span>
          <span className="d2s-ptile"><i className="d2s-sw3" /><b>{m.shayla}</b><span className="d2s-tag d2s-low">{m.left}</span></span>
        </span>
      );
    case "stays_schools":
      return (
        <span className="d2s-mui">
          <span className="d2s-drange"><span><span className="d2s-lab">{m.checkIn}</span><b>{m.inDay}</b></span><Ic name="arrow" size="xs" flip /><span><span className="d2s-lab">{m.checkOut}</span><b>{m.outDay}</b></span></span>
          <span className="d2s-cal">
            {m.week.map((d, i) => <span key={`w${i}`} className="d2s-dw">{d}</span>)}
            <span className="d2s-cx">17</span><span className="d2s-cs">18</span><span className="d2s-cin">19</span><span className="d2s-cin">20</span><span className="d2s-ce">21</span><span>22</span><span>23</span>
          </span>
          <span className="d2s-ob d2s-ob-full">{m.enquiry}</span>
        </span>
      );
    case "online_only":
      return (
        <span className="d2s-mui d2s-bio">
          <span className="d2s-avt" aria-hidden="true"><Ic name="person" size="sm" /></span>
          <b className="d2s-nm">{m.shop}</b><small>{m.shopSub}</small>
          <span className="d2s-lk d2s-lk-chat"><Ic name="chat" size="xs" />{m.chat}</span>
          <span className="d2s-lk">{m.cake}</span>
        </span>
      );
    default:
      return null;
  }
}
