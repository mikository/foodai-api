// Calls Qwen through Ollama and yields response tokens as they arrive.
export async function* call_llm(instructions: string, prompt: string): AsyncGenerator<string> {
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen3.5:9b",
      stream: true,
      think: false,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: prompt },
      ],
    }),
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
