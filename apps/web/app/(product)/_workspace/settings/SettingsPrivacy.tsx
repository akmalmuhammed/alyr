"use client";

import { Button, Icon, KV, KVList, Panel, PanelBody, PanelFooter, PanelHeader } from "@/app/_ui";
import type { SettingsCopy } from "./copy";

export function SettingsPrivacy({
  t, mayClose, onClose, closeDisabled,
}: {
  t: SettingsCopy;
  /** An owner, and the host has a real way to ask (`actions.requestClose`). Otherwise no close panel is drawn. */
  mayClose: boolean;
  onClose: () => void;
  closeDisabled: boolean;
}) {
  return (
    <div className="set-cols">
      <div className="set-col">
        <Panel clip>
          <PanelHeader title={t.dataTitle} sub={t.dataSub} />
          <div className="set-data">
            <div className="set-data-main">
              <ul className="set-includes">
                {t.dataIncludes.map((line) => (
                  <li key={line} className="set-include">
                    <Icon name="check" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="set-help">{t.dataFormat}</p>
              <p className="set-help">{t.dataLeftOut}</p>
            </div>
            <div className="set-data-facts">
              <KVList>
                <KV k={t.whoCanDownload}>{t.whoCanDownloadValue}</KV>
                <KV k={t.money}><bdi>{t.moneyValue}</bdi></KV>
                <KV k={t.limit}>{t.limitValue}</KV>
              </KVList>
            </div>
          </div>
          <PanelFooter>{t.dataRule}</PanelFooter>
        </Panel>

        <Panel>
          <PanelHeader title={t.customersTitle} sub={t.customersSub} />
          <PanelBody>
            <p className="set-help">{t.customersBody}</p>
          </PanelBody>
          <PanelFooter>{t.customersRule}</PanelFooter>
        </Panel>
      </div>

      <div className="set-col">
        {mayClose ? (
          <Panel>
            <PanelHeader title={t.closeTitle} />
            <PanelBody>
              <p className="set-help">{t.closeBody}</p>
              <div className="set-actions">
                <Button kind="bad" size="sm" onClick={onClose} disabled={closeDisabled}>{t.closeAction}</Button>
                <span className="set-note">{t.closeOwnersOnly}</span>
              </div>
            </PanelBody>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader title={t.keepsTitle} />
          <PanelBody>
            <KVList>
              <KV k={t.keptIn}>{t.keptInValue}</KV>
              <KV k={t.keepConversations}>{t.keepWhileOpen}</KV>
              <KV k={t.keepDocuments}>{t.keepWhileOpen}</KV>
              <KV k={t.keepAfter}>{t.keepAfterValue}</KV>
              <KV k={t.keepBackups}>{t.keepBackupsValue}</KV>
              <KV k={t.keepStaff}>{t.keepStaffValue}</KV>
            </KVList>
          </PanelBody>
          <PanelFooter>{t.keepsNote}</PanelFooter>
        </Panel>
      </div>
    </div>
  );
}
