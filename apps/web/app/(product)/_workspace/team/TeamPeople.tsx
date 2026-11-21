"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Avatar, Button, Chip, Empty, Icon, PageTitle, Panel, PanelBody, PanelFooter, PanelHeader, Search, Select, Table, Tag, Toggle,
} from "@/app/_ui";
import type { MenuItem, TableColumn } from "@/app/_ui";
import { T } from "./copy";
import type { Lang } from "./copy";
import { ROLES, filterMembers, firstName, namesWithRole, removeRefusal, roleChangeRefusal, roleCounts } from "./logic";
import type { Chip as ChipKey, Me, Member, Role } from "./logic";

export type TeamPeopleProps = {
  lang: Lang;
  shop: string;
  me: Me;
  members: Member[];
  /** True while the first load is in flight: skeleton rows at the real row height. */
  loading?: boolean;
  /** The person whose drawer is open: their row is drawn as selected. */
  openId: string | null;
  /** A drawer or a dialog is on top: the page's main button is drawn as an outline, the layer has the Volt. */
  covered: boolean;
  /** The one banner of the page, drawn under the title. */
  banner?: ReactNode;
  /** Reply signing: null until it has loaded. */
  signing: boolean | null;
  /** Ids of rows whose role is being saved. */
  saving: string[];
  /** Changes cannot be saved (no connection). */
  readOnly: boolean;
  onOpen: (id: string) => void;
  onInvite: () => void;
  onChangeRole: (id: string, role: Role) => void;
  onRemove: (id: string) => void;
  onSigning: (on: boolean) => void;
};

export function TeamPeople(props: TeamPeopleProps) {
  const { lang, shop, me, members, loading = false, openId, covered, banner, signing, saving, readOnly } = props;
  const t = T[lang];
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<ChipKey>("all");
  const manage = me.role !== "agent";
  const counts = useMemo(() => roleCounts(members), [members]);
  const shown = useMemo(() => filterMembers(members, query, chip), [members, query, chip]);
  const filtered = query.trim() !== "" || chip !== "all";

  function clear() {
    setQuery("");
    setChip("all");
  }

  const roleCell = (m: Member) => {
    const locked = roleChangeRefusal(me, members, m, m.role === "owner" ? "admin" : m.role);
    const fixed = !manage || locked !== null;
    if (fixed) {
      const why = !manage ? undefined : locked === "last_owner" ? t.lockedLastOwner : t.lockedOwnerOnly;
      return (
        <span className="team-role-locked" title={why}>
          <Icon name="lock" />
          {t.roles[m.role]}
          {why ? <span className="u-sr">{why}</span> : null}
        </span>
      );
    }
    return (
      <Select
        className="team-role-select"
        aria-label={t.roleFor(m.name)}
        value={m.role}
        disabled={readOnly || saving.includes(m.id)}
        onChange={(event) => props.onChangeRole(m.id, event.target.value as Role)}
      >
        {ROLES.map((r) => (
          <option key={r} value={r} disabled={r === "owner" && me.role !== "owner"}>{t.roles[r]}</option>
        ))}
      </Select>
    );
  };

  const columns: TableColumn<Member>[] = [
    {
      key: "person",
      header: t.colPerson,
      phone: "title",
      cell: (m) => (
        <span className="team-who">
          <Avatar name={m.name} tone={m.id === me.id ? "ink" : "subtle"} />
          <span className="team-who-text">
            <span className="team-name">
              <bdi>{m.name}</bdi>
              {m.id === me.id ? <Tag dot={false}>{t.you}</Tag> : null}
            </span>
            <bdi className="team-email u-mono" dir="ltr">{m.email}</bdi>
          </span>
        </span>
      ),
    },
    { key: "role", header: t.colRole, width: "12rem", phone: "foot", cell: roleCell },
  ];

  const rowItems = (m: Member): MenuItem[] => {
    const why = removeRefusal(me, members, m);
    return [
      { id: "open", label: t.openPerson, icon: "right", onSelect: () => props.onOpen(m.id) },
      ...(manage ? [
        { type: "separator" } as MenuItem,
        { id: "remove", label: t.removePerson, icon: "trash", tone: "bad", disabled: why !== null || readOnly, onSelect: () => props.onRemove(m.id) } as MenuItem,
      ] : []),
    ];
  };

  return (
    <div className="team-page">
      <PageTitle
        title={t.peopleTitle}
        sub={(manage ? t.peopleSub : t.peopleSubAgent)(members.length, shop)}
        right={manage ? (
          <div className="team-actions">
            <Button kind={covered || readOnly ? "line" : "volt"} disabled={readOnly} onClick={props.onInvite}>{t.invite}</Button>
          </div>
        ) : undefined}
      />
      {banner}
      <div className="team-filters">
        <Search value={query} onChange={setQuery} label={t.searchLabel} placeholder={t.searchPlaceholder} clearLabel={t.clearSearch} />
        <div className="team-chips" role="group" aria-label={t.filterLabel}>
          <Chip on={chip === "all"} count={counts.all} onClick={() => setChip("all")}>{t.chipAll}</Chip>
          <Chip on={chip === "managers"} count={counts.managers} onClick={() => setChip("managers")}>{t.chipManagers}</Chip>
          <Chip on={chip === "agents"} count={counts.agent} onClick={() => setChip("agents")}>{t.chipAgents}</Chip>
        </div>
        <span className="team-sort">{t.aToZ}</span>
      </div>
      <Panel clip>
        <Table
          caption={t.tableCaption}
          columns={columns}
          rows={shown}
          rowKey={(m) => m.id}
          activeKey={openId}
          onRowOpen={(m) => props.onOpen(m.id)}
          rowActions={{ label: t.rowActions, items: rowItems }}
          loading={loading}
          loadingLabel={t.loading}
          skeletonRows={Math.max(members.length, 6)}
          empty={filtered ? (
            <Empty title={t.filteredTitle} action={<Button kind="quiet" onClick={clear}>{t.clearFilters}</Button>}>{t.filteredText}</Empty>
          ) : undefined}
          scrollX={false}
        />
        <PanelFooter>{t.tableNote}</PanelFooter>
      </Panel>
      <div className="team-panels">
        <Panel>
          <PanelHeader title={t.signingTitle} />
          <PanelBody>
            <div className="team-sign">
              <Toggle
                checked={signing === true}
                onChange={props.onSigning}
                disabled={!manage || signing === null || readOnly}
              >
                {t.signingToggle} · {signing ? t.signingOn : t.signingOff}
              </Toggle>
              <p className="team-sign-hint">{t.signingHint}</p>
              <div className="team-sample">
                <span className="u-label">{t.signingHow}</span>
                <div className="team-bubble">
                  <p>{t.signingSample}</p>
                  {signing ? <p><bdi>{t.signingSigned(firstName(members.find((m) => m.id === me.id)?.name ?? ""))}</bdi></p> : null}
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>
        <Panel clip>
          <PanelHeader title={t.rolesTitle} />
          {ROLES.map((role) => (
            <div key={role} className="team-role-row">
              <h3>{t.roles[role]}</h3>
              <p>{t.roleSummary[role]}</p>
              <span className="u-label">{t.roleCount(counts[role], namesWithRole(members, role))}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
