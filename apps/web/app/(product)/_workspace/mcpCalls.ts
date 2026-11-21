// The connected-apps screen's calls (ALY-292): the workspace's side of the connector,
// `/api/mcp` (routes/mcp_manage.py). Every answer is read by `mcpApi.ts`, never trusted as it comes.
// Kept apart from the parsers so those can be tested under `node --test`.

import { api } from "./catalogApi";
import { endedCount, parseOverview, parseRows } from "./mcpApi";

export const mcp = {
  overview: async () => parseOverview(await api<unknown>("/api/mcp")),
  rows: async () => parseRows(await api<unknown>("/api/mcp/activity")),
  turnOn: () => api("/api/mcp/opt-in", "POST", { understood: true }),
  pause: () => api("/api/mcp/pause", "POST", {}),
  resume: () => api("/api/mcp/resume", "POST", {}),
  endOne: (id: string) => api(`/api/mcp/grants/${encodeURIComponent(id)}`, "DELETE"),
  endAll: async () => endedCount(await api<unknown>("/api/mcp/grants/revoke-all", "POST", {})),
};
