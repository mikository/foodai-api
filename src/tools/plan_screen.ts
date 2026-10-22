import type { Tool } from "../llm/index.ts";

// The plan screen (step 3): a header plus a list of result blocks the app knows how to draw.
// Block types mirror mobile/src/components/presenters; keep in sync with mobile/src/types/plan.ts.
// When to use which block is in instructions/plan_instructions.

// Strict mode: every key is required and no extra keys are allowed, so each block type gets
// its own shape with only the keys it uses; optional values are nullable instead of missing.
const string = (description: string) => ({ type: "string", description });
const nullable_string = (description: string) => ({ type: ["string", "null"], description });
const number = (description: string) => ({ type: "number", description });
const boolean = (description: string) => ({ type: "boolean", description });
const one_of = (values: string[], description: string) => ({ type: "string", enum: values, description });

function object(properties: Record<string, unknown>) {
  return { type: "object", required: Object.keys(properties), additionalProperties: false, properties };
}

function list(items: unknown, min: number, max: number, description?: string) {
  return { type: "array", items, minItems: min, maxItems: max, ...(description ? { description } : {}) };
}

const title = string("Card title, 1–4 words, e.g. Shopping list");
const emoji = string("One emoji");
const badge = object({
  label: string("1–3 words, e.g. 30 min, Vegetarian, Cooler · eat first"),
  tone: one_of(["neutral", "good", "warning", "danger"], "good = safe/healthy, warning = needs attention, danger = conflicts with someone's needs"),
});

// One schema per block type.
const block_types: Record<string, { description: string; properties: Record<string, unknown> }> = {
  stat_tiles: {
    description: "2–3 headline numbers: cost, effort, amounts",
    properties: { stats: list(object({ value: string("Short, e.g. $146, ~25 min"), label: string("What it measures, e.g. per person") }), 2, 3) },
  },
  hero_number: {
    description: "One key target shown big, e.g. daily calories",
    properties: {
      title,
      value: string("Formatted number, e.g. 1,950"),
      unit: nullable_string("e.g. kcal / day"),
      caption: nullable_string("One line on how it's derived"),
      explanation: nullable_string("Shown behind 'How we got this': the method and inputs used, 1–2 sentences"),
      parts: list(object({ label: string("e.g. Protein"), value: string("e.g. 150 g"), share: number("Fraction of the whole, 0–1") }), 0, 4),
    },
  },
  item_rows: {
    description: "Dishes or items with badges; several groups become tabs (one per day or meal)",
    properties: {
      title,
      groups: list(
        object({
          label: string("Tab label, e.g. Fri, Lunch. Use 'All' when there is one group"),
          items: list(
            object({
              emoji,
              title: string("Dish or item name"),
              badges: list(badge, 0, 3),
              detail: nullable_string("Short extra, e.g. Veg: halloumi"),
              trailing: nullable_string("Right-aligned amount, e.g. 5 large, 420 kcal"),
            }),
            1,
            8,
          ),
        }),
        1,
        7,
      ),
    },
  },
  option_carousel: {
    description: "2–3 alternatives to choose between, e.g. recipes for tonight",
    properties: {
      options: list(
        object({ emoji, title: string("Name"), detail: string("e.g. 15 min · easy"), match: nullable_string("Why it fits, e.g. Uses 5/5 ingredients") }),
        2,
        3,
      ),
    },
  },
  recipe_steps: {
    description: "Numbered cooking steps for one dish",
    properties: {
      title,
      steps: list(
        object({ text: string("One instruction"), timer_minutes: { type: ["number", "null"], description: "Only when timing matters" } }),
        2,
        12,
      ),
    },
  },
  week_grid: {
    description: "What is eaten on which day of the week",
    properties: {
      title,
      days: list(
        object({
          day: string("3 letters, e.g. MON"),
          emoji,
          meal: string("1–2 words"),
          highlight: boolean("true for repeats of the main recipe"),
          note: nullable_string("e.g. ❄ freeze"),
        }),
        2,
        7,
      ),
    },
  },
  line_chart: {
    description: "A trend or projection over time, e.g. projected weight",
    properties: {
      title,
      unit: string("e.g. kg"),
      points: list(object({ value: number("Value at this point"), label: nullable_string("x-axis label, e.g. Oct; null for in-between points") }), 2, 12),
      target_label: nullable_string("Label for the last point, e.g. 74 kg · Jun 1"),
      caption: nullable_string("One line, e.g. About 0.5 kg a week"),
    },
  },
  checklist: {
    description: "Shopping or packing list grouped by section",
    properties: {
      title,
      groups: list(
        object({
          label: nullable_string("Section, e.g. Produce, Cooler; null when there is one group"),
          items: list(
            object({
              label: string("Item"),
              quantity: nullable_string("e.g. 800 g, 2 tins"),
              have: boolean("true if the user said they already have it"),
            }),
            1,
            12,
          ),
        }),
        1,
        6,
      ),
    },
  },
  timeline: {
    description: "Tasks counted back from an event date",
    properties: {
      title,
      steps: list(
        object({ when: string("e.g. Today, Thu 29, Sat 13:45"), task: string("What to do"), detail: nullable_string("Short extra") }),
        2,
        8,
      ),
    },
  },
  prep_schedule: {
    description: "Parallel cooking tasks in one session, in minutes from the start",
    properties: {
      title,
      tasks: list(
        object({
          label: string("1–3 words"),
          start: number("Minutes from the start"),
          end: number("Minutes from the start"),
          kind: one_of(["hands_on", "appliance", "hands_off"], "hands_on = chopping, stirring; appliance = oven or hob; hands_off = rice cooker, marinating"),
        }),
        2,
        8,
      ),
    },
  },
  budget_bar: {
    description: "Spend split by category against the user's budget",
    properties: {
      title,
      currency: string("Symbol, e.g. $"),
      parts: list(object({ label: string("Category"), amount: number("Estimated spend") }), 1, 6),
      min_budget: { type: ["number", "null"], description: "The user's budget range, if given" },
      max_budget: { type: ["number", "null"], description: "The user's budget range, if given" },
    },
  },
  allergy_matrix: {
    description: "Which dishes are safe for which person; use whenever someone has an allergy or restriction",
    properties: {
      dishes: list(string("Column header: the dish's emoji"), 1, 6),
      people: list(
        object({
          person: string("Name · restriction, e.g. Leo · dairy"),
          cells: list(one_of(["safe", "unsafe", "unknown"], "One per dish, same order. unknown when it depends on a product"), 1, 6),
        }),
        1,
        6,
      ),
    },
  },
  note: {
    description: "An assumption, disclaimer, tip, or problem",
    properties: {
      tone: one_of(["info", "warning", "danger"], "info = tip or disclaimer; warning = needs attention; danger = a safety issue"),
      text: string("1–2 sentences"),
    },
  },
};

export const BLOCK_TYPES = Object.keys(block_types);

const block_schemas = Object.entries(block_types).map(([type, { description, properties }]) =>
  object({ type: { type: "string", enum: [type], description }, ...properties }),
);

const action = object({
  kind: one_of(
    ["order_groceries", "order_missing", "start_plan", "start_cooking", "start_prep", "save", "share_list", "add_to_calendar"],
    "What the button does",
  ),
  label: string("Button text, 1–4 words; include the price when it spends money, e.g. Order groceries · $146"),
});

export const plan_screen_tool: Tool = {
  name: "show_plan",
  description: "Show the user their plan as a header and a list of result blocks",
  parameters: object({
    title: string("Plan title, 2–6 words, e.g. Camping menu · 3 days"),
    summary: string("One sentence on what the plan does and its key trade-off"),
    chips: list(
      object({ label: string("An input the plan is based on, 1–3 words, e.g. 4 people"), assumed: boolean("true if you assumed it rather than the user saying it") }),
      3,
      8,
    ),
    blocks: list({ anyOf: block_schemas }, 3, 8),
    adjustments: list(string("A one-tap re-plan direction, 1–3 words, e.g. Cheaper"), 3, 5),
    primary_action: action,
    secondary_action: action,
  }),
};

// Turns the tool's arguments into the shape the app expects (mobile/src/types/plan.ts).
// Providers that don't enforce the schema can send block types the app doesn't know; those are dropped.
type Block = { type: string; [key: string]: unknown };

export function to_plan_response(args: Record<string, unknown>) {
  const blocks = (Array.isArray(args.blocks) ? args.blocks : [])
    .filter((b): b is Block => BLOCK_TYPES.includes((b as Partial<Block>)?.type ?? ""))
    .map((b, i) => ({ ...b, id: `${b.type}_${i}` }));
  return { ...args, blocks };
}
