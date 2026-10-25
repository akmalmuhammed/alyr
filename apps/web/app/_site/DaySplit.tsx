import { Icon } from "./brand";
import type { BusinessRow, Copy } from "./copy";
import { FoldSplit } from "./FoldSplit";
import { SampleMark } from "./Frames";
import "./room.css";

// One business's afternoon split by the fold (ALY-209): the owner's chats today on faded
// paper, and the same customers as ALYR keeps them on Carbon, marked "Sample" once. Drawn on
// the homepage's business tabs and on each sector page (ALY-232), from the same rows.

export type SplitWords = Copy["home"]["business"]["split"];
type Day = Pick<BusinessRow, "chats" | "orders">;

/** The fold over one afternoon: the drawings are pictures (aria-hidden in FoldSplit); the
 * lists beside them say the same in words. */
export function DaySplit({ row, words, sample }: { row: Day; words: SplitWords; sample: string }) {
  return (
    <FoldSplit
      label={words.label}
      today={words.today}
      with={words.with}
      slider={words.slider}
      value={words.value}
      before={<DayChats row={row} words={words} />}
      after={<DayOrders row={row} words={words} sample={sample} />}
    />
  );
}

/** The owner's chats this afternoon, as WhatsApp lists them: voice notes, photos, "is it
 * ready??", each unread. The header counts them all; FoldSplit climbs to it once. */
function DayChats({ row, words }: { row: Day; words: SplitWords }) {
  const unread = row.chats.reduce((sum, chat) => sum + chat.n, 0);
  return (
    <div className="dc">
      <div className="dc-top">
        <b>{words.chats}</b>
        <span className="dc-unread"><bdi data-unread={unread}>{unread}</bdi> {words.unread}</span>
      </div>
      <ul>
        {row.chats.map((chat) => (
          <li key={chat.who} className="dc-row">
            <span className="dc-av">{chat.who.slice(0, 1)}</span>
            <span className="dc-main">
              <b>{chat.who}</b>
              <span className="dc-prev">
                {chat.kind !== "text" && <Icon name={chat.kind === "voice" ? "mic" : "camera"} />}
                <span dir="auto">{chat.text}</span>
              </span>
            </span>
            <span className="dc-side">
              <span className="dc-at">{chat.at}</span>
              <span className="dc-n">{chat.n}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The same customers, row for row, as ALYR keeps them: a reference, what it is, who on the
 * team has it, and where it stands. */
function DayOrders({ row, words, sample }: { row: Day; words: SplitWords; sample: string }) {
  return (
    <div className="do">
      <div className="do-top">
        <b>{words.orders}</b>
        <SampleMark label={sample} />
        <span className="do-count"><bdi>{row.orders.length}</bdi></span>
      </div>
      <ul>
        {row.orders.map((order) => (
          <li key={order.who + order.ref} className="do-row">
            <span className="do-ref"><bdi>{order.ref}</bdi></span>
            <span className="do-main">
              <b>{order.who}</b>
              <span>{order.what}</span>
            </span>
            <span className="do-by"><i>{order.by.slice(0, 1)}</i><span>{order.by}</span></span>
            <span className={`do-st is-${order.tone}`}>{order.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

