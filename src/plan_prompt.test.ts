import assert from "node:assert/strict";
import { test } from "node:test";
import { build_plan_prompt } from "./plan_prompt.ts";

const field = (id: string, type: string, extra: { unit?: string; cards?: { value: string; label: string }[] } = {}) => ({
  id,
  label: id,
  type,
  unit: extra.unit ?? null,
  cards: extra.cards ?? null,
});

test("writes every answer as plain words", () => {
  const prompt = build_plan_prompt({
    prompt: "Camping for 4",
    intent: "camping_trip",
    fields: [
      field("people", "stepper", { unit: "people" }),
      field("budget", "range", { unit: "$" }),
      field("time", "slider", { unit: "min" }),
      field("cooler", "toggle"),
      field("weight", "number_unit"),
      field("style", "cards", { cards: [{ value: "easy", label: "Easy classics" }] }),
      field("diet", "chips"),
      field("allergies", "people_list"),
    ],
    answers: {
      people: 4,
      budget: [100, 200],
      time: 30,
      cooler: false,
      weight: { amount: " 82 ", unit: "kg" },
      style: ["easy"],
      diet: ["Vegetarian", "Gluten-free"],
      allergies: [{ id: "1", name: "Sam", tag: "Nuts" }, { id: "2", name: " ", tag: null }],
    },
  });
  for (const line of [
    "Request: Camping for 4",
    "- people: 4 people",
    "- budget: $100 – $200",
    "- time: 30 min",
    "- cooler: No",
    "- weight: 82 kg",
    "- style: Easy classics",
    "- diet: Vegetarian, Gluten-free",
    "- allergies: Sam (Nuts)",
  ]) {
    assert.ok(prompt.includes(line), `missing "${line}" in:\n${prompt}`);
  }
});

test("marks unanswered fields and adds the adjustment", () => {
  const prompt = build_plan_prompt({
    prompt: "Party",
    intent: "party",
    fields: [field("theme", "text"), field("weight", "number_unit"), field("diet", "chips")],
    answers: { theme: "", weight: { amount: "", unit: "kg" }, diet: [] },
    adjustment: "Cheaper",
  });
  assert.equal(prompt.match(/not answered/g)?.length, 3);
  assert.ok(prompt.includes('tapped "Cheaper"'));
});
