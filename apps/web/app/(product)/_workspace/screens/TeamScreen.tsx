"use client";

// Team: who can sign in to this workspace, and adding or removing a person. Moved out of
// Screens.tsx unchanged when that file was split into one file per screen.

import { useState } from "react";
import { shopNameShown } from "../shopLedger";
import { T } from "../screensCopy";
import { ScreenFrame, useShopFacts, type ScreenProps } from "./shared";

export function TeamScreen({ lang, intro, modules, business }: ScreenProps) {
  const { me, members, canManage, summary } = useShopFacts(modules);
  const [newMember, setNewMember] = useState({ name: "", email: "", role: "agent" });
  const [teamError, setTeamError] = useState("");
  const t = T[lang];

  // The old screen looked again after a change, and on this tab that look asked for nothing:
  // the list is read by `useShopFacts`, which asks every 5 minutes. Kept as it was.
  async function teamCall(url: string, method: string, body?: object) {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    setTeamError(response.ok ? "" : String(data.detail ?? "That did not work."));
    if (response.ok) setNewMember({ name: "", email: "", role: "agent" });
  }

  return (
    <ScreenFrame lang={lang} error="" title={t.tabTeam} shop={shopNameShown(lang, summary?.shop, business)} sub={t.teamSub} intro={intro}>
      <div className="tablewrap">
        <table>
          <thead>
            <tr><th>{t.name}</th><th>{t.email}</th><th>{t.role}</th><th /></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="norow">
                <td>{m.name}</td>
                <td dir="ltr">{m.email}</td>
                <td><span className="pill none">{t.roles[m.role]}</span></td>
                <td className="r">
                  {canManage && m.id !== me?.id && (
                    <button className="btn small" onClick={() => teamCall(`/api/team/${m.id}`, "DELETE")}>{t.remove}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canManage ? (
        <form
          className="team-add"
          onSubmit={(e) => { e.preventDefault(); teamCall("/api/team", "POST", newMember); }}
        >
          <input aria-label={t.name} placeholder={t.name} required value={newMember.name}
            onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} />
          <input aria-label={t.email} placeholder={t.email} type="email" required dir="ltr" value={newMember.email}
            onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} />
          <select aria-label={t.role} value={newMember.role}
            onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}>
            {["agent", "admin", "owner"].map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
          </select>
          <button className="btn primary" type="submit">{t.addMember}</button>
        </form>
      ) : (
        <p className="empty-note">{t.teamAgent}</p>
      )}
      {teamError && <p className="error" dir="ltr" role="alert">{teamError}</p>}
    </ScreenFrame>
  );
}
