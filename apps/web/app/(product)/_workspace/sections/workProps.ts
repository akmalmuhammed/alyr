import type { ScreenProps } from "../screens/shared";
import type { ReadyWorkspace } from "../useWorkspace";

/** What the workspace gives each of the five working screens (Inbox, Credit accounts, Orders,
 * Bookings, Team): the language, ALYR Agent's `?show=` filter and the way back from it, and what
 * is switched on for this shop. */
export function workProps(ws: ReadyWorkspace): ScreenProps {
  return {
    lang: ws.lang, show: ws.show, modules: ws.state.modules, business: ws.state.business,
    onClearShow: () => { ws.setShow(null); ws.router.replace(`/app/${ws.section}`); },
  };
}
