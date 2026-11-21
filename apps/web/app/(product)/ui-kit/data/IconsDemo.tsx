"use client";

import { ICONS, Icon } from "../../../_ui";
import type { IconName } from "../../../_ui";
import { LEGACY_ICONS } from "../../../_ui/icons-legacy";
import type { Words } from "./copy";
import { Block, Cell } from "./shared";

const ADDED = new Set<string>(["chat", "undo", "mail"]);
const NAMES = Object.keys(ICONS) as IconName[];

/** The drawing kit's glyph, as the kit drew it: a 16 box, 1.4 line, round ends. Gallery only. */
function Old({ name }: { name: string }) {
  const d = LEGACY_ICONS[name];
  if (!d) return <span className="u-kd-none" aria-hidden="true" />;
  return (
    <svg className="u-kd-old" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split("M").filter(Boolean).map((p, i) => <path key={i} d={`M${p}`} />)}
    </svg>
  );
}

export function IconsDemo({ t }: { t: Words }) {
  return (
    <Block title={t.icons} note={t.iconsNote} id="icons">
      <div className="u-kg-grid u-kg-grid--wide">
        <Cell cap={t.iconsSizes}>
          <div className="u-kg-row u-kd-big">
            <Icon name="inbox" size="sm" />
            <Icon name="inbox" />
            <Icon name="inbox" size="lg" />
          </div>
        </Cell>
        <Cell cap={t.iconsFlip}>
          <div className="u-kg-row">
            <Icon name="left" /><Icon name="right" /><Icon name="arrow" /><Icon name="send" />
          </div>
        </Cell>
        <Cell cap={t.iconsLabelled}>
          <div className="u-kg-row"><Icon name="warn" label={t.iconsLabelled} /><Icon name="bell" /></div>
        </Cell>
      </div>
      <ul className="u-kd-icons">
        <li className="u-kd-icons-head" aria-hidden="true"><span>{t.iconsNew}</span><span>{t.iconsOld}</span><span />
        </li>
        {NAMES.map((name) => (
          <li key={name} className="u-kd-icon">
            <span className="u-kd-icon-new"><Icon name={name} /></span>
            <span className="u-kd-icon-old"><Old name={name} /></span>
            <span className="u-kd-icon-name u-mono">{name}{ADDED.has(name) ? <span className="u-kd-added"> {t.iconsAdded}</span> : null}</span>
          </li>
        ))}
      </ul>
    </Block>
  );
}
