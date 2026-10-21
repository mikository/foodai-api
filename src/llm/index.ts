import { config } from "../config.ts";
import { backboard } from "./backboard.ts";
import { backboard_ollama } from "./backboard_ollama.ts";
import { ollama } from "./ollama.ts";
import { openai } from "./openai.ts";
import type { LlmClient } from "./types.ts";

export type { LlmClient, Tool } from "./types.ts";

// Add a provider: implement LlmClient in its own file and register it here.
const clients: Record<string, LlmClient> = { backboard, ollama, backboard_ollama, openai };

function create_client(name: string): LlmClient {
  const client = clients[name];
  if (!client) throw new Error(`Unknown LLM_PROVIDER "${name}". Use one of: ${Object.keys(clients).join(", ")}`);
  return client;
}

export const llm = create_client(config.llm_provider);
