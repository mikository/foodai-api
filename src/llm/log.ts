import { appendFile, mkdir } from "node:fs/promises";

const LOG_DIR = new URL("../../logs/", import.meta.url);
const LOG_FILE = new URL("llm.log", LOG_DIR);

type LlmCall = {
  source: string; // e.g. "ollama:qwen3.5:9b-q4_K_M", "backboard:gpt-5.4-nano"
  instructions: string;
  prompt: string;
  response: string; // the raw reply, or the error message if the call failed
  started_at: number; // Date.now() before the request
  failed?: boolean;
  usage?: string; // token counts, when the provider reports them
};

// Appends one LLM call to api/logs/llm.log. Never throws: a logging problem must not break a request.
export function log_llm_call(call: LlmCall) {
  const seconds = ((Date.now() - call.started_at) / 1000).toFixed(1);
  const entry = [
    `=== ${new Date(call.started_at).toISOString()} [${call.source}] ${seconds}s${call.usage ? ` ${call.usage}` : ""}${call.failed ? " FAILED" : ""}`,
    "--- instructions",
    call.instructions,
    "--- prompt",
    call.prompt,
    "--- response",
    call.response,
    "",
    "",
  ].join("\n");

  mkdir(LOG_DIR, { recursive: true })
    .then(() => appendFile(LOG_FILE, entry))
    .catch((e) => console.error("Could not write LLM log:", e.message));
}
