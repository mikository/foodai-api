import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { create_plan } from "./src/api_handlers.ts";
const app = new Hono();
app.post("/plan", create_plan);
serve({ fetch: app.fetch, port: 3001 });
