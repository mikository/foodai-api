import type { Tool } from "../llm/index.ts";

// One entry per mobile component (mobile/src/components/fields). Keep in sync with mobile/src/types/setup.ts.
const FIELD_TYPES = `Which input to show:
text: short free text.
long_text: longer free text or notes.
number_unit: a measurement people give in different units (weight, height); options = the units, e.g. ["kg","lb"].
stepper: a small exact count (guests, servings, nights); uses min, max, step, unit.
slider: a continuous amount (minutes, money); uses min, max, step, unit.
range: a min-max pair, mostly budgets; uses min, max, step, unit.
scale: a subjective rating; uses min, max (usually 1-10), low_label, high_label.
toggle: yes/no; put why it matters in hint.
segmented: pick one of 2-3 options of one or two words each, all visible in one row.
chips: pick from short option labels; multiple says if more than one is allowed.
select: pick one of 4+ options, or options with long labels.
cards: a visual "vibe" choice; uses cards instead of options, and multiple.
tags: an open-ended list you can't predict (ingredients in the fridge).
date: an event or target date.
time: an event start or meal time.
people_list: per-person details, e.g. who has which allergy; options = what can be picked per person.`;

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
      fields: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          // Strict mode: every key is required and no extra keys are allowed; keys that don't apply to a type are null.
          required: [
            "id", "label", "type", "required", "hint", "placeholder", "options", "cards",
            "multiple", "min", "max", "step", "unit", "low_label", "high_label",
          ],
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            label: { type: "string", description: "Shown above the input. Don't mark it optional; required covers that." },
            type: {
              type: "string",
              enum: [
                "text", "long_text", "number_unit", "stepper", "slider", "range", "scale", "toggle",
                "segmented", "chips", "select", "cards", "tags", "date", "time", "people_list",
              ],
              description: FIELD_TYPES,
            },
            required: { type: "boolean" },
            hint: { type: ["string", "null"], description: "Short helper line under the field; for toggle, why it matters" },
            placeholder: { type: ["string", "null"], description: "Example input for text, long_text, tags, select; null otherwise" },
            options: {
              type: ["array", "null"],
              items: { type: "string" },
              description: "Human-readable labels shown to the user, e.g. Camp stove. Choices for segmented, chips, select; units for number_unit; per-person choices for people_list; null otherwise. Units are what people write, e.g. kg, lb, cm, ft (never snake_case).",
            },
            cards: {
              type: ["array", "null"],
              description: "Only for cards; null otherwise",
              items: {
                type: "object",
                required: ["value", "label", "emoji", "description"],
                additionalProperties: false,
                properties: {
                  value: { type: "string", description: "Short snake_case id" },
                  label: { type: "string" },
                  emoji: { type: ["string", "null"], description: "One emoji" },
                  description: { type: ["string", "null"], description: "A few words, e.g. Pasta, risotto" },
                },
              },
            },
            multiple: { type: ["boolean", "null"], description: "For chips and cards: true if more than one can be picked; null otherwise" },
            min: { type: ["number", "null"], description: "For stepper, slider, range, scale; null otherwise" },
            max: { type: ["number", "null"], description: "For stepper, slider, range, scale; null otherwise" },
            step: { type: ["number", "null"], description: "For stepper, slider, range; null otherwise" },
            unit: { type: ["string", "null"], description: "Shown after the value for stepper, slider, range, e.g. min, $, guests (plural noun or symbol); null otherwise" },
            low_label: { type: ["string", "null"], description: "For scale: human-readable words shown at the lowest end, e.g. Slow & steady; null otherwise" },
            high_label: { type: ["string", "null"], description: "For scale: human-readable words shown at the highest end; null otherwise" },
          },
        },
      },
    },
  },
};
