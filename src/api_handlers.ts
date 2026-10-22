import { readFile } from "node:fs/promises";
import type { Context } from "hono";
import { stream } from "hono/streaming";
import { config } from "./config.ts";
import { llm, stream_tool } from "./llm/index.ts";
import { log } from "./request_log.ts";
import { build_plan_prompt, type PlanRequest } from "./plan_prompt.ts";
import { FormStreamParser } from "./tools/form_stream_parser.ts";
import { plan_screen_tool, to_plan_response } from "./tools/plan_screen.ts";
import { setup_form_tool, to_field, to_setup_response } from "./tools/setup_form.ts";

const model_instructions = await readFile(new URL("../instructions/setup_instructions", import.meta.url), "utf8");
const plan_instructions = await readFile(new URL("../instructions/plan_instructions", import.meta.url), "utf8");


export async function initiate_new_setup(c: Context) {
  const { prompt } = await c.req.json<{ prompt: string }>();
  log(`   setup prompt: ${JSON.stringify(prompt)} (provider ${config.llm_provider})`);
  const started_at = Date.now();
  try {
    const setup = to_setup_response(await llm.call_tool(model_instructions, prompt, setup_form_tool));
    log(`   setup done: ${setup.fields.length} fields, LLM took ${((Date.now() - started_at) / 1000).toFixed(1)}s`);
    return c.json(setup);
  } catch (e) {
    log(`   setup FAILED after ${((Date.now() - started_at) / 1000).toFixed(1)}s: ${(e as Error).message}`);
    return c.json({ error: (e as Error).message }, 502);
  }
}

// Same as initiate_new_setup, but sends the form piece by piece as the model writes it, one JSON object per line:
// {"type":"message","message":…}, then {"type":"field","field":…} per field, then {"type":"done","intent":…}
// or {"type":"error","error":…}. The app shows each field as soon as its line arrives.
export async function stream_new_setup(c: Context) {
  const { prompt } = await c.req.json<{ prompt: string }>();
  log(`   setup stream prompt: ${JSON.stringify(prompt)} (provider ${config.llm_provider})`);
  const started_at = Date.now();
  const seconds = () => ((Date.now() - started_at) / 1000).toFixed(1);
  c.header("Content-Type", "application/x-ndjson");

  return stream(c, async (out) => {
    const send = (event: Record<string, unknown>) => out.write(JSON.stringify(event) + "\n");
    const parser = new FormStreamParser();
    const seen = new Set<string>();
    let fields = 0;
    try {
      for await (const chunk of stream_tool(model_instructions, prompt, setup_form_tool)) {
        if (out.aborted) return; // the app left the screen; closing the loop also stops the LLM request
        for (const event of parser.push(chunk)) {
          if (event.type === "message") {
            log(`   setup stream: message after ${seconds()}s`);
            await send(event);
          } else {
            if (fields++ === 0) log(`   setup stream: first field after ${seconds()}s`);
            await send({ type: "field", field: to_field(event.field, seen) });
          }
        }
      }
      const { intent } = JSON.parse(parser.full_text);
      log(`   setup stream done: ${fields} fields after ${seconds()}s`);
      await send({ type: "done", intent });
    } catch (e) {
      log(`   setup stream FAILED after ${seconds()}s: ${(e as Error).message}`);
      await send({ type: "error", error: (e as Error).message });
    }
  });
}

// Step 3: turns the request and the form answers into the plan screen.
export async function create_plan(c: Context) {
  const request = await c.req.json<PlanRequest>();
  if (typeof request.prompt !== "string" || !Array.isArray(request.fields) || typeof request.answers !== "object") {
    return c.json({ error: "Expected { prompt, intent, fields, answers }" }, 400);
  }
  const prompt = build_plan_prompt(request);
  log(`   plan for ${JSON.stringify(request.intent)}${request.adjustment ? ` (adjust: ${request.adjustment})` : ""} (provider ${config.llm_provider})`);
  const started_at = Date.now();
  try {
    const plan = to_plan_response(await llm.call_tool(plan_instructions, prompt, plan_screen_tool));
    log(`   plan done: ${plan.blocks.map((b) => b.type).join(", ")}, LLM took ${((Date.now() - started_at) / 1000).toFixed(1)}s`);
    return c.json(plan);
  } catch (e) {
    log(`   plan FAILED after ${((Date.now() - started_at) / 1000).toFixed(1)}s: ${(e as Error).message}`);
    return c.json({ error: (e as Error).message }, 502);
  }
}
