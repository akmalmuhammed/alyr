// A free local port for a site server. Never 3100: the laptop's demo uses it (CLAUDE.md,
// alyr-design/verify.md). Other sessions often hold 3101 and up, so this asks the system
// rather than guessing.

import { createServer } from "node:net";

const RESERVED = new Set([3000, 3100, 8000]);

/** null when the port could be bound on that address, else the error code. */
function tryPort(port, host) {
  return new Promise((done) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => done(error.code ?? "error"));
    server.listen(port, host, () => server.close(() => done(null)));
  });
}

/** The first free port from `from` upwards, skipping the reserved ones. A port counts as
 * taken if anything holds it on 127.0.0.1 or on all IPv6 addresses (where `next dev` binds). */
export async function freePort(from = 3101) {
  for (let port = from; port < from + 200; port += 1) {
    if (RESERVED.has(port)) continue;
    if ((await tryPort(port, "127.0.0.1")) !== null) continue;
    if ((await tryPort(port, "::")) === "EADDRINUSE") continue;
    return port;
  }
  throw new Error(`no free port between ${from} and ${from + 199}`);
}

/** Refuse the ports other work depends on. */
export function assertAllowed(port) {
  if (RESERVED.has(Number(port))) {
    console.error(`port ${port} is reserved (3100 is the laptop's demo, 3000 another project, 8000 the API). Pick another, or leave --port out.`);
    process.exit(2);
  }
}
