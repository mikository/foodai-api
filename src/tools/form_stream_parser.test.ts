import assert from "node:assert/strict";
import { test } from "node:test";
import { FormStreamParser } from "./form_stream_parser.ts";

// Brackets, quotes and key names inside strings must not confuse the parser.
const form = {
  intent: "party",
  message: 'Hi "there" {not} [json], \\ ok',
  fields: [
    { id: "a", type: "cards", cards: [{ value: "v", label: "L}", emoji: "🍕", description: 'd"]' }], multiple: false },
    { id: "b", type: "chips", options: ["{", "}", "[", "]", ",", ":"], hint: "message" },
    { id: "c", type: "toggle", hint: null },
  ],
};

// Feeds `text` in random small chunks, like tokens arriving, and collects every event.
function parse_in_chunks(text: string) {
  const parser = new FormStreamParser();
  const events = [];
  for (let i = 0; i < text.length; ) {
    const n = 1 + Math.floor(Math.random() * 7);
    events.push(...parser.push(text.slice(i, i + n)));
    i += n;
  }
  return events;
}

for (const [name, text] of [
  ["compact", JSON.stringify(form)],
  ["pretty-printed", JSON.stringify(form, null, 2)],
  ["fields before message", JSON.stringify({ fields: form.fields, message: form.message, intent: form.intent })],
]) {
  test(`emits the message and each field once (${name})`, () => {
    for (let run = 0; run < 200; run++) {
      const events = parse_in_chunks(text);
      assert.deepEqual(events.filter((e) => e.type === "message"), [{ type: "message", message: form.message }]);
      assert.deepEqual(events.filter((e) => e.type === "field").map((e) => e.type === "field" && e.field), form.fields);
    }
  });
}
