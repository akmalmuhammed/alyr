"use client";

import { useState } from "react";
import { Button, Field, FormSection, Icon, Input, Modal, Radio } from "@/app/_ui";
import { T } from "./copy";
import type { Lang } from "./copy";
import { invitableRoles, validInvite } from "./logic";
import type { Me, Role } from "./logic";

export type TeamInviteDialogProps = {
  lang: Lang;
  me: Me;
  /** How many people are on the team now. */
  count: number;
  /** The invite is being sent: one press, one invite. */
  busy: boolean;
  /** The server's refusal or a failure, in words. */
  error: string | null;
  onClose: () => void;
  onSend: (input: { name: string; email: string; role: Role }) => void;
};

/** Name, email and role. Sending adds the person to the team at once and ALYR emails them how to sign in. */
export function TeamInviteDialog(props: TeamInviteDialogProps) {
  const { lang, me, count, busy, error } = props;
  const t = T[lang];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("agent");
  const [tried, setTried] = useState(false);
  const ok = validInvite(name, email);
  const allowed = invitableRoles(me);

  function send() {
    setTried(true);
    if (!ok.name || !ok.email) return;
    props.onSend({ name: name.trim(), email: email.trim().toLowerCase(), role });
  }

  return (
    <Modal
      open
      onClose={props.onClose}
      title={t.inviteTitle}
      closeLabel={t.close}
      footer={
        <>
          <Button kind="quiet" onClick={props.onClose}>{t.cancel}</Button>
          <Button kind="volt" loading={busy} loadingLabel={t.inviteSending} onClick={send}>{t.inviteSend}</Button>
        </>
      }
    >
      <div className="team-two">
        <Field label={t.fieldName} hint={t.fieldNameHint} error={tried && !ok.name ? t.errName : undefined}>
          <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" data-autofocus="" />
        </Field>
        <Field label={t.fieldEmail} hint={t.fieldEmailHint} error={tried && !ok.email ? t.errEmail : undefined}>
          <Input type="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
        </Field>
      </div>

      <FormSection label={t.fieldRole} error={error ?? undefined} help={!allowed.includes("owner") ? t.roleOwnerOnly : undefined}>
        <div className="team-radios">
          {(["agent", "admin", "owner"] as const).map((r) => (
            <Radio key={r} name="team-invite-role" value={r} checked={role === r} disabled={!allowed.includes(r) || busy} onChange={() => setRole(r)}>
              <span className="team-radio-text">
                <strong>{t.roles[r]}</strong>
                <span>{t.roleDescription[r]}</span>
              </span>
            </Radio>
          ))}
        </div>
      </FormSection>

      <div className="team-callout">
        <strong>{t.inviteCallout(count + 1)}</strong>
        <span>{t.inviteCalloutBody[role]}</span>
      </div>
      <ul className="team-points">
        <li><Icon name="mail" />{t.inviteBulletEmail}</li>
        <li><Icon name="people" />{t.inviteBulletList}</li>
      </ul>
    </Modal>
  );
}
