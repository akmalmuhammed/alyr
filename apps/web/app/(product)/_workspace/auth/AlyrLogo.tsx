"use client";

import React from "react";

export interface AlyrLogoProps {
  height?: number;
  className?: string;
}

/**
 * Official ALYR symbol: three sharp geometric polygons.
 * The top and bottom-left polygons take the text color (var(--text) / Carbon).
 * The bottom-right polygon is the Volt accent (var(--volt)).
 */
export function AlyrLogo({ height = 22, className }: AlyrLogoProps) {
  const width = Math.round((height * 190) / 160);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 190 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="ALYR"
    >
      <polygon fill="var(--text)" points="50,0 180,0 130,62 0,62" />
      <polygon fill="var(--text)" points="0,72 126,72 39,160" />
      <polygon fill="var(--volt)" points="134,72 190,72 142,160 46,160" />
    </svg>
  );
}
