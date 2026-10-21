import { config } from "../config.ts";
import { log_llm_call } from "./log.ts";
import type { LlmClient } from "./types.ts";

// Docs: https://backboard-docs.docsalot.dev/api-reference/threads/send-message.md
const BASE_URL = "https://app.backboard.io/api";

// Settings shared by every Backboard message; `params` adds the call-specific fields (tools, json_output).
async function send_message(instructions: string, prompt: string, params: Record<string, unknown>) {
  const { api_key, llm_provider, model, reasoning_effort } = config.backboard;
  const headers = { "X-API-Key": api_key, "Content-Type": "application/json" };
  const source = `backboard:${model}`;
  const started_at = Date.now();

  const res = await fetch(`${BASE_URL}/threads/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      llm_provider,
      model_name: model,
      system_prompt: instructions,
      content: prompt,
      thinking: reasoning_effort ? { effort: reasoning_effort } : null,
      ...params,
    }),
  });
  if (!res.ok) {
    const error = `Backboard error ${res.status}: ${await res.text()}`;
    log_llm_call({ source, instructions, prompt, response: error, started_at, failed: true });
    throw new Error(error);
  }
  const data = await res.json();
  // A tool call has no text content; log the call's arguments instead.
  const response = data.content ?? JSON.stringify(data.tool_calls?.map((c: { function: unknown }) => c.function));
  log_llm_call({ source, instructions, prompt, response, started_at });

  // Every message creates a thread; these are one-off calls, so don't leave them behind.
  fetch(`${BASE_URL}/threads/${data.thread_id}`, { method: "DELETE", headers }).catch(() => {});
  return data;
}

// Asks for a JSON object reply. Backboard guarantees valid JSON, but not any particular shape.
// `json_output` is ignored when tools are sent, so this never sends any.
export async function generate_json(instructions: string, prompt: string): Promise<string> {
  const data = await send_message(instructions, prompt, { json_output: true });
  return data.content;
}

export const backboard: LlmClient = {
  async call_tool(instructions, prompt, tool) {
    // `strict` is meant to make OpenAI enforce the schema, but Backboard doesn't pass it through (tested).
    const data = await send_message(instructions, prompt, {
      tools: [{ type: "function", function: { ...tool, strict: true } }],
    });
    const call = data.tool_calls?.find((c: { function: { name: string } }) => c.function.name === tool.name);
    if (!call) throw new Error(`Model did not call ${tool.name}. It replied: ${data.content}`);
    return JSON.parse(call.function.arguments); // Backboard returns the arguments as a JSON string
  },
};
