// Builds the plan call's prompt from step 1 and 2: the user's request plus every form answer as text.
// Deliberately simple for now: the model sees the whole form and works out the plan from it.

// What the app sends back for each field (mobile/src/types/setup.ts). Only the keys used here.
type Field = {
  id: string;
  label: string;
  type: string;
  unit: string | null;
  cards: { value: string; label: string }[] | null;
};

export type PlanRequest = {
  prompt: string;
  intent: string;
  fields: Field[];
  answers: Record<string, unknown>;
  adjustment?: string; // a quick-adjust tap, e.g. "Cheaper"
};

const CURRENCY = /^[$€£¥₴]$/;
const with_unit = (n: unknown, unit: string | null) => (!unit ? String(n) : CURRENCY.test(unit) ? `${unit}${n}` : `${n} ${unit}`);

// One answer as plain words, or null when the user left it empty.
function describe(field: Field, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  switch (field.type) {
    case "toggle":
      return value ? "Yes" : "No";
    case "stepper":
    case "slider":
      return with_unit(value, field.unit);
    case "range": {
      const [lo, hi] = value as [number, number];
      return `${with_unit(lo, field.unit)} – ${with_unit(hi, field.unit)}`;
    }
    case "number_unit": {
      const { amount, unit } = value as { amount: string; unit: string };
      return amount.trim() ? `${amount.trim()} ${unit}` : null;
    }
    case "cards": {
      const labels = (value as string[]).map((v) => field.cards?.find((c) => c.value === v)?.label ?? v);
      return labels.length ? labels.join(", ") : null;
    }
    case "people_list": {
      const people = (value as { name: string; tag: string | null }[]).filter((p) => p.name.trim());
      return people.length ? people.map((p) => `${p.name.trim()}${p.tag ? ` (${p.tag})` : ""}`).join("; ") : null;
    }
    default:
      if (Array.isArray(value)) return value.length ? value.join(", ") : null;
      return String(value);
  }
}

export function build_plan_prompt({ prompt, intent, fields, answers, adjustment }: PlanRequest): string {
  const lines = fields.map((field) => {
    const answer = describe(field, answers[field.id]);
    return `- ${field.label}: ${answer ?? "(not answered; assume something sensible and mark it assumed)"}`;
  });
  return [
    `Request: ${prompt.trim() || "(none)"}`,
    `Intent: ${intent}`,
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "Answers:",
    ...lines,
    ...(adjustment ? ["", `The user tapped "${adjustment}" on the previous plan. Re-plan in that direction and keep everything else.`] : []),
  ].join("\n");
}
