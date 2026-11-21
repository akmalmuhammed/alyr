"use client";

import { OrdersScreen } from "../screens/OrdersScreen";
import type { SectionProps } from "../sectionRegistry";
import { workProps } from "./workProps";

export default function OrdersSection({ ws }: SectionProps) {
  return <OrdersScreen {...workProps(ws)} />;
}
