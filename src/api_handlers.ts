import { readFile } from "node:fs/promises";
import type { Context } from "hono";
import { streamText } from "hono/streaming";
import { call_llm } from "./llm.ts";

const model_instructions = await readFile(new URL("./instructions.txt", import.meta.url), "utf8");

// POST /chat  body: { "prompt": "..." }  → streams the model's reply as plain text.
export async function chat(c: Context) {
  const { prompt } = await c.req.json<{ prompt: string }>();
  return streamText(c, async (stream) => {
    for await (const token of call_llm(model_instructions, prompt)) {
      await stream.write(token);
    }
  });
}

export async function initiate_new_setup(c: Context){
  
}