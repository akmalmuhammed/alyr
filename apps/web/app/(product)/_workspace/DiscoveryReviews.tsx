"use client";

// Discovery's Reviews (ALY-322, spec 065 "Screens"): the summary (how many, the average, how
// many have no reply), then the reviews newest first with their rating, place, date and text,
// filtered by place, stars and "without a reply". A review is somebody else's words from a public
// page: it is drawn as quoted text, escaped (never as markup), and nothing in it is acted on.
// Replies are not written here; an unanswered review leads to the to-do that is about it.

import Link from "next/link";
import { useState } from "react";
import { Icon } from "./CatalogUi";
import { discovery, type Finding, type Review, type ReviewsAnswer } from "./discoveryApi";
import { T, type Lang } from "./discoveryCopy";
import { averageText, placeName, reviewQuery, viewHref, type StarFilter } from "./discoveryLogic";
import { Loading, Problem, Stars, When, useLoad } from "./discoveryUi";

const STARS = ["3", "2", "1"] as const;

export function DiscoveryReviews({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [place, setPlace] = useState("");
  const [stars, setStars] = useState<StarFilter>("all");
  const [unanswered, setUnanswered] = useState(false);
  const [places] = useLoad(() => discovery.places().catch(() => []), "places");
  // The to-do that is about unanswered reviews, so a review can lead to it.
  const [open] = useLoad(() => discovery.findings(lang, { status: "open" }).catch(() => null), lang);

  const [list, reload] = useLoad<ReviewsAnswer>(
    () => discovery.reviews(lang, reviewQuery({ place, stars, unanswered })), `${lang}|${place}|${stars}|${unanswered}`,
  );
  const data = list.data;
  const filtered = place !== "" || stars !== "all" || unanswered;
  const everyPlace = places.data ?? [];
  const todoFor = (review: Review): Finding | undefined =>
    open.data?.items.find((f) => f.rule_id === "review_unanswered" && (f.location === null || f.location.id === review.location?.id));

  function clear() {
    setPlace("");
    setStars("all");
    setUnanswered(false);
  }

  if (list.error && !data) return <Problem lang={lang} error={list.error} onRetry={() => void reload()} />;
  if (!data) return <Loading lang={lang} />;

  const s = data.summary;
  return (
    <div className="dv-reviews">
      <dl className="dv-summary">
        <div><dt>{t.reviewsCount}</dt><dd className="num">{s.count}</dd></div>
        <div>
          <dt>{t.reviewsAverage}</dt>
          <dd className="num">{s.average === null ? <span className="dv-none">{t.noRatings}</span> : <><bdi>{averageText(s.average)}</bdi> <small>{t.outOfFive}</small></>}</dd>
        </div>
        <div><dt>{t.reviewsUnanswered}</dt><dd className="num">{s.unanswered}</dd></div>
      </dl>

      <div className="dv-filters">
        {everyPlace.length > 1 && (
          <label className="ct-field">
            <span className="ct-label">{t.placeLabel}</span>
            <select className="ct-select" value={place} onChange={(e) => setPlace(e.target.value)}>
              <option value="">{t.allPlaces}</option>
              {everyPlace.map((p) => <option key={p.id} value={p.id}>{placeName(p, lang)}</option>)}
            </select>
          </label>
        )}
        <label className="ct-field">
          <span className="ct-label">{t.starsLabel}</span>
          <select className="ct-select" value={stars} onChange={(e) => setStars(e.target.value as StarFilter)}>
            <option value="all">{t.starsAny}</option>
            {STARS.map((n) => <option key={n} value={n}>{t.stars[n]}</option>)}
          </select>
        </label>
        <div className="ct-chips" role="group" aria-label={t.reviewsUnanswered}>
          <button type="button" className="ct-chip" aria-pressed={unanswered} onClick={() => setUnanswered(!unanswered)}>
            {unanswered && <Icon name="check" className="sh-ico ct-chip-tick" />}{t.onlyUnanswered}
          </button>
        </div>
      </div>

      {data.items.length === 0 ? (
        filtered ? (
          <div className="empty-note ct-none"><p>{t.reviewsNone}</p><button type="button" className="btn small" onClick={clear}>{t.clearFilters}</button></div>
        ) : (
          <p className="dv-slot dv-slot-wide"><span className="dv-pending" aria-hidden="true" />{t.reviewsEmpty}</p>
        )
      ) : (
        <ul className="dv-reviewlist">
          {data.items.map((r) => {
            const todo = r.replied ? undefined : todoFor(r);
            return (
              <li key={r.id} className="dv-review">
                <div className="dv-review-top">
                  <Stars rating={r.rating} lang={lang} />
                  <span className="dv-review-place">{r.location?.name ?? t.wholeBusiness}</span>
                  <span className="ct-quiet dv-review-date"><When iso={r.posted_at} lang={lang} day /></span>
                </div>
                {/* Somebody else's words: text only, in its own language and direction. */}
                <blockquote className="dv-quote" lang={r.language || undefined} dir="auto">
                  <p>{r.body}</p>
                  {r.author_name && <footer><cite dir="auto">{r.author_name}</cite></footer>}
                </blockquote>
                <div className="dv-review-foot">
                  <span className={`sh-pill dv-pill ${r.replied ? "active" : "wait"}`}>{r.replied ? t.replied : t.noReply}</span>
                  {todo && <Link className="dv-link" href={viewHref("todo", { finding: todo.id })}>{t.seeTodo}</Link>}
                </div>
                {r.replied && r.reply_text && (
                  <div className="dv-reply">
                    <p className="dv-reply-label">{t.theReply}</p>
                    <blockquote className="dv-quote" dir="auto"><p>{r.reply_text}</p></blockquote>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
