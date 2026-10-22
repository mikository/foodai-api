import assert from "node:assert/strict";
import { test } from "node:test";
import { type ToolStreamEvent, ToolStreamParser } from "./tool_stream_parser.ts";

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

// Plan-shaped: arrays and objects as plain values, items in `blocks`, numbers and booleans at the end.
const plan = {
  title: "Camping menu",
  chips: [{ label: "4 people", assumed: false }],
  blocks: [{ type: "note", tone: "info", text: "Hi" }, { type: "stat_tiles", stats: [{ value: "$1", label: "x" }] }],
  primary_action: { kind: "save", label: "Save" },
  ratio: -1.5e3,
  ok: true,
  nothing: null,
};

// Feeds `text` in random small chunks, like tokens arriving, and collects every event.
function parse_in_chunks(text: string, item_keys: string[]) {
  const parser = new ToolStreamParser(item_keys);
  const events: ToolStreamEvent[] = [];
  for (let i = 0; i < text.length; ) {
    const n = 1 + Math.floor(Math.random() * 7);
    events.push(...parser.push(text.slice(i, i + n)));
    i += n;
  }
  return events;
}

const values = (events: ToolStreamEvent[]) => Object.fromEntries(events.flatMap((e) => (e.type === "value" ? [[e.key, e.value]] : [])));
const items = (events: ToolStreamEvent[], key: string) => events.flatMap((e) => (e.type === "item" && e.key === key ? [e.item] : []));

for (const [name, data, item_key] of [
  ["form", form, "fields"],
  ["form, fields first", { fields: form.fields, message: form.message, intent: form.intent }, "fields"],
  ["plan", plan, "blocks"],
] as const) {
  for (const [style, text] of [["compact", JSON.stringify(data)], ["pretty-printed", JSON.stringify(data, null, 2)]]) {
    test(`emits every value once and each item before its array ends (${name}, ${style})`, () => {
      for (let run = 0; run < 200; run++) {
        const events = parse_in_chunks(text, [item_key]);
        assert.deepEqual(values(events), data);
        assert.deepEqual(items(events, item_key), data[item_key as keyof typeof data]);
        // Each item comes before its whole array does.
        const array_at = events.findIndex((e) => e.type === "value" && e.key === item_key);
        assert.ok(events.findLastIndex((e) => e.type === "item") < array_at);
      }
    });
  }
}
