// Reads the show_setup_form arguments as the model writes them, and hands out each part
// as soon as it's complete: `message` once its string closes, each field once its object closes.
// The model writes keys in schema order (intent, message, fields), so the message comes first.

export type FormStreamEvent =
  | { type: "message"; message: string }
  | { type: "field"; field: Record<string, unknown> };

export class FormStreamParser {
  private text = "";
  private pos = 0; // next character of `text` to scan
  private depth = 0; // open objects/arrays
  private in_string = false;
  private escaped = false;
  private string_start = 0;
  private last_string = ""; // most recent complete string at depth 1, to know which key comes next
  private key = ""; // key whose value is being read at depth 1
  private reading_value = false; // between a depth-1 ':' and the next ','
  private in_fields = false;
  private field_start = -1;

  // Adds a chunk of argument text and returns whatever became complete.
  push(chunk: string): FormStreamEvent[] {
    this.text += chunk;
    const events: FormStreamEvent[] = [];
    for (; this.pos < this.text.length; this.pos++) {
      const ch = this.text[this.pos];
      if (this.in_string) {
        if (this.escaped) this.escaped = false;
        else if (ch === "\\") this.escaped = true;
        else if (ch === '"') {
          this.in_string = false;
          if (this.depth === 1) {
            this.last_string = JSON.parse(this.text.slice(this.string_start, this.pos + 1));
            if (this.reading_value && this.key === "message") events.push({ type: "message", message: this.last_string });
          }
        }
        continue;
      }
      switch (ch) {
        case '"':
          this.in_string = true;
          this.string_start = this.pos;
          break;
        case ":":
          if (this.depth === 1) {
            this.key = this.last_string;
            this.reading_value = true;
          }
          break;
        case ",":
          if (this.depth === 1) this.reading_value = false;
          break;
        case "{":
        case "[":
          if (this.depth === 1 && ch === "[" && this.key === "fields") this.in_fields = true;
          if (this.in_fields && this.depth === 2 && ch === "{") this.field_start = this.pos;
          this.depth++;
          break;
        case "}":
        case "]":
          this.depth--;
          if (this.in_fields && this.depth === 2 && ch === "}") {
            events.push({ type: "field", field: JSON.parse(this.text.slice(this.field_start, this.pos + 1)) });
          }
          if (this.depth === 1 && ch === "]") this.in_fields = false;
          break;
      }
    }
    return events;
  }

  // The whole argument text so far; parse it once the stream ends for the final check.
  get full_text() {
    return this.text;
  }
}
