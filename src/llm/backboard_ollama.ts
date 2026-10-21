import { generate_json } from "./backboard.ts";
import { ollama } from "./ollama.ts";
import type { LlmClient } from "./types.ts";

const REFORMAT_INSTRUCTIONS = `You convert JSON into a required schema.
Keep the content exactly: same items in the same order, same labels, wording, options and units.
Only fix the structure: rename keys to the schema's names, map values to the allowed ones
(for example an unknown field type becomes the closest allowed one),
and use null for keys that do not apply. Do not add, drop or invent items.`;

// Two steps: GPT (via Backboard) writes the content, then the local model forces it into the exact schema.
// Backboard can't enforce a schema; Ollama's `format` can (on GGUF models), so the result always has the right shape.
export const backboard_ollama: LlmClient = {
  async call_tool(instructions, prompt, tool) {
    // Step 1: showing GPT the schema keeps its draft close, so step 2 only has small fixes to make.
    const draft = await generate_json(
      `${instructions}\n\n${tool.description}. Respond with a JSON object following this JSON schema:\n${JSON.stringify(tool.parameters)}`,
      prompt,
    );
    // Step 2
    return ollama.call_tool(REFORMAT_INSTRUCTIONS, draft, tool);
  },
};
