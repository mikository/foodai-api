import { config } from "../config.ts";
import { log_llm_call } from "./log.ts";
import type { LlmClient } from "./types.ts";

const SOURCE = `ollama:${config.ollama.model}`;

// Settings shared by every Ollama call; `params` adds the call-specific fields (messages, stream, format).
function ollama_chat(params: Record<string, unknown>) {
  return fetch(`${config.ollama.url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollama.model,
      think: false,
      // Ollama's default is 4096, which silently drops the start of longer conversations.
      // 16K is plenty for a setup conversation and leaves memory headroom on a 16 GB Mac.
      options: { num_ctx: 16384 },
      ...params,
    }),
  });
}

// Streams a plain-text reply token by token. Not part of LlmClient yet — nothing streams right now.
export async function* stream_text(instructions: string, prompt: string): AsyncGenerator<string> {
  const started_at = Date.now();
  const res = await ollama_chat({
    stream: true,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: prompt },
    ],
  });
  if (!res.ok || !res.body) {
    const error = `Ollama error ${res.status}: ${await res.text()}`;
    log_llm_call({ source: SOURCE, instructions, prompt, response: error, started_at, failed: true });
    throw new Error(error);
  }

  // Ollama streams one JSON object per line; a network chunk can end mid-line, so keep the remainder in `buffer`.
  const decoder = new TextDecoder();
  let buffer = "";
  let response = "";
  try {
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const token: string = JSON.parse(line).message?.content ?? "";
        response += token;
        if (token) yield token;
      }
    }
  } finally {
    log_llm_call({ source: SOURCE, instructions, prompt, response, started_at });
  }
}

export const ollama: LlmClient = {
  // Sends the tool's schema as `format`, which Ollama enforces while generating — but only on GGUF models
  // (e.g. qwen3.5:9b-q4_K_M). MLX models (plain qwen3.5:9b on a Mac) reject it with "structured output is unavailable".
  async call_tool(instructions, prompt, tool) {
    const system = `${instructions}\n\n${tool.description}. Respond with JSON only.`;
    const started_at = Date.now();
    const res = await ollama_chat({
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      format: tool.parameters,
    });
    if (!res.ok) {
      const error = `Ollama error ${res.status}: ${await res.text()}`;
      log_llm_call({ source: SOURCE, instructions: system, prompt, response: error, started_at, failed: true });
      throw new Error(error);
    }

    const { message } = await res.json();
    log_llm_call({ source: SOURCE, instructions: system, prompt, response: message.content, started_at });
    return JSON.parse(message.content);
  },
};
