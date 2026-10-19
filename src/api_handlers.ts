import { readFile } from "node:fs/promises";
import type { Context } from "hono";
import { streamText } from "hono/streaming";
import { call_llm_json, call_llm } from "./llm.ts";
import { setup_form_tool } from "./tools/setup_form.ts"

const model_instructions = await readFile(new URL("../instructions/setup_instructions", import.meta.url), "utf8");


export async function initiate_new_setup(c: Context) {
  const { prompt } = await c.req.json<{ prompt: string }>();
  try {
    const setup = await call_llm_json(model_instructions, prompt, setup_form_tool);
    return c.json(setup);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
}