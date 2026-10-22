import { readFile } from "node:fs/promises";
import type { Context } from "hono";
import { stream } from "hono/streaming";
import { config } from "./config.ts";
import { llm, stream_tool, type Tool } from "./llm/index.ts";
import { log } from "./request_log.ts";
import { build_plan_prompt, type PlanRequest } from "./plan_prompt.ts";
import { type ToolStreamEvent, ToolStreamParser } from "./tools/tool_stream_parser.ts";
import { plan_screen_tool, to_plan_block, to_plan_response } from "./tools/plan_screen.ts";
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

type Send = (line: Record<string, unknown>) => Promise<unknown>;

// Runs a streamed tool call and answers with one JSON object per line (NDJSON) as parts complete.
// `on_event` turns each parser event into lines; the stream ends with {"type":"done", ...done()}
// or {"type":"error","error":…}.
function stream_tool_lines(
  c: Context,
  name: string,
  call: { instructions: string; prompt: string; tool: Tool; item_keys: string[] },
  on_event: (event: ToolStreamEvent, send: Send) => Promise<void>,
  done: () => Record<string, unknown> = () => ({}),
) {
  const started_at = Date.now();
  const seconds = () => ((Date.now() - started_at) / 1000).toFixed(1);
  c.header("Content-Type", "application/x-ndjson");

  return stream(c, async (out) => {
    const send: Send = (line) => out.write(JSON.stringify(line) + "\n");
    const parser = new ToolStreamParser(call.item_keys);
    let parts = 0;
    try {
      for await (const chunk of stream_tool(call.instructions, call.prompt, call.tool)) {
        if (out.aborted) return; // the app left the screen; closing the loop also stops the LLM request
        for (const event of parser.push(chunk)) {
          if (parts++ === 0) log(`   ${name} stream: first part after ${seconds()}s`);
          await on_event(event, send);
        }
      }
      log(`   ${name} stream done: ${parts} parts after ${seconds()}s`);
      await send({ type: "done", ...done() });
    } catch (e) {
      log(`   ${name} stream FAILED after ${seconds()}s: ${(e as Error).message}`);
      await send({ type: "error", error: (e as Error).message });
    }
  });
}

// Same as initiate_new_setup, but streamed: {"type":"message","message":…}, then {"type":"field","field":…}
// per field, then {"type":"done","intent":…}. The app shows each field as soon as its line arrives.
export async function stream_new_setup(c: Context) {
  const { prompt } = await c.req.json<{ prompt: string }>();
  log(`   setup stream prompt: ${JSON.stringify(prompt)} (provider ${config.llm_provider})`);
  const seen = new Set<string>();
  let intent = "";
  const call = { instructions: model_instructions, prompt, tool: setup_form_tool, item_keys: ["fields"] };
  return stream_tool_lines(
    c,
    "setup",
    call,
    async (event, send) => {
      if (event.type === "item") await send({ type: "field", field: to_field(event.item, seen) });
      else if (event.key === "message") await send({ type: "message", message: event.value });
      else if (event.key === "intent") intent = String(event.value);
    },
    () => ({ intent }),
  );
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

// Same as create_plan, but streamed. Each top-level key arrives as {"type":"set","key":…,"value":…}
// (title, summary, chips, adjustments, primary_action, secondary_action) and each block as
// {"type":"block","block":…} as soon as it's written, then {"type":"done"}.
export async function stream_plan(c: Context) {
  const request = await c.req.json<PlanRequest>();
  if (typeof request.prompt !== "string" || !Array.isArray(request.fields) || typeof request.answers !== "object") {
    return c.json({ error: "Expected { prompt, intent, fields, answers }" }, 400);
  }
  log(`   plan stream for ${JSON.stringify(request.intent)}${request.adjustment ? ` (adjust: ${request.adjustment})` : ""} (provider ${config.llm_provider})`);
  let blocks = 0;
  const call = { instructions: plan_instructions, prompt: build_plan_prompt(request), tool: plan_screen_tool, item_keys: ["blocks"] };
  return stream_tool_lines(c, "plan", call, async (event, send) => {
    if (event.type === "item") {
      const block = to_plan_block(event.item, blocks);
      if (block) {
        blocks++;
        await send({ type: "block", block });
      }
    } else if (event.key !== "blocks") {
      await send({ type: "set", key: event.key, value: event.value });
    }
  });
}
