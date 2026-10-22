import type { Tool } from "../llm/index.ts";

// What each key means. When to use which field type is in instructions/setup_instructions.
// Types mirror mobile/src/components/fields; keep in sync with mobile/src/types/setup.ts.

// Strict mode: every key is required and no extra keys are allowed, so each field type gets
// its own small shape with only the keys it uses. to_setup_response fills the rest with null for the app.
const string = (description: string) => ({ type: "string", description });
const nullable_string = (description: string) => ({ type: ["string", "null"], description });
const number = (description: string) => ({ type: "number", description });
const string_list = (description: string, max_items?: number) => ({
  type: "array",
  items: { type: "string" },
  minItems: 2,
  ...(max_items ? { maxItems: max_items } : {}),
  description,
});

const common = {
  id: string("Unique snake_case id within this form, e.g. food_budget"),
  label: string("Shown above the input: 1–4 words, sentence case, no units. Don't mark it optional; required covers that."),
  required: { type: "boolean", description: "true only if a plan is impossible without it" },
  hint: nullable_string("null unless it adds information the label doesn't"),
};

const OPTIONS = "Human-readable labels, e.g. Camp stove; short, mutually exclusive, ordered low → high";

// One schema per field type. `toggle` has no `required` key: a toggle always has a value.
const field_types: Record<string, { description: string; properties: Record<string, unknown> }> = {
  text: { description: "Short free text; only when nothing else fits", properties: { placeholder: nullable_string("Example input") } },
  long_text: { description: "A few sentences of free text; only when nothing else fits", properties: { placeholder: nullable_string("Example input") } },
  number_unit: {
    description: "A body measurement typed with a unit picker",
    properties: { options: string_list("Units, first is the default, e.g. [\"kg\", \"lb\"]"), placeholder: nullable_string("Example amount") },
  },
  stepper: {
    description: "A count: guests, servings, nights, meals per day",
    properties: {
      min: number("Lowest count"),
      max: number("Highest count"),
      step: number("Usually 1"),
      default: number("Where it starts; the most likely answer"),
      unit: nullable_string("Shown after the value, e.g. guests"),
    },
  },
  slider: {
    description: "Minutes or money",
    properties: {
      min: number("Lowest value"),
      max: number("Highest value"),
      step: number("Increment, e.g. 5"),
      default: number("Where it starts; the most likely answer"),
      unit: string("Shown with the value, e.g. min, $"),
    },
  },
  range: {
    description: "A budget span; starts at the full range",
    properties: {
      min: number("Lowest value"),
      max: number("Highest value"),
      step: number("Increment, e.g. 10"),
      unit: string("Shown with the values, e.g. $"),
    },
  },
  scale: {
    description: "A priority or feeling, rated from min to max",
    properties: {
      min: number("Usually 1"),
      max: number("Usually 5"),
      low_label: string("Words at the lowest end, e.g. Slow & steady"),
      high_label: string("Words at the highest end, e.g. As fast as safe"),
    },
  },
  toggle: { description: "Yes/no; hint says why it matters", properties: {} },
  segmented: {
    description: "One of 2–3 one- or two-word options",
    properties: { options: string_list("At most 14 characters each; " + OPTIONS, 3) },
  },
  chips: {
    description: "Short labels; often several can apply",
    properties: {
      options: string_list(OPTIONS + ". For restrictions, include None"),
      multiple: { type: "boolean", description: "true if more than one can be picked" },
    },
  },
  select: { description: "One of 4+ options, or long labels", properties: { options: string_list(OPTIONS, 12) } },
  cards: {
    description: "A style or mood where pictures help",
    properties: {
      cards: {
        type: "array",
        minItems: 2,
        maxItems: 6,
        items: {
          type: "object",
          required: ["value", "label", "emoji", "description"],
          additionalProperties: false,
          properties: {
            value: string("Short snake_case id"),
            label: string("1–3 words"),
            emoji: string("One emoji"),
            description: string("A few words, e.g. Pasta, risotto"),
          },
        },
      },
      multiple: { type: "boolean", description: "true if more than one can be picked" },
    },
  },
  tags: { description: "A list you can't predict, e.g. ingredients on hand", properties: { placeholder: nullable_string("Example input") } },
  date: { description: "A calendar date", properties: {} },
  time: { description: "A time of day", properties: {} },
  people_list: {
    description: "Different needs per person, e.g. who has which allergy",
    properties: { options: string_list("Per-person choices, e.g. Vegan, Nut allergy") },
  },
};

const field_schemas = Object.entries(field_types).map(([type, { description, properties }]) => {
  const { required, ...shared } = common;
  const all = { type: { type: "string", enum: [type], description }, ...shared, ...(type === "toggle" ? {} : { required }), ...properties };
  return { type: "object", required: Object.keys(all), additionalProperties: false, properties: all };
});

export const setup_form_tool: Tool = {
  name: "show_setup_form",
  description: "Show the user a short form with only the fields needed for the next step",
  parameters: {
    type: "object",
    required: ["intent", "message", "fields"],
    additionalProperties: false,
    properties: {
      intent: { type: "string", description: "Short snake_case label, e.g. weight_loss, event_dinner" },
      message: { type: "string", description: "One short sentence introducing the form. Do not list the fields." },
      fields: { type: "array", minItems: 6, maxItems: 10, items: { anyOf: field_schemas } },
    },
  },
};

// Every key the app's Field type has; keys a field's type doesn't use are sent as null.
const FIELD_KEYS = [
  "id", "label", "type", "required", "hint", "placeholder", "options", "cards",
  "multiple", "min", "max", "step", "default", "unit", "low_label", "high_label",
];

// Turns the tool's arguments into the shape the app expects (mobile/src/types/setup.ts).
// The schema can't express unique ids, so repeats get a numeric suffix.
export function to_setup_response(args: Record<string, unknown>) {
  const seen = new Set<string>();
  const fields = (args.fields as Record<string, unknown>[]).map((field) => {
    let id = String(field.id);
    for (let n = 2; seen.has(id); n++) id = `${field.id}_${n}`;
    seen.add(id);
    const filled = Object.fromEntries(FIELD_KEYS.map((key) => [key, field[key] ?? null]));
    return { ...filled, id, required: field.type === "toggle" ? false : field.required };
  });
  return { intent: args.intent, message: args.message, fields };
}
