import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCK_TYPES, plan_screen_tool, to_plan_response } from "./plan_screen.ts";

test("drops unknown blocks and gives the rest ids", () => {
  const plan = to_plan_response({
    title: "Plan",
    blocks: [{ type: "note", tone: "info", text: "Hi" }, { type: "mystery" }, null, { type: "stat_tiles", stats: [] }],
  });
  assert.deepEqual(
    plan.blocks.map((b) => b.id),
    ["note_0", "stat_tiles_1"],
  );
});

test("every block schema follows strict mode: all keys required, no extras", () => {
  const check = (schema: any, path: string) => {
    if (schema?.type === "object") {
      assert.equal(schema.additionalProperties, false, path);
      assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), path);
      for (const [key, value] of Object.entries(schema.properties)) check(value, `${path}.${key}`);
    }
    if (schema?.items) check(schema.items, `${path}[]`);
    for (const option of schema?.anyOf ?? []) check(option, `${path}|`);
  };
  check(plan_screen_tool.parameters, "plan");
  const blocks = (plan_screen_tool.parameters as any).properties.blocks.items.anyOf;
  assert.deepEqual(blocks.map((b: any) => b.properties.type.enum[0]), BLOCK_TYPES);
});
