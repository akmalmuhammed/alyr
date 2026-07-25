import { useId } from "react";
import {
  Heart,
  LockKey,
  Plus,
  ShieldCheck,
  Trash,
  User,
} from "@phosphor-icons/react";
import { createBlankMemoryPersonEntry } from "./memoryContinuity.js";
import "./memoryPeople.css";

const RELATIONSHIP_OPTIONS = [
  ["shared-memory", "Shared memory"],
  ["owned-by", "Owned by"],
  ["made-by", "Made by"],
  ["given-by", "Given by"],
  ["inherited-from", "Inherited from"],
  ["photographed-with", "Photographed with"],
  ["other", "Other connection"],
];

function canShare(entry) {
  return (
    entry.livingStatus === "deceased" ||
    (entry.livingStatus === "living" &&
      entry.consentState === "granted")
  );
}

export function MemoryPeopleEditor({
  entries,
  onChange,
  knownPeople = [],
  requiresPrimaryPerson = false,
}) {
  const editorId = useId();

  function updateEntry(entryId, field, value) {
    onChange(
      entries.map((entry) => {
        if (entry.entryId !== entryId) return entry;
        const next = { ...entry, [field]: value };
        if (field === "livingStatus") {
          next.consentState =
            value === "deceased" ? "not-applicable" : "not-requested";
          next.showInShowcase = false;
        }
        if (
          field === "consentState" &&
          value !== "granted" &&
          entry.livingStatus === "living"
        ) {
          next.showInShowcase = false;
        }
        return next;
      }),
    );
  }

  function removeEntry(entryId) {
    onChange(entries.filter((entry) => entry.entryId !== entryId));
  }

  function chooseKnownPerson(entryId, personId) {
    const person = knownPeople.find((item) => item.id === personId);
    onChange(
      entries.map((entry) => {
        if (entry.entryId !== entryId) return entry;
        if (!person) {
          return {
            ...entry,
            personId: null,
            displayName: "",
            relationship: "",
            livingStatus: "unknown",
            consentState: "not-requested",
            showInShowcase: false,
            publicLabel: "",
          };
        }
        return {
          ...entry,
          personId: person.id,
          displayName: person.displayName,
          relationship: person.relationship || "",
          livingStatus: person.livingStatus,
          consentState: person.consentState,
          showInShowcase: false,
          publicLabel: person.publicLabel || "",
        };
      }),
    );
  }

  return (
    <section className="memory-people-editor" aria-labelledby={`${editorId}-title`}>
      <header>
        <div>
          <span className="eyebrow">
            {requiresPrimaryPerson
              ? "Primary person"
              : "People inside the memory"}
          </span>
          <h3 id={`${editorId}-title`}>
            {requiresPrimaryPerson
              ? "Add the person this memory is about"
              : "Keep the relationship, not just a name"}
          </h3>
          <p>
            {requiresPrimaryPerson
              ? "The first person is the primary person for this private record. You can add other people who belong in the memory."
              : "People remain private by default. Living people need explicit permission before even a public label can enter a safe showcase."}
          </p>
        </div>
        <Heart weight="duotone" aria-hidden="true" />
      </header>

      {entries.length ? (
        <div className="memory-person-editor-list">
          {entries.map((entry, index) => {
            const prefix = `${editorId}-person-${index}`;
            const shareAllowed = canShare(entry);
            return (
              <article className="memory-person-editor-card" key={entry.entryId}>
                <div className="memory-person-editor-number" aria-hidden="true">
                  <User weight="duotone" />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="memory-person-editor-fields">
                  {knownPeople.length > 0 && (
                    <label className="memory-known-person-select">
                      <span>Use an existing person record</span>
                      <select
                        value={entry.personId || ""}
                        onChange={(event) =>
                          chooseKnownPerson(
                            entry.entryId,
                            event.target.value,
                          )
                        }
                        aria-label={`Person ${index + 1} existing record`}
                      >
                        <option value="">Create a new person</option>
                        {knownPeople.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.displayName}
                            {person.relationship
                              ? ` · ${person.relationship}`
                              : person.livingStatus
                                ? ` · ${person.livingStatus}`
                                : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="memory-person-editor-grid">
                    <label>
                      <span>Name</span>
                      <input
                        list={`${editorId}-known-people`}
                        value={entry.displayName}
                        onChange={(event) =>
                          updateEntry(
                            entry.entryId,
                            "displayName",
                            event.target.value,
                          )
                        }
                        placeholder="e.g. Mariam"
                        aria-label={`Person ${index + 1} name`}
                      />
                    </label>
                    <label>
                      <span>Relationship to you</span>
                      <input
                        value={entry.relationship}
                        onChange={(event) =>
                          updateEntry(
                            entry.entryId,
                            "relationship",
                            event.target.value,
                          )
                        }
                        placeholder="e.g. Grandmother"
                        aria-label={`Person ${index + 1} relationship to you`}
                      />
                    </label>
                  </div>

                  <div className="memory-person-editor-grid is-three">
                    <label>
                      <span>Connection to this memory</span>
                      <select
                        value={entry.relationshipType}
                        onChange={(event) =>
                          updateEntry(
                            entry.entryId,
                            "relationshipType",
                            event.target.value,
                          )
                        }
                        aria-label={`Person ${index + 1} connection to this memory`}
                      >
                        {RELATIONSHIP_OPTIONS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Living status</span>
                      <select
                        value={entry.livingStatus}
                        onChange={(event) =>
                          updateEntry(
                            entry.entryId,
                            "livingStatus",
                            event.target.value,
                          )
                        }
                        aria-label={`Person ${index + 1} living status`}
                      >
                        <option value="unknown">Not recorded</option>
                        <option value="living">Living</option>
                        <option value="deceased">Deceased</option>
                      </select>
                    </label>
                    <label>
                      <span>Permission</span>
                      {entry.livingStatus === "living" ? (
                        <select
                          value={entry.consentState}
                          onChange={(event) =>
                            updateEntry(
                              entry.entryId,
                              "consentState",
                              event.target.value,
                            )
                          }
                          aria-label={`Person ${index + 1} permission`}
                        >
                          <option value="not-requested">Keep private</option>
                          <option value="granted">Permission granted</option>
                          <option value="declined">Permission declined</option>
                        </select>
                      ) : (
                        <span className="memory-person-private-state">
                          <LockKey weight="bold" />
                          {entry.livingStatus === "deceased"
                            ? "Private unless chosen"
                            : "Private until known"}
                        </span>
                      )}
                    </label>
                  </div>

                  <label>
                    <span>What connects them to it?</span>
                    <textarea
                      rows="2"
                      value={entry.memorySummary}
                      onChange={(event) =>
                        updateEntry(
                          entry.entryId,
                          "memorySummary",
                          event.target.value,
                        )
                      }
                      placeholder="A short private note about the person, object, or moment"
                      aria-label={`Person ${index + 1} private memory note`}
                    />
                  </label>

                  <div className="memory-person-sharing-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={entry.showInShowcase === true}
                        disabled={!shareAllowed}
                        onChange={(event) =>
                          updateEntry(
                            entry.entryId,
                            "showInShowcase",
                            event.target.checked,
                          )
                        }
                      />
                      <span>
                        <strong>Allow a public label in safe showcases</strong>
                        <small>
                          Exact relationships and private notes still stay
                          outside.
                        </small>
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.entryId)}
                      aria-label={`Remove ${entry.displayName || `person ${index + 1}`}`}
                    >
                      <Trash /> Remove
                    </button>
                  </div>
                  {entry.showInShowcase === true && shareAllowed && (
                    <label className="memory-person-public-label">
                      <span>Deliberate public label</span>
                      <input
                        value={entry.publicLabel}
                        onChange={(event) =>
                          updateEntry(
                            entry.entryId,
                            "publicLabel",
                            event.target.value,
                          )
                        }
                        placeholder="e.g. Grandmother Mariam"
                        aria-label={`Person ${index + 1} public label`}
                      />
                      <small>
                        This exact label may appear in a future safe showcase.
                        The private name is never used as a fallback.
                      </small>
                    </label>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="memory-people-empty">
          <ShieldCheck weight="duotone" />
          <div>
            <strong>
              {requiresPrimaryPerson
                ? "A primary person is required"
                : "No people linked yet"}
            </strong>
            <p>
              {requiresPrimaryPerson
                ? "Add or choose at least one person before continuing."
                : "The memory can still be saved. Add someone only when the relationship helps the next person understand it."}
            </p>
          </div>
        </div>
      )}

      <datalist id={`${editorId}-known-people`}>
        {knownPeople.map((person) => (
          <option key={person.id} value={person.displayName} />
        ))}
      </datalist>

      <button
        type="button"
        className="memory-add-person-button"
        onClick={() => onChange([...entries, createBlankMemoryPersonEntry()])}
      >
        <Plus weight="bold" />{" "}
        {requiresPrimaryPerson && entries.length === 0
          ? "Add primary person"
          : "Add a person"}
      </button>
    </section>
  );
}
