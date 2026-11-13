// The stylesheets of the workspace's sections, in the order the shell page has always loaded them
// (the order a bundler meets them from the old page's imports; shell.css last, from the shell).
//
// The sections' scripts load when a section is first opened, but their stylesheets do not: the
// workspace's CSS is global, many rules override another file's rule by coming after it, and a
// stylesheet that arrived with its section would come after `shell.css` and could win rules it
// has always lost. Keep this list in step with what the sections import, and leave new sections'
// styles out of it until they have their own prefix and nothing overrides them (that is the
// moment a stylesheet may move into its section and load with it).

import "./cost.css";
import "./bookings.css";
import "./forget.css";
import "./delivery.css";
import "./pricing.css";
import "./whatsapp.css";
import "./catalog.css";
import "./features.css";
import "./notSent.css";
import "./documents.css";
import "./discovery.css";
import "./terms.css";
import "./connect.css";
import "./mcp.css";
import "../../_agent/agent.css";
import "./account.css";
