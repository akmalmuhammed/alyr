"use client";

// Security: how a member of ALYR staff opens the console (ALY-125, D-136). The authenticator app
// is set up, checked, replaced and turned off here; the words are in ../factorCopy.ts.

import { FactorPanel } from "../SecondFactor";

export default function SecurityPage() {
  return <FactorPanel />;
}
