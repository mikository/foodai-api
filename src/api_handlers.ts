import { readFile } from "node:fs/promises";
import type { Context } from "hono";
import { streamText } from "hono/streaming";
import { config } from "./config.ts";
import { llm } from "./llm/index.ts";
import { log } from "./request_log.ts";
import { setup_form_tool, to_setup_response } from "./tools/setup_form.ts"

const model_instructions = await readFile(new URL("../instructions/setup_instructions", import.meta.url), "utf8");


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