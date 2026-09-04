import { useId } from "react";

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function formatMinorUnits(amountMinor) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return null;

  const whole = Math.floor(amountMinor / 100);
  const fraction = amountMinor % 100;
  const groupedWhole = String(whole).replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  const fractionalPart =
    fraction === 0 ? "" : `.${String(fraction).padStart(2, "0")}`;

  return `${groupedWhole}${fractionalPart}`;
}

/**
 * Formats an integer minor-unit value without converting currencies or relying
 * on a runtime locale. The portfolio selector supplies non-negative safe
 * integers; invalid and overflowing totals deliberately remain unavailable.
 */
export function formatPortfolioAmount(currency, amountMinor) {
  if (
    typeof currency !== "string" ||
    !/^[A-Z]{3}$/u.test(currency) ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0
  ) {
    return null;
  }

  return `${currency} ${formatMinorUnits(amountMinor)}`;
}

export default function PortfolioValueSummary({ summary }) {
  const titleId = useId();
  const noteId = useId();
  const activeAssetCount = normalizeCount(summary?.activeAssetCount);
  const valuedAssetCount = normalizeCount(summary?.valuedAssetCount);
  const unvaluedAssetCount = normalizeCount(summary?.unvaluedAssetCount);
  const currencyTotals = Array.isArray(summary?.currencyTotals)
    ? summary.currencyTotals
    : [];

  return (
    <section
      className="portfolio-value-summary"
      aria-labelledby={titleId}
      aria-describedby={noteId}
    >
      <header className="portfolio-value-summary__header">
        <div className="portfolio-value-summary__heading">
          <p className="portfolio-value-summary__eyebrow">Portfolio</p>
          <h2 id={titleId}>Known asset value</h2>
        </div>
        <p className="portfolio-value-summary__scope">
          {countLabel(activeAssetCount, "active asset")}
        </p>
      </header>

      {activeAssetCount === 0 ? (
        <div className="portfolio-value-summary__empty" role="status">
          <strong>No active assets yet</strong>
          <span>Add an asset to start recording known value.</span>
        </div>
      ) : currencyTotals.length === 0 ? (
        <div className="portfolio-value-summary__empty" role="status">
          <strong>No values recorded yet</strong>
          <span>
            Add an estimate to any asset when you are ready. Value is optional.
          </span>
        </div>
      ) : (
        <ul
          className="portfolio-value-summary__totals"
          aria-label="Recorded currency totals"
        >
          {currencyTotals.map((total, index) => {
            const currency =
              typeof total?.currency === "string"
                ? total.currency.toUpperCase()
                : "Currency";
            const formattedAmount = formatPortfolioAmount(
              currency,
              total?.amountMinor,
            );
            const assetCount = normalizeCount(total?.assetCount);
            const rowKey = `${currency}-${index}`;

            return (
              <li
                className="portfolio-value-summary__total"
                key={rowKey}
              >
                <div className="portfolio-value-summary__amount">
                  <span>{currency}</span>
                  <strong>
                    {formattedAmount === null
                      ? "Total unavailable"
                      : formatMinorUnits(total?.amountMinor)}
                  </strong>
                </div>
                <span className="portfolio-value-summary__total-count">
                  {countLabel(assetCount, "valued asset")}
                </span>
                {formattedAmount === null ? (
                  <span className="portfolio-value-summary__warning">
                    Recorded values exceed the supported total range.
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <dl className="portfolio-value-summary__counts">
        <div>
          <dt>Valued</dt>
          <dd>{valuedAssetCount}</dd>
        </div>
        <div>
          <dt>Value not recorded</dt>
          <dd>{unvaluedAssetCount}</dd>
        </div>
      </dl>

      <p className="portfolio-value-summary__note" id={noteId}>
        User supplied · no currency conversion · liabilities not included
      </p>
    </section>
  );
}
