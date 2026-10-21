import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { initiate_new_setup } from "./src/api_handlers.ts";
import { request_logger } from "./src/request_log.ts";

const app = new Hono();

app.use(request_logger);

app.post('/setup', initiate_new_setup)

serve({ fetch: app.fetch, port: 3000 });
console.log("API on http://localhost:3000 (requests are logged to logs/api.log, LLM calls to logs/llm.log)");
