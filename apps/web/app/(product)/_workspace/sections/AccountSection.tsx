"use client";

// Every role: their sign-in email and businesses; owners also download the data (specs/040).

import { Account } from "../Account";
import type { SectionProps } from "../sectionRegistry";

export default function AccountSection({ ws }: SectionProps) {
  return <Account lang={ws.lang} />;
}
