import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { initiate_new_setup } from "./src/api_handlers.ts";

const app = new Hono();

app.post('/setup', initiate_new_setup)

serve({ fetch: app.fetch, port: 3000 });
console.log("API on http://localhost:3000");
