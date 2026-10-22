import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { create_plan, initiate_new_setup, stream_new_setup, stream_plan } from "./src/api_handlers.ts";
import { request_logger } from "./src/request_log.ts";

const app = new Hono();

app.use(request_logger);

app.post('/setup', initiate_new_setup)
app.post('/setup/stream', stream_new_setup)
app.post('/plan', create_plan)
app.post('/plan/stream', stream_plan)

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });
console.log("API on http://localhost:3000 (requests are logged to logs/api.log, LLM calls to logs/llm.log)");
