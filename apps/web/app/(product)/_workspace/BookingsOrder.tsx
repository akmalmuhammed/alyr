"use client";

// Up and down buttons for a list in an order the owner chooses (ALY-259, D-143): the people and
// chairs (the day view's columns, and who "anyone" takes first) and the services (the booking
// page's list). 44 px each, named for the item they move, disabled at the ends. The words are
// the caller's, from `bookingsCopy.ts`.

export function OrderButtons({ up, down, first, last, onUp, onDown }: {
  up: string; down: string; first: boolean; last: boolean; onUp: () => void; onDown: () => void;
}) {
  return (
    <span className="bk-order">
      <button type="button" className="btn small bk-iconbtn" aria-label={up} disabled={first} onClick={onUp}>
        <svg className="bk-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15l7-7 7 7" /></svg>
      </button>
      <button type="button" className="btn small bk-iconbtn" aria-label={down} disabled={last} onClick={onDown}>
        <svg className="bk-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9l7 7 7-7" /></svg>
      </button>
    </span>
  );
}
