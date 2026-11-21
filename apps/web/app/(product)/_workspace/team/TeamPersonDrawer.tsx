"use client";

import { useState } from "react";
import { Avatar, Button, Drawer, FormSection, KV, KVList, Radio, Section, Tag } from "@/app/_ui";
import { T } from "./copy";
import type { Lang } from "./copy";
import { ROLES, removeRefusal, roleChangeRefusal } from "./logic";
import type { Me, Member, Role, WorkRow } from "./logic";

export type TeamPersonDrawerProps = {
  lang: Lang;
  me: Me;
  members: Member[];
  person: Member;
  /** The person's own row of the seven-day report, when it has loaded. Nothing is drawn for it otherwise. */
  work: WorkRow | null;
  /** The role is being saved. */
  saving: boolean;
  /** A refusal or failure from the last try, in words. */
  error: string | null;
  readOnly: boolean;
  onClose: () => void;
  onSave: (role: Role) => void;
  onRemove: () => void;
  onOpenWeek: () => void;
};

/** One person: their role (changed here or in the list), their own work, and the way to remove them. */
export function TeamPersonDrawer(props: TeamPersonDrawerProps) {
  const { lang, me, members, person, work, saving, error, readOnly } = props;
  const t = T[lang];
  const manage = me.role !== "agent";
  const [role, setRole] = useState<Role>(person.role);
  const removeWhy = removeRefusal(me, members, person);

  return (
    <Drawer
      open
      onClose={props.onClose}
      title={<bdi>{person.name}</bdi>}
      headerExtra={<Tag dot={false}>{t.roles[person.role]}</Tag>}
      closeLabel={t.close}
      footer={manage ? (
        <>
          <Button kind="bad" className="team-footer-gap" disabled={removeWhy !== null || readOnly} onClick={props.onRemove}>{t.removePerson}</Button>
          <Button kind="quiet" onClick={props.onClose}>{t.cancel}</Button>
          <Button kind="volt" disabled={readOnly} loading={saving} loadingLabel={t.saving} onClick={() => props.onSave(role)}>{t.save}</Button>
        </>
      ) : undefined}
    >
      <div className="team-person-box">
        <Avatar name={person.name} size={44} tone={person.id === me.id ? "ink" : "subtle"} />
        <div className="team-who-text">
          <span className="team-name"><bdi>{person.name}</bdi>{person.id === me.id ? <Tag dot={false}>{t.you}</Tag> : null}</span>
          <bdi className="team-email u-mono" dir="ltr">{person.email}</bdi>
        </div>
      </div>

      {manage ? (
        <FormSection label={t.drawerRole} help={t.drawerRoleHelp} error={error ?? undefined}>
          <div className="team-radios">
            {ROLES.map((r) => (
              <Radio
                key={r}
                name="team-role"
                value={r}
                checked={role === r}
                disabled={readOnly || saving || roleChangeRefusal(me, members, person, r) !== null}
                onChange={() => setRole(r)}
              >
                <span className="team-radio-text">
                  <strong>{t.roles[r]}</strong>
                  <span>{t.roleDescription[r]}</span>
                </span>
              </Radio>
            ))}
          </div>
        </FormSection>
      ) : (
        <Section label={t.drawerRole} level={3}>
          <p className="team-sign-hint">{t.roleDescription[person.role]}</p>
        </Section>
      )}

      {work ? (
        <Section
          label={t.drawerWork}
          level={3}
          right={manage ? <Button kind="quiet" size="xs" onClick={props.onOpenWeek}>{t.drawerOpenWeek}</Button> : undefined}
        >
          <KVList>
            <KV k={t.drawerOpen}>
              <span className="team-kv-val">{work.waiting > 0 ? <Tag tone="warn">{t.drawerWaiting(work.waiting, work.oldestWait)}</Tag> : null}<span className="u-mono">{work.open}</span></span>
            </KV>
            <KV k={t.drawerOrders} mono>{work.orders}</KV>
          </KVList>
        </Section>
      ) : null}
    </Drawer>
  );
}
