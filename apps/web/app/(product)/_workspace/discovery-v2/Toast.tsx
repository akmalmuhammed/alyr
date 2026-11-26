// The Carbon toast after a decision: who decided and what is being sent, with Undo (and Ctrl Z)
// when the API allows it, a dismiss button and an 8-second timer line. role=status, so a screen
// reader hears it; with reduced motion the timer line is not drawn.

import { T, type D2Lang } from "./copy";
import { Ic } from "./icons";
import { Kbd } from "./parts";

export type ToastData = { id: number; title: string; body: string; undo: boolean };

export function Toast({ toast, lang, onUndo, onDismiss }: { toast: ToastData; lang: D2Lang; onUndo: () => void; onDismiss: () => void }) {
  const t = T[lang];
  return (
    <div className="d2-toast" role="status" key={toast.id}>
      <span className="d2-tk"><Ic name="check" size="sm" /></span>
      <div className="d2-tx"><b>{toast.title}</b><small>{toast.body}</small></div>
      {toast.undo ? (
        <button className="d2-tbtn" type="button" onClick={onUndo} aria-keyshortcuts="Control+Z"><Ic name="undo" size="sm" flip />{t.undo}<Kbd onCarbon>{t.toastUndoKey}</Kbd></button>
      ) : null}
      <button className="d2-tx-x" type="button" onClick={onDismiss} aria-label={t.dismiss}><Ic name="x" size="sm" /></button>
      <span className="d2-time" aria-hidden="true" />
    </div>
  );
}
