// Reads a tool call's arguments (a JSON object) as the model writes them, and hands out each part
// as soon as it's complete:
// - `value`: a top-level key once its whole value is written, e.g. the form's message or the plan's title
// - `item`: one object inside a top-level array listed in `item_keys` (form fields, plan blocks),
//   as soon as that object closes, before the rest of the array arrives
// Strict mode makes the model write keys in schema order, so order the schema the way the screen fills in.

export type ToolStreamEvent =
  | { type: "value"; key: string; value: unknown }
  | { type: "item"; key: string; item: Record<string, unknown> };

export class ToolStreamParser {
  private text = "";
  private pos = 0; // next character of `text` to scan
  private depth = 0; // open objects/arrays
  private in_string = false;
  private escaped = false;
  private key = ""; // top-level key being read
  private reading_value = false; // between a top-level ':' and the end of its value
  private value_start = -1; // where the current top-level value starts, -1 before it does
  private string_start = 0; // where the current top-level string starts (keys and string values)
  private item_start = -1;
  private item_keys: string[];

  constructor(item_keys: string[] = []) {
    this.item_keys = item_keys;
  }

  // Adds a chunk of argument text and returns whatever became complete.
  push(chunk: string): ToolStreamEvent[] {
    this.text += chunk;
    const events: ToolStreamEvent[] = [];
    const end_value = (end: number) => {
      events.push({ type: "value", key: this.key, value: JSON.parse(this.text.slice(this.value_start, end)) });
      this.reading_value = false;
      this.value_start = -1;
    };

    for (; this.pos < this.text.length; this.pos++) {
      const ch = this.text[this.pos];
      if (this.in_string) {
        if (this.escaped) this.escaped = false;
        else if (ch === "\\") this.escaped = true;
        else if (ch === '"') {
          this.in_string = false;
          if (this.depth === 1) {
            if (this.value_start >= 0) end_value(this.pos + 1);
            else this.key = JSON.parse(this.text.slice(this.string_start, this.pos + 1));
          }
        }
        continue;
      }
      if (this.depth === 1 && this.reading_value && this.value_start < 0 && !/[\s:]/.test(ch)) this.value_start = this.pos;

      switch (ch) {
        case '"':
          this.in_string = true;
          if (this.depth === 1) this.string_start = this.pos;
          break;
        case ":":
          if (this.depth === 1) this.reading_value = true;
          break;
        case ",":
          if (this.depth === 1 && this.value_start >= 0) end_value(this.pos); // a number, boolean or null
          break;
        case "{":
        case "[":
          if (this.depth === 2 && ch === "{" && this.item_keys.includes(this.key)) this.item_start = this.pos;
          this.depth++;
          break;
        case "}":
        case "]":
          this.depth--;
          if (this.depth === 2 && this.item_start >= 0) {
            events.push({ type: "item", key: this.key, item: JSON.parse(this.text.slice(this.item_start, this.pos + 1)) });
            this.item_start = -1;
          }
          if (this.depth === 1) end_value(this.pos + 1);
          if (this.depth === 0 && this.value_start >= 0) end_value(this.pos); // last value was a number, boolean or null
          break;
      }
    }
    return events;
  }
}
