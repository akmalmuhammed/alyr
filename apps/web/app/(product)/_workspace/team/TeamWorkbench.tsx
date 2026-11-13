"use client";

import React, { useState } from "react";
import { type Lang } from "./copy";
import { FIXTURE_MEMBERS, FIXTURE_WORK_PEOPLE } from "./fixtures";
import type { TeamMember } from "./logic";
import { TeamInviteDialog } from "./TeamInviteDialog";
import { TeamPeople } from "./TeamPeople";
import { TeamPersonDrawer } from "./TeamPersonDrawer";
import { TeamPhone } from "./TeamPhone";
import { TeamRemoveDialog } from "./TeamRemoveDialog";
import { TeamStates } from "./TeamStates";
import { TeamWeek } from "./TeamWeek";
import "./team.css";

export type TeamWorkbenchProps = {
  lang?: Lang;
  initialTab?: "people" | "week";
  initialOpenPersonId?: string | null;
  initialDialog?: "invite" | "remove" | null;
  initialRemovePersonId?: string | null;
  initialState?: "loading" | "agent" | "empty" | "offline" | "all" | null;
  isPhone?: boolean;
};

export function TeamWorkbench({
  lang = "en",
  initialTab = "people",
  initialOpenPersonId = null,
  initialDialog = null,
  initialRemovePersonId = null,
  initialState = null,
  isPhone = false,
}: TeamWorkbenchProps) {
  const [tab, setTab] = useState<"people" | "week">(initialTab);
  const [openPersonId, setOpenPersonId] = useState<string | null>(initialOpenPersonId);
  const [dialog, setDialog] = useState<"invite" | "remove" | null>(initialDialog);
  const [removePersonId, setRemovePersonId] = useState<string | null>(
    initialRemovePersonId || "yusuf"
  );
  const [signReplies, setSignReplies] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>(FIXTURE_MEMBERS);

  // If a specific state view is requested
  if (initialState) {
    return (
      <div className="team-preview-wrap">
        <TeamStates
          lang={lang}
          activeState={initialState}
          onInvite={() => setDialog("invite")}
        />
      </div>
    );
  }

  // If phone viewport is requested
  if (isPhone) {
    return (
      <div className="team-preview-wrap">
        <TeamPhone
          lang={lang}
          view={tab === "week" ? "week" : "team"}
          members={members}
          people={FIXTURE_WORK_PEOPLE}
          onOpenInvite={() => setDialog("invite")}
          onOpenPerson={(id) => setOpenPersonId(id)}
          onOpenInbox={() => setTab("week")}
          signReplies={signReplies}
          onToggleSignReplies={setSignReplies}
        />
        {dialog === "invite" && (
          <TeamInviteDialog
            lang={lang}
            onClose={() => setDialog(null)}
            onSendInvite={(name, email, role, bays) => {
              const newPerson: TeamMember = {
                id: name.toLowerCase(),
                name,
                email,
                role,
                notSignedInYet: true,
                bays,
                lastSeen: {
                  label: "Not signed in yet",
                  sub: "Invited just now",
                  tone: "warn",
                },
              };
              setMembers([...members, newPerson]);
              setDialog(null);
            }}
          />
        )}
      </div>
    );
  }

  const selectedPerson =
    openPersonId ? members.find((m) => m.id === openPersonId) || members.find((m) => m.id === "salma") : null;

  const removePerson =
    removePersonId
      ? members.find((m) => m.id === removePersonId) || members.find((m) => m.id === "yusuf")
      : members.find((m) => m.id === "yusuf")!;

  const hasOverlay = !!openPersonId || !!dialog;

  return (
    <div className="team-preview-wrap">
      {tab === "week" ? (
        <TeamWeek
          lang={lang}
          people={FIXTURE_WORK_PEOPLE}
          onOpenInbox={() => {}}
        />
      ) : (
        <TeamPeople
          lang={lang}
          members={members}
          canManage={!hasOverlay}
          onOpenPerson={(id) => setOpenPersonId(id)}
          onOpenInvite={() => setDialog("invite")}
          onOpenRoles={() => {}}
          signReplies={signReplies}
          onToggleSignReplies={setSignReplies}
        />
      )}

      {/* Drawer: Person */}
      {selectedPerson && (
        <TeamPersonDrawer
          lang={lang}
          person={selectedPerson}
          onClose={() => setOpenPersonId(null)}
          onRemove={(id) => {
            setOpenPersonId(null);
            setRemovePersonId(id);
            setDialog("remove");
          }}
          onSave={(updated) => {
            setMembers(members.map((m) => (m.id === updated.id ? updated : m)));
            setOpenPersonId(null);
          }}
        />
      )}

      {/* Modal: Invite */}
      {dialog === "invite" && (
        <TeamInviteDialog
          lang={lang}
          onClose={() => setDialog(null)}
          onSendInvite={(name, email, role, bays) => {
            const newPerson: TeamMember = {
              id: name.toLowerCase(),
              name,
              email,
              role,
              notSignedInYet: true,
              bays,
              lastSeen: {
                label: "Not signed in yet",
                sub: "Invited just now",
                tone: "warn",
              },
            };
            setMembers([...members, newPerson]);
            setDialog(null);
          }}
        />
      )}

      {/* Modal: Remove */}
      {dialog === "remove" && removePerson && (
        <TeamRemoveDialog
          lang={lang}
          person={removePerson}
          onClose={() => setDialog(null)}
          onConfirmRemove={() => {
            setMembers(members.filter((m) => m.id !== removePerson.id));
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
