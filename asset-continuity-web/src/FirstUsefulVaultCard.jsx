import {
  ArrowRight,
  Check,
  Cube,
  FileText,
  IdentificationCard,
  MagnifyingGlass,
  MapPin,
  Sparkle,
} from "@phosphor-icons/react";

const ICONS = {
  place: MapPin,
  records: Cube,
  passport: IdentificationCard,
  proof: FileText,
  retrieval: MagnifyingGlass,
};

function actionLabel(step) {
  if (!step) return "Continue setup";
  return {
    place: "Add your first place",
    records: "Add another item",
    passport: "Complete a passport",
    proof: "Add supporting material",
    retrieval: "Try Search",
  }[step.id];
}

export default function FirstUsefulVaultCard({
  progress,
  onAction,
}) {
  if (!progress || progress.complete) return null;
  const nextStep = progress.nextStep;

  return (
    <section
      className="first-vault-card"
      aria-labelledby="first-vault-title"
    >
      <header>
        <span className="first-vault-mark" aria-hidden="true">
          <Sparkle weight="fill" />
        </span>
        <div>
          <span className="eyebrow">Guided start</span>
          <h2 id="first-vault-title">Build your first useful vault</h2>
          <p>
            Five small outcomes make this more than a list: something placed,
            documented, and easy to retrieve.
          </p>
        </div>
        <strong aria-label={`${progress.percent}% complete`}>
          {progress.completedCount}
          <small>/{progress.totalCount}</small>
        </strong>
      </header>

      <div className="first-vault-progress" aria-hidden="true">
        <span style={{ width: `${progress.percent}%` }} />
      </div>

      <ol>
        {progress.steps.map((step) => {
          const Icon = ICONS[step.id] || Cube;
          return (
            <li
              key={step.id}
              className={
                step.complete
                  ? "is-complete"
                  : step.id === nextStep.id
                    ? "is-next"
                    : ""
              }
            >
              <span aria-hidden="true">
                {step.complete ? (
                  <Check weight="bold" />
                ) : (
                  <Icon weight="duotone" />
                )}
              </span>
              <div>
                <strong>{step.label}</strong>
                <small>
                  {step.target > 1
                    ? `${step.current} of ${step.target}`
                    : step.complete
                      ? "Done"
                      : step.copy}
                </small>
              </div>
            </li>
          );
        })}
      </ol>

      <button type="button" onClick={() => onAction(nextStep.action)}>
        <span>
          <small>Next best step</small>
          <strong>{actionLabel(nextStep)}</strong>
        </span>
        <ArrowRight weight="bold" aria-hidden="true" />
      </button>
    </section>
  );
}
