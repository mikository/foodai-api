import { config } from "../config.ts";
import { log_llm_call } from "./log.ts";
import type { LlmClient } from "./types.ts";

// Docs: https://developers.openai.com/api/docs/guides/function-calling (Responses API)
type OutputItem = { type: string; name?: string; arguments?: string };

export const openai: LlmClient = {
  // Forces a call to `tool` with `strict: true`, so OpenAI guarantees the arguments match `tool.parameters`.
  // The schema must follow strict-mode rules: every key in `required`, `additionalProperties: false`, null for unused keys.
  async call_tool(instructions, prompt, tool) {
    const { api_key, base_url, model, reasoning_effort } = config.openai;
    const source = `openai:${model}`;
    const started_at = Date.now();

    const res = await fetch(`${base_url}/responses`, {
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
      }),
    });
    if (!res.ok) {
      const error = `OpenAI error ${res.status}: ${await res.text()}`;
      log_llm_call({ source, instructions, prompt, response: error, started_at, failed: true });
      throw new Error(error);
    }

    const data = await res.json();
    const { input_tokens, output_tokens, output_tokens_details } = data.usage ?? {};
    const usage = `tokens in ${input_tokens} / out ${output_tokens} (reasoning ${output_tokens_details?.reasoning_tokens ?? 0})`;
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
};
