"use client";

// The redesigned Team screens (People, This week) on the shop's real team. Every read and write
// goes through `liveSource`, which lets a failure through: a screen that cannot load says so and
// never draws sample people in its place.

import { TeamWorkbench } from "../../team/TeamWorkbench";
import { liveSource } from "../../team/teamApi";
import type { SectionProps } from "../../sectionRegistry";

export default function TeamV2Section({ ws }: SectionProps) {
  return <TeamWorkbench lang={ws.lang} shop={ws.shopName} source={liveSource} inboxHref="/app/inbox" />;
}
