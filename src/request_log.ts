import { appendFile, mkdir } from "node:fs/promises";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { MiddlewareHandler } from "hono";

const LOG_DIR = new URL("../logs/", import.meta.url);
const LOG_FILE = new URL("api.log", LOG_DIR);

// Prints to the terminal and appends to api/logs/api.log. Never throws: a logging problem must not break a request.
export function log(message: string) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  mkdir(LOG_DIR, { recursive: true })
    .then(() => appendFile(LOG_FILE, `${line}\n`))
    .catch((e) => console.error("Could not write API log:", e.message));
}

// Logs every request when it arrives and when it finishes, with who sent it and how long it took.
// The arrival line shows whether a request reached the API at all (e.g. from the phone).
export const request_logger: MiddlewareHandler = async (c, next) => {
  const started_at = Date.now();
  const request = `${c.req.method} ${c.req.path} from ${getConnInfo(c).remote.address ?? "unknown"}`;
  log(`-> ${request}`);
  await next();
  log(`<- ${request} ${c.res.status} ${((Date.now() - started_at) / 1000).toFixed(1)}s`);
};
