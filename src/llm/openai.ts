import { config } from "../config.ts";
import { log_llm_call } from "./log.ts";
import type { LlmClient, Tool } from "./types.ts";

// Docs: https://developers.openai.com/api/docs/guides/function-calling (Responses API)
type OutputItem = { type: string; name?: string; arguments?: string };
type Usage = { input_tokens?: number; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } };

const format_usage = ({ input_tokens, output_tokens, output_tokens_details }: Usage = {}) =>
  `tokens in ${input_tokens} / out ${output_tokens} (reasoning ${output_tokens_details?.reasoning_tokens ?? 0})`;

// Forces a call to `tool` with `strict: true`, so OpenAI guarantees the arguments match `tool.parameters`.
// The schema must follow strict-mode rules: every key in `required`, `additionalProperties: false`, null for unused keys.
function request_tool_call(instructions: string, prompt: string, tool: Tool, stream: boolean) {
  const { api_key, base_url, model, reasoning_effort } = config.openai;
  return fetch(`${base_url}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions,
      input: prompt,
      tools: [{ type: "function", ...tool, strict: true }],
      tool_choice: { type: "function", name: tool.name },
      // Non-reasoning models (gpt-4.1, gpt-4o-mini) reject this, so it's left out when no effort is set.
      reasoning: reasoning_effort ? { effort: reasoning_effort } : undefined,
      store: false, // one-off calls; don't keep them on OpenAI's side
      stream,
    }),
  });
}

// Reads a server-sent events body and yields each event's parsed `data`.
async function* read_events(body: ReadableStream<Uint8Array>): AsyncGenerator<{ type: string; [key: string]: any }> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? ""; // a chunk can end mid-event
    for (const event of events) {
      const data = event.split("\n").find((line) => line.startsWith("data: "));
      if (data) yield JSON.parse(data.slice(6));
    }
  }
}

export const openai: LlmClient = {
  async call_tool(instructions, prompt, tool) {
    const source = `openai:${config.openai.model}`;
    const started_at = Date.now();

    const res = await request_tool_call(instructions, prompt, tool, false);
    if (!res.ok) {
      const error = `OpenAI error ${res.status}: ${await res.text()}`;
      log_llm_call({ source, instructions, prompt, response: error, started_at, failed: true });
      throw new Error(error);
    }

    const data = await res.json();
    const usage = format_usage(data.usage);
    const call = (data.output as OutputItem[] | undefined)?.find((item) => item.type === "function_call" && item.name === tool.name);
    if (!call?.arguments) {
      // Usually `incomplete` because max output tokens ran out during reasoning.
      const error = `Model did not call ${tool.name} (status ${data.status}${data.incomplete_details ? `, ${data.incomplete_details.reason}` : ""})`;
      log_llm_call({ source, instructions, prompt, response: error, started_at, failed: true, usage });
      throw new Error(error);
    }
    log_llm_call({ source, instructions, prompt, response: call.arguments, started_at, usage });
    return JSON.parse(call.arguments); // OpenAI returns the arguments as a JSON string
  },

  // Same request with `stream: true`; yields each `response.function_call_arguments.delta` as it arrives.
  async *stream_tool(instructions, prompt, tool) {
    const source = `openai:${config.openai.model} stream`;
    const started_at = Date.now();
    let response = "";
    let usage: string | undefined;
    let error: string | undefined;

    try {
      const res = await request_tool_call(instructions, prompt, tool, true);
      if (!res.ok || !res.body) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);

      for await (const event of read_events(res.body)) {
        if (event.type === "response.function_call_arguments.delta") {
          response += event.delta;
          yield event.delta;
        } else if (event.type === "response.completed") {
          usage = format_usage(event.response.usage);
        } else if (event.type === "response.incomplete" || event.type === "response.failed") {
          const reason = event.response.incomplete_details?.reason ?? event.response.error?.message;
          throw new Error(`Model did not finish ${tool.name} (status ${event.response.status}${reason ? `, ${reason}` : ""})`);
        } else if (event.type === "error") {
          throw new Error(`OpenAI stream error: ${event.message}`);
        }
      }
      if (!response) throw new Error(`Model did not call ${tool.name}`);
    } catch (e) {
      error = (e as Error).message;
      throw e;
    } finally {
      // Also runs if the client disconnects and the generator is closed early.
      log_llm_call({ source, instructions, prompt, response: error ?? response, started_at, failed: !!error, usage });
    }
  },
};
