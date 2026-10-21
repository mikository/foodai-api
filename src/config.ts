// All environment variables are read here, so the rest of the code never touches process.env.
// Values come from .env (loaded by `node --env-file-if-exists=.env`, see package.json scripts).

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Set it in api/.env (see .env.example).`);
  return value;
}

export const config = {
  llm_provider: process.env.LLM_PROVIDER ?? "openai",

  // Getters so a missing key only fails when that provider is actually used.
  backboard: {
    get api_key() {
      return required("BACKBOARD_API_KEY");
    },
    llm_provider: process.env.BACKBOARD_LLM_PROVIDER ?? "openai",
    model: process.env.BACKBOARD_MODEL ?? "gpt-5.4-nano",
    reasoning_effort: process.env.BACKBOARD_REASONING_EFFORT || undefined,
  },

  openai: {
    get api_key() {
      return required("OPENAI_API_KEY");
    },
    base_url: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    reasoning_effort: process.env.OPENAI_REASONING_EFFORT || undefined,
  },

  ollama: {
    url: process.env.OLLAMA_URL ?? "http://localhost:11434",
    model: process.env.OLLAMA_MODEL ?? "qwen3.5:9b-q4_K_M",
  },
};
