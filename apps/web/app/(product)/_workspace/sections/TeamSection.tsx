"use client";

import { TeamReport } from "../Team";
import { WhatsappLink } from "../WhatsappLink";
import { TeamScreen } from "../screens/TeamScreen";
import type { SectionProps } from "../sectionRegistry";
import { workProps } from "./workProps";

export default function TeamSection({ ws }: SectionProps) {
  const { state, lang } = ws;
  return (
    <TeamScreen {...workProps(ws)}
      intro={
        <>
          <TeamReport lang={lang} canManage={state.can_manage} signer={state.me.signed_in ? state.me.name : "Ali"} />
          <WhatsappLink lang={lang} role={state.me.role} modules={state.modules} signedIn={state.me.signed_in} />
        </>
      } />
  );
}
