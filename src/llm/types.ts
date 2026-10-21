export type Tool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema of the arguments the model must produce
};

// Every provider implements this; handlers only ever talk to an LlmClient.
export interface LlmClient {
  // Offers `tool` to the model. If the model calls it, returns the call's arguments as parsed JSON;
  // if it replies without calling it, throws. The arguments are NOT validated against `tool.parameters`.
  call_tool(instructions: string, prompt: string, tool: Tool): Promise<Record<string, unknown>>;
}
