export type Tool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema of the arguments the model must produce
};

// Settings shared by every Ollama call; `params` adds the call-specific fields (messages, stream, tools).
function ollama_chat(params: Record<string, unknown>) {
  return fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen3.5:9b",
      think: false,
      // Ollama's default is 4096, which silently drops the start of longer conversations.
      // 16K is plenty for a setup conversation and leaves memory headroom on a 16 GB Mac.
      options: { num_ctx: 16384 },
      ...params,
    }),
  });
}

// Calls Qwen through Ollama and yields response tokens as they arrive.
export async function* call_llm(instructions: string, prompt: string): AsyncGenerator<string> {
  const res = await ollama_chat({
    stream: true,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: prompt },
    ],
  });
  if (!res.ok || !res.body) {
    throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  }

  // Ollama streams one JSON object per line; a network chunk can end mid-line, so keep the remainder in `buffer`.
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const token: string = JSON.parse(line).message?.content ?? "";
      if (token) yield token;
    }
  }
}

// Asks the model to call `tool` and returns the call's arguments as parsed JSON.
// The arguments are NOT checked against `tool.parameters` — the caller must validate them.
export async function call_llm_json(instructions: string, prompt: string, tool: Tool): Promise<unknown> {
  const res = await ollama_chat({
    stream: false,
    messages: [
      { role: "system", content: `${instructions}\n\nAlways respond by calling the ${tool.name} tool.` },
      { role: "user", content: prompt },
    ],
    tools: [{ type: "function", function: tool }],
  });
  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  }

  const { message } = await res.json();
  const call = message.tool_calls?.find((c: { function: { name: string } }) => c.function.name === tool.name);
  if (!call) {
    throw new Error(`Model did not call ${tool.name}. It replied: ${message.content}`);
  }
  return decode_nested_json(call.function.arguments);
}

// Small models sometimes return a nested array/object as a JSON-encoded string,
// e.g. "fields": "[{...}]" instead of "fields": [{...}]. Turn those back into real values.
function decode_nested_json(args: Record<string, unknown>): Record<string, unknown> {
  const decoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    decoded[key] = typeof value === "string" && /^\s*[[{]/.test(value) ? parse_lenient(value) ?? value : value;
  }
  return decoded;
}

// JSON.parse that also drops stray closing brackets at the end, e.g. `[{...}]}` —
// the model sometimes closes the outer object inside the string.
function parse_lenient(text: string): unknown {
  let candidate = text.trim();
  while (candidate) {
    try {
      return JSON.parse(candidate);
    } catch {
      if (!/[\]}]$/.test(candidate)) return undefined;
      candidate = candidate.slice(0, -1).trimEnd();
    }
  }
  return undefined;
}
