"use client";

import { Avatar, ConfirmDialog, Icon, KV, KVList, Section } from "@/app/_ui";
import { T } from "./copy";
import type { Lang } from "./copy";
import type { Member } from "./logic";

export type TeamRemoveDialogProps = {
  lang: Lang;
  person: Member;
  /** From the seven-day report: what the person has open and what they handled. Null when it has not loaded. */
  impact: { conversations: number; orders: number } | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * What removing a person does, from the product's own rules: their sign-in ends at once and their open
 * conversations go back to nobody (core/auth.py remove_member). Orders keep their record and the report
 * counts them under Nobody yet. Shifts and calendars are not built, so they are not mentioned.
 */
export function TeamRemoveDialog({ lang, person, impact, busy, error, onCancel, onConfirm }: TeamRemoveDialogProps) {
  const t = T[lang];
  return (
    <ConfirmDialog
      open
      destructive
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title={t.removeTitle(person.name)}
      closeLabel={t.close}
      confirmLabel={busy ? t.removeBusy : t.removeConfirm}
      cancelLabel={t.removeKeep(person.name)}
    >
      <div className="team-person-box">
        <Avatar name={person.name} size={36} />
        <div className="team-who-text">
          <span className="team-name"><bdi>{person.name}</bdi></span>
          <span className="team-sub">{t.roles[person.role]} · <bdi dir="ltr" className="u-mono">{person.email}</bdi></span>
        </div>
      </div>
      <Section label={t.removeWhat} level={3}>
        <KVList>
          <KV k={t.removeSignIn}>{t.removeSignInResult}</KV>
          <KV k={t.removeConversations}>{impact ? t.removeConversationsResult(impact.conversations) : t.removeConversationsUnknown}</KV>
          {impact ? <KV k={t.removeOrders}>{t.removeOrdersResult(impact.orders)}</KV> : null}
        </KVList>
      </Section>
      <ul className="team-points"><li><Icon name="refresh" />{t.removeAgain(person.name)}</li></ul>
      {error ? <p className="u-field-error" role="alert">{error}</p> : null}
    </ConfirmDialog>
  );
}
